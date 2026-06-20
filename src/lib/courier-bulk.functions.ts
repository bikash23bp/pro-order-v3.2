import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const COURIER_PROVIDERS = ["steadfast", "pathao", "redx"] as const;
export type CourierProvider = (typeof COURIER_PROVIDERS)[number];

type Order = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_amount: number | string;
};

type Creds = { apiKey: string; secretKey: string | null; baseUrl: string | null };

const STEADFAST_DEFAULT_BASE = "https://portal.packzy.com/api/v1";

function normalizeBdPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("01")) return digits;
  if (digits.length === 13 && digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 14 && digits.startsWith("8801")) return digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return null;
}

async function steadfastCreate(o: Order, creds: Creds) {
  if (!creds.secretKey) throw new Error("Steadfast secret key missing");
  const phone = normalizeBdPhone(o.customer_phone);
  if (!phone) throw new Error(`Invalid recipient phone: ${o.customer_phone}`);
  const name = (o.customer_name ?? "").trim().slice(0, 100) || "Customer";
  const address = (o.customer_address ?? "").trim().slice(0, 250) || "N/A";
  const cod = Math.max(0, Math.round(Number(o.total_amount) || 0));
  const base = (creds.baseUrl || STEADFAST_DEFAULT_BASE).replace(/\/$/, "");
  // Prefer human-readable invoice number (e.g. INV-2026-17163) when available,
  // fall back to ORD-{order_number} for legacy rows without one.
  const invoice = (o.invoice_number && String(o.invoice_number).trim())
    ? String(o.invoice_number).trim()
    : `ORD-${o.order_number}`;

  const res = await fetch(`${base}/create_order`, {
    method: "POST",
    headers: {
      "Api-Key": creds.apiKey,
      "Secret-Key": creds.secretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invoice,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      cod_amount: cod,
    }),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok || json?.status !== 200 || !json?.consignment?.consignment_id) {
    const msg = json?.message || json?.error || `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(`Steadfast: ${msg}`);
  }
  const c = json.consignment;
  return {
    consignment_id: String(c.consignment_id),
    tracking_url: c.tracking_code ? `https://steadfast.com.bd/t/${c.tracking_code}` : `https://steadfast.com.bd/t/${c.consignment_id}`,
  };
}

async function pathaoCreate(_o: Order, _creds: Creds): Promise<{ consignment_id: string; tracking_url: string }> {
  throw new Error("Pathao API integration not implemented yet");
}
async function redxCreate(_o: Order, _creds: Creds): Promise<{ consignment_id: string; tracking_url: string }> {
  throw new Error("RedX API integration not implemented yet");
}

const HANDLERS: Record<CourierProvider, (o: Order, c: Creds) => Promise<{ consignment_id: string; tracking_url: string }>> = {
  steadfast: steadfastCreate,
  pathao: pathaoCreate,
  redx: redxCreate,
};

function resolveProvider(row: { provider: string | null; name: string | null }): CourierProvider | null {
  const v = (row.provider ?? row.name ?? "").toLowerCase();
  if (v.includes("steadfast") || v.includes("packzy")) return "steadfast";
  if (v.includes("pathao")) return "pathao";
  if (v.includes("redx")) return "redx";
  return null;
}

type CourierRow = {
  id: string;
  name: string | null;
  provider: string | null;
  api_key: string | null;
  secret_key: string | null;
  base_url: string | null;
  status: string | null;
  is_default: boolean | null;
};

export const bulkSendToCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      order_ids: z.array(z.string().uuid()).min(1).max(200),
      provider: z.enum(COURIER_PROVIDERS).optional(),
      courier_id: z.string().uuid().optional(),
    }).refine((v) => v.provider || v.courier_id, { message: "provider or courier_id required" }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load candidate couriers
    let courierRows: CourierRow[] = [];
    if (data.courier_id) {
      const { data: row, error } = await (supabaseAdmin as any)
        .from("couriers")
        .select("id, name, provider, api_key, secret_key, base_url, status, is_default")
        .eq("id", data.courier_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) courierRows = [row as CourierRow];
    } else if (data.provider) {
      const { data: rows, error } = await (supabaseAdmin as any)
        .from("couriers")
        .select("id, name, provider, api_key, secret_key, base_url, status, is_default")
        .eq("status", "active")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      courierRows = ((rows ?? []) as CourierRow[]).filter((r) => resolveProvider(r) === data.provider);
    }

    // Pick default courier (first row in is_default order) for auto-routing
    const defaultCourier = courierRows.find((r) => r.is_default) ?? (data.courier_id ? courierRows[0] : null);

    // Load orders
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, invoice_number, customer_name, customer_phone, customer_address, total_amount, consignment_id, courier_id")
      .in("id", data.order_ids);
    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errors: { id: string; error: string }[] = [];

    const courierById = new Map(courierRows.map((c) => [c.id, c] as const));

    for (const o of (orders ?? []) as (Order & { consignment_id: string | null; courier_id: string | null })[]) {
      if (o.consignment_id) {
        skipped++;
        errors.push({ id: o.id, error: "Already sent to courier" });
        continue;
      }

      // Resolve which courier this specific order should go to
      let target: CourierRow | null = null;
      if (data.courier_id) {
        target = courierRows[0] ?? null;
      } else {
        // Use order's assigned courier if it matches an active row of this provider
        if (o.courier_id && courierById.has(o.courier_id)) {
          const candidate = courierById.get(o.courier_id)!;
          if (candidate.status === "active") target = candidate;
        }
        if (!target) target = defaultCourier ?? null;
      }

      const provider = target ? resolveProvider(target) : null;
      if (!target || !target.api_key || target.status !== "active" || !provider) {
        failed++;
        errors.push({
          id: o.id,
          error: `No default ${data.provider ?? "courier"} account set. Mark one as default in Courier Settings.`,
        });
        continue;
      }

      const creds: Creds = {
        apiKey: target.api_key,
        secretKey: target.secret_key,
        baseUrl: target.base_url,
      };
      const handler = HANDLERS[provider];

      try {
        const r = await handler(o, creds);
        const { error: updErr } = await supabase
          .from("orders")
          .update({
            consignment_id: r.consignment_id,
            tracking_url: r.tracking_url,
            courier_id: target.id,
            status: "ready_to_ship" as never,
          })
          .eq("id", o.id);
        if (updErr) throw new Error(updErr.message);
        sent++;
      } catch (e) {
        failed++;
        errors.push({ id: o.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { sent, failed, skipped, total: (orders ?? []).length, errors };
  });
