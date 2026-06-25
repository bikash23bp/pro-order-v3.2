// Shared WooCommerce order-sync logic. Used by both the user-facing
// `syncWooOrders` server function and the public cron hook. Pass in the
// supabase client so the same code works with either the authenticated
// user client or the admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeUnmatchedBlock } from "./web-unmatched";

type Sb = SupabaseClient;

export type WooOrder = {
  id: number;
  number: string;
  status: string;
  total: string;
  shipping_total: string;
  discount_total: string;
  date_created: string;
  billing: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  line_items: { product_id: number; variation_id?: number; name: string; quantity: number; subtotal?: string; total: string; sku: string }[];
  customer_note: string;
  meta_data?: Array<{ key?: string; value?: unknown; display_key?: string; display_value?: unknown }>;
};

function wooCustomFieldValue(o: { meta_data?: Array<{ key?: string; value?: unknown; display_key?: string; display_value?: unknown }> }): string {
  const meta = o.meta_data ?? [];
  const hit = meta.find((m) => {
    const k = String(m.key ?? "").trim().toLowerCase().replace(/^_+/, "");
    const dk = String(m.display_key ?? "").trim().toLowerCase();
    return k === "custom" || dk === "custom";
  });
  if (!hit) return "";
  const v = hit.display_value ?? hit.value;
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v).trim();
}

function normalizePhone(raw: string | undefined | null): string | null {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  const tail = digits.slice(-11);
  return tail.length === 11 ? tail : null;
}

const INCOMPLETE_MATCH_WINDOW_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function deleteObsoleteIncompleteOrders(
  supabase: Sb,
  siteId: string,
  phone: string,
  placedAtRaw: string | undefined | null,
): Promise<number> {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return 0;
  const placedAt = parseDate(placedAtRaw);
  if (!placedAt) return 0;
  const oldestIncompleteAt = new Date(placedAt.getTime() - INCOMPLETE_MATCH_WINDOW_HOURS * HOUR_MS);
  const { data: dupIncomplete, error } = await supabase
    .from("orders")
    .select("id")
    .eq("source", "woocommerce_incomplete")
    .eq("source_site_id", siteId)
    .eq("status", "incomplete")
    .eq("phone_normalized", phoneNormalized)
    .gte("created_at", oldestIncompleteAt.toISOString())
    .lte("created_at", placedAt.toISOString());
  if (error) {
    console.error("[woo-sync incomplete lookup]", error.message);
    return 0;
  }
  const toDelete = (dupIncomplete ?? []).map((r: { id: string }) => r.id);
  if (toDelete.length === 0) return 0;
  await supabase.from("order_items").delete().in("order_id", toDelete);
  const { error: deleteErr } = await supabase.from("orders").delete().in("id", toDelete);
  if (deleteErr) {
    console.error("[woo-sync incomplete cleanup]", deleteErr.message);
    return 0;
  }
  return toDelete.length;
}

export function wooInvoiceNote(o: { customer_note?: string | null; meta_data?: Array<{ key?: string; value?: unknown; display_key?: string; display_value?: unknown }> }): string | null {
  const note = (o.customer_note ?? "").trim();
  const custom = wooCustomFieldValue(o);
  const parts: string[] = [];
  if (custom) parts.push(`Custom: ${custom}`);
  if (note) parts.push(note);
  return parts.length ? parts.join(" | ") : null;
}

export type WooSiteRow = {
  id: string;
  name: string | null;
  site_url: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  enabled: boolean;
};

export const WOO_TO_OMS_STATUS: Record<string, string> = {
  pending: "pending_web",
  "on-hold": "pending_web",
  processing: "pending_web",
  completed: "completed",
  cancelled: "cancelled",
  refunded: "returned",
  failed: "cancelled",
};

async function fetchWoo<T>(siteUrl: string, ck: string, cs: string, path: string): Promise<T> {
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3${path}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return (await res.json()) as T;
}

// Push order status back to WooCommerce. Used so that once an order has been
// pulled into the OMS (via REST sync or webhook), Woo shows it as "on-hold"
// — confirming to the merchant that OMS has taken ownership.
const TERMINAL_WOO_STATUSES = new Set(["completed", "cancelled", "refunded", "failed", "on-hold"]);
export async function setWooOrderStatus(
  siteUrl: string,
  ck: string,
  cs: string,
  orderId: number | string,
  targetStatus: string,
  currentStatus: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!siteUrl || !ck || !cs) return { ok: false, error: "Missing Woo credentials" };
  if (currentStatus === targetStatus) return { ok: true, skipped: true };
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3/orders/${orderId}`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fetchAllWoo<T>(
  siteUrl: string,
  ck: string,
  cs: string,
  basePath: string,
  perPage = 100,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const batch = await fetchWoo<T[]>(siteUrl, ck, cs, `${basePath}${sep}per_page=${perPage}&page=${page}`);
    out.push(...batch);
    if (batch.length < perPage) break;
  }
  return out;
}

export type WooSyncSummary = {
  sites: number;
  created: number;
  skipped: number;
  failed: number;
};

/**
 * Pull recent orders from each enabled WooCommerce site and insert any that
 * are not already present in the local `orders` table.
 */
export async function syncWooOrdersAll(
  supabase: Sb,
  opts: { integrationId?: string } = {},
): Promise<WooSyncSummary> {
  const q = supabase
    .from("integrations")
    .select("id, name, site_url, consumer_key, consumer_secret, enabled")
    .eq("provider", "woocommerce")
    .eq("enabled", true);
  const { data: sites, error: sErr } = opts.integrationId
    ? await q.eq("id", opts.integrationId)
    : await q;
  if (sErr) throw new Error(sErr.message);
  if (!sites || sites.length === 0) {
    return { sites: 0, created: 0, skipped: 0, failed: 0 };
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of sites as WooSiteRow[]) {
    if (!s.site_url || !s.consumer_key || !s.consumer_secret) {
      failed++;
      continue;
    }
    try {
      const orders = await fetchAllWoo<WooOrder>(
        s.site_url,
        s.consumer_key,
        s.consumer_secret,
        "/orders?status=any&orderby=date&order=desc",
        50,
        10,
      );
      const externalIds = orders.map((o) => String(o.id));
      const { data: existing } = await supabase
        .from("orders")
        .select("external_order_id")
        .eq("source", "woocommerce")
        .eq("source_site_id", s.id)
        .in("external_order_id", externalIds);
      const existingSet = new Set((existing ?? []).map((e: { external_order_id: string }) => e.external_order_id));

      const sitePrefix = `woo-${s.id.slice(0, 8)}-`;
      const allLineItems = orders.flatMap((o) => o.line_items ?? []);
      const directSkus = Array.from(
        new Set(allLineItems.map((li) => (li.sku || "").trim()).filter(Boolean)),
      );
      const fallbackSkus = Array.from(
        new Set(
          allLineItems
            .map((li) => (li.product_id ? `${sitePrefix}${li.product_id}` : null))
            .filter(Boolean),
        ),
      ) as string[];
      const allSkus = Array.from(new Set([...directSkus, ...fallbackSkus]));
      const allNames = Array.from(
        new Set(allLineItems.map((li) => (li.name || "").trim()).filter(Boolean)),
      );
      const allWooProductIds = Array.from(
        new Set(allLineItems.map((li) => li.product_id).filter(Boolean).map(String)),
      );
      const externalToProductId = new Map<string, string>();
      const skuToProductId = new Map<string, string>();
      const nameLowerToProductId = new Map<string, string>();
      if (allWooProductIds.length > 0) {
        const { data: refs } = await supabase
          .from("product_external_refs")
          .select("product_id, external_product_id, external_variant_id")
          .eq("source", "woocommerce")
          .eq("source_site_id", s.id)
          .in("external_product_id", allWooProductIds);
        for (const r of (refs ?? []) as Array<{ product_id: string; external_product_id: string; external_variant_id: string | null }>) {
          externalToProductId.set(`${r.external_product_id}:${r.external_variant_id || ""}`, r.product_id);
        }
      }
      if (allSkus.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, sku")
          .in("sku", allSkus);
        for (const p of (prods ?? []) as Array<{ id: string; sku: string }>) {
          if (p.sku) skuToProductId.set(p.sku, p.id);
        }
      }
      if (allNames.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .in("name", allNames);
        for (const p of (prods ?? []) as Array<{ id: string; name: string }>) {
          if (p.name) nameLowerToProductId.set(p.name.trim().toLowerCase(), p.id);
        }
      }

      const resolveProductId = (li: WooOrder["line_items"][number]): string | undefined => {
        if (li.product_id) {
          const exact = externalToProductId.get(`${li.product_id}:${li.variation_id || ""}`);
          if (exact) return exact;
          const base = externalToProductId.get(`${li.product_id}:`);
          if (base) return base;
        }
        const sku = (li.sku || "").trim();
        if (sku && skuToProductId.get(sku)) return skuToProductId.get(sku);
        if (li.product_id) {
          const fb = `${sitePrefix}${li.product_id}`;
          const hit = skuToProductId.get(fb);
          if (hit) return hit;
        }
        const nm = (li.name || "").trim().toLowerCase();
        if (nm) return nameLowerToProductId.get(nm);
        return undefined;
      };

      for (const o of orders) {
        const b = o.billing || ({} as WooOrder["billing"]);
        const sh = o.shipping || ({} as WooOrder["shipping"]);
        const phone = (b.phone ?? "").trim() || "—";

        if (existingSet.has(String(o.id))) {
          await deleteObsoleteIncompleteOrders(supabase, s.id, phone, o.date_created);
          skipped++;
          continue;
        }
        const name = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || "Web Customer";
        const address = [
          sh.address_1 || b.address_1,
          sh.address_2 || b.address_2,
          sh.city || b.city,
          sh.state || b.state,
          sh.postcode || b.postcode,
        ]
          .filter(Boolean)
          .join(", ");
        // Use line-item SUBTOTAL (pre-discount) so the OMS keeps the original
        // product price and represents the coupon as a single `discount_amount`.
        // Using li.total (post-discount) would double-count the coupon because
        // discount_amount is also stored separately.
        const subtotal = (o.line_items ?? []).reduce(
          (s, li) => s + Number(li.subtotal || li.total || 0),
          0,
        );

        // Compute unmatched line items (couldn't resolve to a synced product).
        // Stored as a structured JSON block so the Edit dialog can let users map them.
        const unmatched = (o.line_items ?? [])
          .map((li) => {
            if (resolveProductId(li)) return null;
            const sku = (li.sku || "").trim();
            const qty = Math.max(1, Number(li.quantity || 1));
            const unit = qty > 0 ? Number(li.subtotal || li.total || 0) / qty : 0;
            return {
              name: li.name,
              sku: sku || null,
              product_id: li.product_id ?? null,
              variation_id: li.variation_id ?? null,
              quantity: qty,
              unit_price: unit,
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
        const unmatchedBlock = unmatched.length ? serializeUnmatchedBlock(unmatched) : "";

        const { data: inserted, error } = await supabase
          .from("orders")
          .insert({
            customer_name: name,
            customer_phone: phone,
            customer_email: b.email || null,
            customer_address: address || "—",
            status: (WOO_TO_OMS_STATUS[o.status] ?? "pending_web") as "pending_web",
            subtotal,
            delivery_charge: Number(o.shipping_total || 0),
            discount_amount: Number(o.discount_total || 0),
            total_amount: Number(o.total || 0),
            source: "woocommerce",
            source_site_id: s.id,
            external_order_id: String(o.id),
            created_at: o.date_created || undefined,
            invoice_note: wooInvoiceNote(o),
            internal_note: unmatchedBlock || null,
          })
          .select("id")
          .single();
        if (error || !inserted) {
          console.error("[woo-sync orders insert]", error?.message);
          failed++;
          continue;
        }

        const items = (o.line_items ?? [])
          .map((li) => {
            const productId = resolveProductId(li);
            if (!productId) return null;
            const qty = Math.max(1, Number(li.quantity || 1));
            const unit = qty > 0 ? Number(li.subtotal || li.total || 0) / qty : 0;
            return { order_id: inserted.id, product_id: productId, quantity: qty, unit_price: unit };
          })
          .filter(
            (x): x is { order_id: string; product_id: string; quantity: number; unit_price: number } => !!x,
          );
        if (items.length > 0) {
          const { error: itErr } = await supabase.from("order_items").insert(items);
          if (itErr) console.error("[woo-sync order_items insert]", itErr.message);
        }

        // Promote: if the same shopper had an incomplete row from the WP
        // tracker for this site before this Woo order, the real order makes it
        // obsolete. Older Woo orders must not remove new abandoned carts.
        try {
          await deleteObsoleteIncompleteOrders(supabase, s.id, phone, o.date_created);
        } catch (e) {
          console.error("[woo-sync incomplete cleanup]", e);
        }

        // Flip the order in WooCommerce to "on-hold" so the merchant sees
        // OMS has taken ownership. Skip terminal/already-on-hold statuses.
        if (!TERMINAL_WOO_STATUSES.has(o.status)) {
          const push = await setWooOrderStatus(
            s.site_url,
            s.consumer_key,
            s.consumer_secret,
            o.id,
            "on-hold",
            o.status,
          );
          if (!push.ok) {
            console.error(`[woo-sync status push] order ${o.id}: ${push.error}`);
          }
        }

        created++;
      }
    } catch (e) {
      console.error(`[woo-sync orders] ${s.name}:`, e);
      failed++;
    }
  }

  return { sites: sites.length, created, skipped, failed };
}
