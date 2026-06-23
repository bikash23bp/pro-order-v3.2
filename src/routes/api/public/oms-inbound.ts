import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-OMS-Token",
  "Access-Control-Max-Age": "86400",
} as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

const PayloadSchema = z.object({
  __ping: z.literal(true).optional(),
  sender_order_no: z.string().min(1).max(100).optional(),
  sender_invoice_number: z.string().max(100).nullable().optional(),
  sender_source: z.string().max(50).nullable().optional(),
  customer: z.object({
    name: z.string().min(1).max(200),
    phone: z.string().min(1).max(50),
    email: z.string().max(200).nullable().optional(),
    address: z.string().min(1).max(1000),
  }).optional(),
  amounts: z.object({
    subtotal: z.number().nonnegative(),
    discount_amount: z.number().nonnegative().default(0),
    advance_amount: z.number().nonnegative().default(0),
    delivery_charge: z.number().nonnegative().default(0),
    total_amount: z.number().nonnegative(),
  }).optional(),
  delivery_method: z.string().max(50).nullable().optional(),
  preorder: z.boolean().optional(),
  preorder_date: z.string().nullable().optional(),
  invoice_note: z.string().max(2000).nullable().optional(),
  internal_note: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({
    product_name: z.string().min(1).max(300),
    sku: z.string().max(100).nullable().optional(),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
  })).max(200).optional(),
});

function tokenEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export const Route = createFileRoute("/api/public/oms-inbound")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const token = request.headers.get("x-oms-token") || "";
        if (!token) return json(401, { ok: false, error: "Missing X-OMS-Token header" });

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json(400, { ok: false, error: "Invalid JSON body" });
        }

        const parsed = PayloadSchema.safeParse(raw);
        if (!parsed.success) {
          return json(400, { ok: false, error: "Invalid payload", details: parsed.error.flatten() });
        }
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find matching inbound sender by token (timing-safe compare in app)
        const { data: senders, error: sErr } = await supabaseAdmin
          .from("oms_inbound_settings")
          .select("id, sender_name, api_token, active, default_courier_id")
          .eq("active", true);
        if (sErr) return json(500, { ok: false, error: "Lookup failed" });

        const matched = (senders ?? []).find((s: any) => tokenEquals(String(s.api_token), token));
        if (!matched) return json(401, { ok: false, error: "Invalid token" });

        // Ping
        if (body.__ping) {
          return json(200, { ok: true, ping: true, sender_name: matched.sender_name });
        }

        if (!body.customer || !body.amounts || !body.items || body.items.length === 0) {
          return json(400, { ok: false, error: "customer, amounts, and items are required" });
        }

        // Create order via RPC (handles order_number generation + items insert).
        // We can't easily upsert via this RPC for arbitrary items (needs product UUIDs).
        // Strategy: insert order shell, then insert items by resolving product by SKU or creating a placeholder.
        const { data: created, error: cErr } = await (supabaseAdmin as any)
          .from("orders")
          .insert({
            customer_name: body.customer.name,
            customer_phone: body.customer.phone,
            customer_email: body.customer.email ?? null,
            customer_address: body.customer.address,
            subtotal: body.amounts.subtotal,
            discount_amount: body.amounts.discount_amount,
            advance_amount: body.amounts.advance_amount,
            delivery_charge: body.amounts.delivery_charge,
            total_amount: body.amounts.total_amount,
            invoice_note: body.invoice_note ?? null,
            internal_note: body.internal_note ?? null,
            delivery_method: body.delivery_method ?? null,
            preorder: !!body.preorder,
            preorder_date: body.preorder_date ?? null,
            source: "oms",
            status: "pending",
            courier_id: (matched as any).default_courier_id ?? null,
            oms_sender_name: matched.sender_name,
            oms_sender_order_no: body.sender_order_no ?? null,
            external_order_id: body.sender_order_no ? `${matched.sender_name}#${body.sender_order_no}` : null,
          })
          .select("id, order_number")
          .single();

        if (cErr || !created) {
          return json(500, { ok: false, error: cErr?.message || "Failed to create order" });
        }

        // Batch-resolve all SKUs and names up front to avoid N round-trips per item.
        const skus = Array.from(new Set(body.items.map((i) => i.sku).filter(Boolean))) as string[];
        const names = Array.from(new Set(body.items.map((i) => i.product_name).filter(Boolean))) as string[];
        const [skuRes, nameRes] = await Promise.all([
          skus.length
            ? (supabaseAdmin as any).from("products").select("id, sku").in("sku", skus)
            : Promise.resolve({ data: [] as { id: string; sku: string }[] }),
          names.length
            ? (supabaseAdmin as any).from("products").select("id, name").in("name", names)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        const bySku = new Map<string, string>(
          ((skuRes.data ?? []) as { id: string; sku: string }[]).map((p) => [p.sku, p.id]),
        );
        const byName = new Map<string, string>(
          ((nameRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.name, p.id]),
        );

        const itemsToInsert: Array<{ order_id: string; product_id: string; quantity: number; unit_price: number }> = [];
        for (const it of body.items) {
          let productId: string | null = (it.sku && bySku.get(it.sku)) || byName.get(it.product_name) || null;
          if (!productId) {
            const { data: newProd, error: npErr } = await (supabaseAdmin as any)
              .from("products")
              .insert({
                name: it.product_name,
                sku: it.sku ?? null,
                price: it.unit_price,
              })
              .select("id")
              .single();
            if (npErr || !newProd) {
              // Skip this item if we can't create product; continue with others
              continue;
            }
            productId = newProd.id as string;
            if (it.sku) bySku.set(it.sku, productId);
            byName.set(it.product_name, productId);
          }
          itemsToInsert.push({
            order_id: created.id,
            product_id: productId,
            quantity: it.quantity,
            unit_price: it.unit_price,
          });
        }

        if (itemsToInsert.length > 0) {
          await (supabaseAdmin as any).from("order_items").insert(itemsToInsert);
        }

        // Log inbound success
        await (supabaseAdmin as any).from("oms_forward_logs").insert({
          order_id: created.id,
          destination_id: null,
          destination_name: matched.sender_name,
          direction: "inbound",
          status: "success",
          http_status: 200,
          remote_order_no: body.sender_order_no ?? null,
          payload_excerpt: JSON.stringify(body).slice(0, 1000),
        });

        return json(200, { ok: true, id: created.id, order_number: created.order_number });
      },
    },
  },
});
