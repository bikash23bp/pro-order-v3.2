import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORDER_STATUSES = [
  "pending_web",
  "processing",
  "ready_to_ship",
  "shipped",
  "completed",
  "cancelled",
  "cancel_request",
  "returned",
  "no_response",
  "fraud",
] as const;

const ItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10000),
  unit_price: z.number().min(0).max(10_000_000),
});

const CustomFieldSchema = z.object({
  key: z.string().trim().min(1).max(500),
  value: z.string().max(20000),
});

const OrderSchema = z.object({
  customer_name: z.string().trim().min(1).max(500),
  customer_phone: z.string().trim().min(3).max(64),
  customer_address: z.string().trim().min(1).max(2000),
  customer_email: z.string().trim().email().max(255).optional().nullable(),
  order_date: z.string().min(4).max(40),
  status: z.enum(ORDER_STATUSES).default("completed"),
  delivery_charge: z.number().min(0).max(1_000_000).default(0),
  items: z.array(ItemSchema).min(1).max(200),
  custom_fields: z.array(CustomFieldSchema).max(50).optional(),
  tracking_id: z.string().trim().max(500).transform((s) => s.slice(0, 200)).optional().nullable(),
  invoice_number: z.string().trim().max(2000).transform((s) => s.slice(0, 100)).optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
});

export const listProductsForImport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Page in 1000-row chunks (Supabase per-request cap) up to 5000 active products.
    const out: Array<{ id: string; name: string; sku: string | null; price: number }> = [];
    const pageSize = 1000;
    const hardCap = 5000;
    let from = 0;
    while (from < hardCap) {
      const to = Math.min(from + pageSize, hardCap) - 1;
      const { data, error } = await context.supabase
        .from("products")
        .select("id, name, sku, price")
        .eq("status", "active")
        .order("name", { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ id: string; name: string; sku: string | null; price: number }>;
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  });

export const createImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      items: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(2000),
            price: z.number().min(0).max(10_000_000).default(0),
          }),
        )
        .min(1)
        .max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const names = Array.from(new Set(data.items.map((i) => i.name.trim()).filter(Boolean)));
    const priceByName = new Map<string, number>();
    for (const it of data.items) {
      if (!priceByName.has(it.name) && it.price > 0) priceByName.set(it.name, it.price);
    }

    // Existing by exact name
    const { data: existing, error: exErr } = await supabase
      .from("products")
      .select("id, name")
      .in("name", names);
    if (exErr) throw new Error(exErr.message);
    const existingMap = new Map<string, string>();
    for (const p of (existing ?? []) as Array<{ id: string; name: string }>) {
      existingMap.set(p.name, p.id);
    }

    const toCreate = names.filter((n) => !existingMap.has(n));
    const created: Array<{ name: string; id: string }> = [];
    const errors: Array<{ name: string; message: string }> = [];

    for (let i = 0; i < toCreate.length; i++) {
      const name = toCreate[i];
      const sku = `IMP-${Date.now().toString(36)}-${i}`;
      const { data: ins, error } = await supabase
        .from("products")
        .insert({
          name,
          sku,
          price: priceByName.get(name) ?? 0,
          cost_price: 0,
          stock_quantity: 0,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !ins) {
        errors.push({ name, message: error?.message ?? "insert failed" });
      } else {
        created.push({ name, id: ins.id });
      }
    }

    const map: Record<string, string> = {};
    for (const [n, id] of existingMap) map[n] = id;
    for (const c of created) map[c.name] = c.id;
    return { map, created: created.length, existing: existingMap.size, errors };
  });

export const importLegacyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orders: z.array(OrderSchema).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Defense in depth: never let a junk date (e.g. year 46140 from a misread
    // Excel serial) reach Postgres — it rejects "timezone displacement out of range".
    const safeIso = (s: string): string => {
      try {
        const d = new Date(s);
        const y = d.getUTCFullYear();
        if (isNaN(d.getTime()) || y < 1900 || y > 2100) return new Date().toISOString();
        return d.toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    const payload = data.orders.map((o) => ({
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      customer_address: o.customer_address,
      customer_email: o.customer_email ?? "",
      order_date: safeIso(o.order_date),
      status: o.status,
      delivery_charge: o.delivery_charge,
      items: o.items,
      custom_fields: o.custom_fields ?? [],
      tracking_id: o.tracking_id ?? "",
      invoice_number: o.invoice_number ?? "",
      note: o.note ?? "",
    }));

    // Single RPC handles the whole batch inside Postgres → 1 subrequest per
    // call, regardless of batch size. Lets the client import thousands.
    const { data: rpcRes, error } = await supabase.rpc("import_legacy_orders_batch", {
      p_orders: payload,
    });
    if (error) throw new Error(error.message);

    const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
    const inserted = Number(row?.inserted ?? 0);
    const failed = Number(row?.failed ?? 0);
    const errors = (row?.errors ?? []) as Array<{ index: number; message: string }>;
    return { inserted, failed, errors };
  });

export const getOrderCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ order_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("order_custom_fields")
      .select("key, value")
      .eq("order_id", data.order_id)
      .order("key");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ key: string; value: string | null }>;
  });

export const findExistingPhoneDatePairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      pairs: z
        .array(z.object({ phone: z.string().min(1).max(64), date: z.string().min(8).max(40) }))
        .min(1)
        .max(5000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const phones = Array.from(new Set(data.pairs.map((p) => p.phone)));
    // Cover the full date range of the pairs to keep the query bounded.
    const days = data.pairs.map((p) => p.date.slice(0, 10)).filter(Boolean).sort();
    const minDay = days[0];
    const maxDay = days[days.length - 1];
    // expand maxDay by one day for inclusive end
    const endIso = new Date(new Date(maxDay + "T00:00:00Z").getTime() + 26 * 3600 * 1000).toISOString();
    const startIso = new Date(minDay + "T00:00:00Z").toISOString();

    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("customer_phone, created_at")
      .in("customer_phone", phones)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    if (error) throw new Error(error.message);

    const existing = new Set<string>();
    for (const r of (rows ?? []) as Array<{ customer_phone: string; created_at: string }>) {
      const day = (r.created_at ?? "").slice(0, 10);
      if (r.customer_phone && day) existing.add(`${r.customer_phone}|${day}`);
    }
    return Array.from(existing);
  });
