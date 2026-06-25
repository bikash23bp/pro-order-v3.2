import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
import { serializeUnmatchedBlock, writeUnmatchedToNote, type WebUnmatchedItem } from "@/lib/web-unmatched";

type WooLineItem = {
  name: string;
  sku?: string;
  product_id?: number;
  variation_id?: number;
  quantity: number;
  price?: number | string;
  total?: string;
  subtotal?: string;
};
type WooOrder = {
  id: number;
  status: string;
  total: string;
  discount_total: string;
  shipping_total: string;
  date_created?: string;
  date_created_gmt?: string;
  customer_note?: string;
  billing: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items: WooLineItem[];
  meta_data?: Array<{ key?: string; value?: unknown; display_key?: string; display_value?: unknown }>;
};

// Pull a custom checkout field named "Custom" (case-insensitive, with or
// without leading underscore) from the order's meta_data. Works for fields
// added by checkout-field plugins (CheckoutWC, Checkout Field Editor, etc.)
// as long as the field key/label is "Custom".
function extractCustomField(payload: WooOrder): string {
  const meta = payload.meta_data ?? [];
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

function buildInvoiceNote(payload: WooOrder): string | null {
  const note = (payload.customer_note ?? "").trim();
  const custom = extractCustomField(payload);
  const parts: string[] = [];
  if (custom) parts.push(`Custom: ${custom}`);
  if (note) parts.push(note);
  return parts.length ? parts.join(" | ") : null;
}

type WooProduct = {
  id: number;
  name: string;
  sku?: string;
  description?: string;
  price?: string;
  regular_price?: string;
  stock_quantity?: number | null;
  manage_stock?: boolean;
  images?: { src: string }[];
  status?: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

type LogInput = {
  status: "success" | "error";
  http_status: number;
  action?: string | null;
  external_id?: string | null;
  error?: string | null;
  payload?: unknown;
};

async function logWebhook(input: LogInput) {
  try {
    await (await getAdmin()).from("webhook_logs").insert({
      provider: "woocommerce",
      status: input.status,
      http_status: input.http_status,
      action: input.action ?? null,
      external_id: input.external_id ?? null,
      error: input.error ?? null,
      payload: (input.payload ?? null) as never,
    });
  } catch (e) {
    console.error("webhook_logs insert failed:", e);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function fail(error: string, status: number, payload?: unknown, externalId?: string) {
  await logWebhook({ status: "error", http_status: status, error, external_id: externalId, payload });
  return jsonResponse({ ok: false, error }, status);
}

function mapStatus(wcStatus: string): string {
  switch (wcStatus) {
    case "completed":
      return "completed";
    case "cancelled":
    case "refunded":
    case "failed":
      return "cancelled";
    case "processing":
    case "on-hold":
    case "pending":
    default:
      return "pending_web";
  }
}

function formatAddress(b: WooOrder["billing"]): string {
  return [b.address_1, b.address_2, b.city, b.state, b.postcode, b.country]
    .filter(Boolean)
    .join(", ");
}

function normalizePhone(raw: string | undefined | null): string | null {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  const tail = digits.slice(-11);
  return tail.length === 11 ? tail : null;
}

const INCOMPLETE_MATCH_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function deleteObsoleteIncompleteOrders(
  sourceSiteId: string,
  customerPhone: string,
  placedAtRaw: string | undefined | null,
): Promise<number> {
  const phoneNormalized = normalizePhone(customerPhone);
  if (!phoneNormalized) return 0;
  const placedAt = parseDate(placedAtRaw);
  if (!placedAt) return 0;
  const oldestIncompleteAt = new Date(placedAt.getTime() - INCOMPLETE_MATCH_WINDOW_DAYS * DAY_MS);
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("source", "woocommerce_incomplete")
    .eq("source_site_id", sourceSiteId)
    .eq("status", "incomplete")
    .eq("phone_normalized", phoneNormalized)
    .gte("created_at", oldestIncompleteAt.toISOString())
    .lte("created_at", placedAt.toISOString());
  if (error) {
    console.error("Woo incomplete lookup failed:", error);
    return 0;
  }
  const ids = (data ?? []).map((row: { id: string }) => row.id);
  if (ids.length === 0) return 0;
  await admin.from("order_items").delete().in("order_id", ids);
  const { error: deleteErr } = await admin.from("orders").delete().in("id", ids);
  if (deleteErr) {
    console.error("Woo incomplete cleanup failed:", deleteErr);
    return 0;
  }
  return ids.length;
}

async function fetchWooProduct(siteUrl: string, ck: string, cs: string, productId: number): Promise<WooProduct | null> {
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3/products/${productId}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return null;
  return (await res.json()) as WooProduct;
}

// Push the order status back to WooCommerce so the merchant can see in the
// Woo admin that the order has been received by the OMS. We intentionally
// only fire when the current Woo status differs from the target — that way
// Woo's "status change" webhook doesn't bounce back into us in a loop.
async function setWooOrderStatus(
  siteUrl: string,
  ck: string,
  cs: string,
  orderId: number,
  targetStatus: string,
  currentStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!siteUrl || !ck || !cs) return { ok: false, error: "Missing Woo credentials" };
  if (currentStatus === targetStatus) return { ok: true };
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3/orders/${orderId}`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
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

export const Route = createFileRoute("/api/public/webhooks/woocommerce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secretParam = url.searchParams.get("secret");
        const body = await request.text();

        if (!secretParam) {
          return fail("Missing secret", 401);
        }

        // Fetch all enabled WC integrations and compare in constant time.
        // Avoids the timing oracle from an indexed equality lookup on webhook_secret.
        type WcIntegration = {
          id: string;
          webhook_secret: string | null;
          enabled: boolean;
          site_url: string | null;
          consumer_key: string | null;
          consumer_secret: string | null;
        };
        const { data: integrations } = await (await getAdmin())
          .from("integrations")
          .select("id, webhook_secret, enabled, site_url, consumer_key, consumer_secret")
          .eq("provider", "woocommerce")
          .eq("enabled", true);
        const presented = Buffer.from(secretParam);
        let integration: WcIntegration | null = null;
        for (const row of (integrations ?? []) as WcIntegration[]) {
          if (!row?.webhook_secret) continue;
          const expected = Buffer.from(row.webhook_secret);
          if (expected.length === presented.length && timingSafeEqual(expected, presented)) {
            integration = row;
            // do not break — keep loop time constant w.r.t. secret position
          }
        }
        if (!integration) {
          return fail("Invalid secret", 401);
        }
        const sourceSiteId = integration.id;
        const expectedSecret = integration.webhook_secret!;

        // Optional WC HMAC signature check
        const sigHeader = request.headers.get("x-wc-webhook-signature");
        if (sigHeader) {
          const computed = createHmac("sha256", expectedSecret).update(body).digest("base64");
          if (computed !== sigHeader) {
            return fail("Invalid signature", 401);
          }
        }

        let payload: WooOrder;
        try {
          payload = JSON.parse(body) as WooOrder;
        } catch {
          return fail("Invalid JSON", 400);
        }

        if (!payload?.id || !Array.isArray(payload.line_items)) {
          return fail("Unsupported payload", 400, payload);
        }

        const externalId = String(payload.id);
        const customerName =
          `${payload.billing?.first_name ?? ""} ${payload.billing?.last_name ?? ""}`.trim() ||
          "WooCommerce Customer";
        const customerPhone = payload.billing?.phone?.trim() || `Woo-${payload.id}`;
        const customerEmail = payload.billing?.email ?? "";
        const customerAddress = formatAddress(payload.billing ?? {}) || "WooCommerce order";
        const subtotal = payload.line_items.reduce(
          (s, li) => s + Number(li.subtotal || li.total || 0),
          0,
        );
        const total = Number(payload.total || 0);
        const discount = Number(payload.discount_total || 0);
        const delivery = Number(payload.shipping_total || 0);
        const status = mapStatus(payload.status);
        const wooCreatedAt = payload.date_created ?? payload.date_created_gmt ?? null;

        // Match WC line items to local products: external Woo ID map → SKU → fallback SKU → name.
        const sitePrefix = `woo-${sourceSiteId.slice(0, 8)}-`;
        const names = Array.from(
          new Set(payload.line_items.map((li) => li.name?.trim()).filter(Boolean)),
        ) as string[];
        const namesLower = Array.from(new Set(names.map((n) => n.toLowerCase())));
        const directSkus = Array.from(
          new Set(payload.line_items.map((li) => li.sku?.trim()).filter(Boolean)),
        ) as string[];
        const fallbackSkus = Array.from(
          new Set(
            payload.line_items
              .map((li) => (li.product_id ? `${sitePrefix}${li.product_id}` : null))
              .filter(Boolean),
          ),
        ) as string[];
        const allSkus = Array.from(new Set([...directSkus, ...fallbackSkus]));
        const productIds = Array.from(
          new Set(payload.line_items.map((li) => li.product_id).filter(Boolean).map(String)),
        );

        const [externalRefsResult, productsBySkuResult, productsByNameResult] = await Promise.all([
          productIds.length
            ? (await getAdmin())
                .from("product_external_refs")
                .select("product_id, external_product_id, external_variant_id")
                .eq("source", "woocommerce")
                .eq("source_site_id", sourceSiteId)
                .in("external_product_id", productIds)
            : Promise.resolve({
                data: [] as { product_id: string; external_product_id: string; external_variant_id: string }[],
                error: null,
              }),
          allSkus.length
            ? (await getAdmin()).from("products").select("id, name, sku").in("sku", allSkus)
            : Promise.resolve({
                data: [] as { id: string; name: string; sku: string | null }[],
                error: null,
              }),
          namesLower.length
            ? (await getAdmin()).from("products").select("id, name, sku").in("name", names)
            : Promise.resolve({
                data: [] as { id: string; name: string; sku: string | null }[],
                error: null,
              }),
        ]);
        if (externalRefsResult.error || productsByNameResult.error || productsBySkuResult.error) {
          const error = externalRefsResult.error ?? productsByNameResult.error ?? productsBySkuResult.error;
          console.error("WooCommerce product mapping failed:", error);
          return fail(`Product mapping failed: ${error?.message ?? "unknown"}`, 500, payload, externalId);
        }
        const byExternal = new Map(
          (externalRefsResult.data ?? []).map((r) => [
            `${r.external_product_id}:${r.external_variant_id || ""}`,
            r.product_id,
          ]),
        );
        const bySku = new Map(
          (productsBySkuResult.data ?? []).filter((p) => p.sku).map((p) => [p.sku as string, p.id]),
        );
        const byNameLower = new Map(
          (productsByNameResult.data ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]),
        );

        const ensureWooProductMapped = async (li: WooLineItem): Promise<string | undefined> => {
          if (!li.product_id || !integration.site_url || !integration.consumer_key || !integration.consumer_secret) return undefined;
          const wp = await fetchWooProduct(integration.site_url, integration.consumer_key, integration.consumer_secret, li.product_id);
          if (!wp) return undefined;
          const sku = (wp.sku || li.sku || `${sitePrefix}${wp.id}`).trim();
          const price = Number(wp.price || wp.regular_price || li.price || 0);
          const stock = wp.manage_stock ? Number(wp.stock_quantity ?? 0) : 0;
          const image_url = wp.images?.[0]?.src ?? null;
          const { data: existingProduct } = await (await getAdmin()).from("products").select("id").eq("sku", sku).maybeSingle();
          let productId = existingProduct?.id;
          if (productId) {
            await (await getAdmin()).from("products").update({ name: wp.name || li.name, description: wp.description ?? null, price, stock_quantity: stock, image_url, status: wp.status === "publish" ? "active" : "inactive" }).eq("id", productId);
          } else {
            const { data: inserted } = await (await getAdmin()).from("products").insert({ name: wp.name || li.name, description: wp.description ?? null, sku, price, cost_price: 0, stock_quantity: stock, image_url, status: wp.status === "publish" ? "active" : "inactive" }).select("id").single();
            productId = inserted?.id;
          }
          if (!productId) return undefined;
          const rows = ["", li.variation_id ? String(li.variation_id) : ""].filter((v, i, arr) => arr.indexOf(v) === i).map((variationId) => ({ product_id: productId, source: "woocommerce", source_site_id: sourceSiteId, external_product_id: String(li.product_id), external_variant_id: variationId }));
          await (await getAdmin()).from("product_external_refs").upsert(rows, { onConflict: "source,source_site_id,external_product_id,external_variant_id" });
          byExternal.set(`${li.product_id}:`, productId);
          if (li.variation_id) byExternal.set(`${li.product_id}:${li.variation_id}`, productId);
          bySku.set(sku, productId);
          byNameLower.set((wp.name || li.name).trim().toLowerCase(), productId);
          return productId;
        };

        const resolveProductId = (li: WooLineItem): string | undefined => {
          if (li.product_id) {
            const exact = byExternal.get(`${li.product_id}:${li.variation_id || ""}`);
            if (exact) return exact;
            const base = byExternal.get(`${li.product_id}:`);
            if (base) return base;
          }
          const sku = li.sku?.trim();
          if (sku && bySku.get(sku)) return bySku.get(sku);
          if (li.product_id) {
            const fb = `${sitePrefix}${li.product_id}`;
            const hit = bySku.get(fb);
            if (hit) return hit;
          }
          const nm = li.name?.trim().toLowerCase();
          if (nm) return byNameLower.get(nm);
          return undefined;
        };

        // Split into matched (aggregated by product_id) and unmatched (kept as-is)
        const aggregated = new Map<string, { quantity: number; unit_price: number }>();
        const unmatched: WebUnmatchedItem[] = [];
        for (const li of payload.line_items) {
          const qty = Number(li.quantity) || 0;
          const unitPrice = qty > 0
            ? Number(li.subtotal || li.total || 0) / qty
            : Number(li.subtotal || li.total || li.price || 0);
          const pid = resolveProductId(li) ?? await ensureWooProductMapped(li);
          if (!pid) {
            unmatched.push({
              name: li.name,
              sku: li.sku?.trim() || null,
              product_id: li.product_id ?? null,
              variation_id: li.variation_id ?? null,
              quantity: Math.max(1, qty),
              unit_price: unitPrice,
            });
            continue;
          }
          const prev = aggregated.get(pid);
          if (prev) prev.quantity += qty;
          else aggregated.set(pid, { quantity: qty, unit_price: unitPrice });
        }

        const unmatchedBlock = unmatched.length
          ? `\n${serializeUnmatchedBlock(unmatched)}`
          : "";

        // Read existing internal_note (if any) so we can preserve user text
        // and only rewrite the unmatched block. Then hand everything to a
        // single atomic RPC so order + items succeed or fail together.
        const { data: existing } = await (await getAdmin())
          .from("orders")
          .select("id, internal_note")
          .eq("source", "woocommerce")
          .eq("external_order_id", externalId)
          .maybeSingle();

        const { data: webSource } = await (await getAdmin())
          .from("order_sources")
          .select("id")
          .eq("name", "Web")
          .maybeSingle();

        const internalNoteUpdate = existing
          ? writeUnmatchedToNote(existing.internal_note, unmatched)
          : "";
        // Keep internal note clean: only surface unmatched-item info when present.
        // Do NOT include "WooCommerce #<id>", session IDs, or event IDs — those are
        // available elsewhere and clutter the visible note. Customer-facing note
        // (Custom field + customer_note) is set via p_invoice_note above.
        const internalNoteCreate = unmatchedBlock ? unmatchedBlock.replace(/^\n/, "") : "";

        const itemsJson = Array.from(aggregated.entries()).map(([product_id, v]) => ({
          product_id,
          variant_id: "",
          quantity: v.quantity,
          unit_price: v.unit_price,
        }));

        const { data: rpcRows, error: rpcErr } = await (await getAdmin()).rpc(
          "upsert_woo_order_with_items",
          {
            p_external_id: externalId,
            p_source_site_id: sourceSiteId,
            p_customer_name: customerName,
            p_customer_phone: customerPhone,
            p_customer_email: customerEmail,
            p_customer_address: customerAddress,
            p_subtotal: subtotal,
            p_total: total,
            p_discount: discount,
            p_delivery: delivery,
            p_invoice_note: buildInvoiceNote(payload),
            p_internal_note_create: internalNoteCreate,
            p_internal_note_update: internalNoteUpdate,
            p_order_source_id: webSource?.id ?? null,
            p_items: itemsJson as never,
            p_status: status as never,
          } as never,
        );

        if (rpcErr || !rpcRows || (Array.isArray(rpcRows) && rpcRows.length === 0)) {
          console.error("WooCommerce atomic upsert failed:", rpcErr);
          return fail(
            `Order sync failed: ${rpcErr?.message ?? "unknown"}`,
            500,
            payload,
            externalId,
          );
        }

        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        const orderId = (row as { order_id: string }).order_id;
        const action = (row as { action: "created" | "updated" }).action;
        const itemRows = itemsJson;
        const parsedWooCreatedAt = parseDate(wooCreatedAt);
        if (action === "created" && parsedWooCreatedAt) {
          await (await getAdmin())
            .from("orders")
            .update({ created_at: parsedWooCreatedAt.toISOString() })
            .eq("id", orderId);
        }
        const removedItems = await deleteObsoleteIncompleteOrders(sourceSiteId, customerPhone, wooCreatedAt);

        // Push status back to WooCommerce as "on-hold" so the merchant can
        // confirm in the Woo admin that the order has been pulled into the
        // OMS. We only flip it when Woo's current status isn't already
        // on-hold (prevents an infinite webhook loop) and we skip when the
        // order is already in a terminal state we shouldn't override.
        let wooStatusPush: { ok: boolean; error?: string; skipped?: boolean } = { ok: true, skipped: true };
        const terminalWooStatuses = new Set(["completed", "cancelled", "refunded", "failed"]);
        if (
          integration.site_url &&
          integration.consumer_key &&
          integration.consumer_secret &&
          !terminalWooStatuses.has(payload.status)
        ) {
          const res = await setWooOrderStatus(
            integration.site_url,
            integration.consumer_key,
            integration.consumer_secret,
            payload.id,
            "on-hold",
            payload.status,
          );
          wooStatusPush = res;
          if (!res.ok) {
            console.error("Woo status push failed:", res.error);
          }
        }

        await logWebhook({
          status: "success",
          http_status: 200,
          action,
          external_id: externalId,
        });

        return jsonResponse({
          ok: true,
          action,
          id: orderId,
          items: itemRows.length,
          removed_incomplete_orders: removedItems,
          skipped_unmatched: Math.max(0, payload.line_items.length - aggregated.size),
          woo_status_push: wooStatusPush,
        });
      },
    },
  },
});
