// Shared courier-status sync logic. Usable from both a `createServerFn`
// (with the authenticated client) and the public cron hook (with the
// admin client). Pass in the supabase client to keep this isomorphic.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Sb = SupabaseClient;

type OrderRow = {
  id: string;
  status: string;
  consignment_id: string | null;
  courier_id: string | null;
  internal_note: string | null;
  courier_status: string | null;
};

type CourierRow = {
  id: string;
  name: string;
  base_url: string | null;
  api_key: string | null;
  secret_key: string | null;
  is_default?: boolean | null;
  status?: string | null;
};

export type SyncResult = {
  orderId: string;
  ok: boolean;
  changed: boolean;
  oldStatus?: string;
  newStatus?: string;
  delivery_status?: string;
  provider?: string;
  error?: string;
};

const STEADFAST_DEFAULT_BASE = "https://portal.packzy.com/api/v1";

async function writeAuditLog(row: {
  order_id: string;
  courier_id: string | null;
  provider: string | null;
  consignment_id: string | null;
  delivery_status: string | null;
  old_status: string | null;
  new_status: string | null;
  old_courier_status: string | null;
  new_courier_status: string | null;
  changed: boolean;
  ok: boolean;
  error: string | null;
  raw_response: unknown;
}): Promise<void> {
  try {
    await supabaseAdmin.from("courier_sync_audit").insert(row as never);
  } catch {
    // Never let audit failures break the sync flow.
  }
}

function detectProvider(name: string | null | undefined): "steadfast" | "pathao" | "redx" | "unknown" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("steadfast") || n.includes("packzy")) return "steadfast";
  if (n.includes("pathao")) return "pathao";
  if (n.includes("redx")) return "redx";
  return "unknown";
}

// Map Steadfast delivery_status → { orderStatus, courierStatus }.
// - orderStatus set → move the order to a terminal state (completed/returned)
//   and clear courier_status.
// - courierStatus set (orderStatus null) → keep order.status as-is, store the
//   raw courier state so the "Steadfast" pipeline tab can surface it.
function mapSteadfastStatus(deliveryStatus: string): {
  orderStatus: "completed" | "returned" | null;
  courierStatus: string | null;
} {
  switch (deliveryStatus) {
    case "delivered":
    case "partial_delivered":
      return { orderStatus: "completed", courierStatus: null };
    case "cancelled":
    case "lost":
      return { orderStatus: "returned", courierStatus: null };
    case "in_review":
    case "pending":
    case "hold":
    case "delivered_approval_pending":
    case "partial_delivered_approval_pending":
    case "cancelled_approval_pending":
    case "unknown_approval_pending":
      return { orderStatus: null, courierStatus: deliveryStatus };
    default:
      return { orderStatus: null, courierStatus: null };
  }
}

async function fetchSteadfastStatus(
  baseUrl: string,
  apiKey: string,
  secretKey: string,
  consignmentId: string,
): Promise<{ ok: true; delivery_status: string; raw: unknown } | { ok: false; error: string; statusCode?: number; raw: unknown }> {
  const url = `${baseUrl.replace(/\/$/, "")}/status_by_cid/${encodeURIComponent(consignmentId)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const r = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Api-Key": apiKey,
        "Secret-Key": secretKey,
      },
    }).finally(() => clearTimeout(timeout));
    const text = await r.text();
    let json: { status?: number | string; delivery_status?: string; message?: string } = {};
    try { json = JSON.parse(text); } catch { /* keep raw */ }
    const raw: unknown = Object.keys(json).length ? json : { body: text.slice(0, 500) };
    if (!r.ok) {
      return { ok: false, error: json.message ?? `HTTP ${r.status}: ${text.slice(0, 200)}`, statusCode: r.status, raw };
    }
    if (!json.delivery_status) {
      return { ok: false, error: `No delivery_status in response: ${text.slice(0, 200)}`, raw };
    }
    return { ok: true, delivery_status: json.delivery_status, raw };
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}`, raw: null };
  }
}

async function getFallbackSteadfastCourier(excludeCourierId?: string | null): Promise<CourierRow | null> {
  const { data } = await supabaseAdmin
    .from("couriers")
    .select("id, name, base_url, api_key, secret_key, is_default, status")
    .or("name.ilike.%steadfast%,name.ilike.%packzy%")
    .eq("status", "active");

  const list = (data ?? []) as CourierRow[];
  return (
    list.find((c) => c.is_default && c.id !== excludeCourierId)
    ?? list.find((c) => c.id !== excludeCourierId)
    ?? list.find((c) => c.is_default)
    ?? list[0]
    ?? null
  );
}

export async function syncOneOrder(supabase: Sb, orderId: string): Promise<SyncResult> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, consignment_id, courier_id, internal_note, courier_status")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();
  if (error) return { orderId, ok: false, changed: false, error: error.message };
  if (!order) return { orderId, ok: false, changed: false, error: "Order not found" };

  // Sync any order currently with the courier — shipped, ready_to_ship, or awaiting cancellation.
  const SYNCABLE = ["shipped", "ready_to_ship", "cancel_request"] as const;
  if (!SYNCABLE.includes(order.status as (typeof SYNCABLE)[number])) {
    return { orderId, ok: true, changed: false, oldStatus: order.status, error: `Order status "${order.status}" not syncable` };
  }
  if (!order.consignment_id) {
    await writeAuditLog({
      order_id: order.id, courier_id: order.courier_id, provider: null,
      consignment_id: null, delivery_status: null,
      old_status: order.status, new_status: null,
      old_courier_status: order.courier_status, new_courier_status: null,
      changed: false, ok: false, error: "Order has no consignment_id", raw_response: null,
    });
    return { orderId, ok: false, changed: false, oldStatus: order.status, error: "Order has no consignment_id" };
  }
  let courier: CourierRow | null = null;
  if (order.courier_id) {
    const r = await supabaseAdmin
      .from("couriers")
      .select("id, name, base_url, api_key, secret_key, is_default, status")
      .eq("id", order.courier_id)
      .maybeSingle<CourierRow>();
    courier = r.data ?? null;
  }
  // Fallback: order has consignment_id but no (or invalid) courier_id.
  // Try the default Steadfast/Packzy courier, then any active one.
  if (!courier) {
    courier = await getFallbackSteadfastCourier(order.courier_id);
  }

  if (!courier) return { orderId, ok: false, changed: false, error: "No Steadfast courier configured" };


  const provider = detectProvider(courier.name);
  if (provider !== "steadfast") {
    return { orderId, ok: false, changed: false, provider, error: `Provider "${provider}" auto-sync not implemented yet` };
  }
  if (!courier.api_key || !courier.secret_key) {
    return { orderId, ok: false, changed: false, provider, error: "Steadfast credentials missing" };
  }

  const baseUrl = courier.base_url || STEADFAST_DEFAULT_BASE;
  let resp = await fetchSteadfastStatus(baseUrl, courier.api_key, courier.secret_key, order.consignment_id);
  if (!resp.ok && resp.statusCode === 401) {
    const fallbackCourier = await getFallbackSteadfastCourier(courier.id);
    if (fallbackCourier?.api_key && fallbackCourier?.secret_key) {
      const retried = await fetchSteadfastStatus(
        fallbackCourier.base_url || STEADFAST_DEFAULT_BASE,
        fallbackCourier.api_key,
        fallbackCourier.secret_key,
        order.consignment_id,
      );
      if (retried.ok) {
        courier = fallbackCourier;
        resp = retried;
      }
    }
  }
  if (!resp.ok) {
    await writeAuditLog({
      order_id: order.id, courier_id: courier.id, provider,
      consignment_id: order.consignment_id, delivery_status: null,
      old_status: order.status, new_status: null,
      old_courier_status: order.courier_status, new_courier_status: null,
      changed: false, ok: false, error: resp.error, raw_response: resp.raw ?? null,
    });
    return { orderId, ok: false, changed: false, provider, oldStatus: order.status, error: resp.error };
  }

  const mapped = mapSteadfastStatus(resp.delivery_status);

  // Terminal state → flip order.status and clear courier_status.
  if (mapped.orderStatus) {
    const noteLine = `Auto-synced from Steadfast: ${resp.delivery_status} → ${mapped.orderStatus} at ${new Date().toISOString()}`;
    const nextNote = order.internal_note ? `${order.internal_note}\n${noteLine}` : noteLine;
    const { error: updErr } = await supabase
      .from("orders")
      .update({ status: mapped.orderStatus, courier_status: null, internal_note: nextNote } as never)
      .eq("id", order.id);
    if (updErr) {
      await writeAuditLog({
        order_id: order.id, courier_id: courier.id, provider,
        consignment_id: order.consignment_id, delivery_status: resp.delivery_status,
        old_status: order.status, new_status: null,
        old_courier_status: order.courier_status, new_courier_status: null,
        changed: false, ok: false, error: updErr.message, raw_response: resp.raw,
      });
      return { orderId, ok: false, changed: false, provider, oldStatus: order.status, error: updErr.message };
    }
    await writeAuditLog({
      order_id: order.id, courier_id: courier.id, provider,
      consignment_id: order.consignment_id, delivery_status: resp.delivery_status,
      old_status: order.status, new_status: mapped.orderStatus,
      old_courier_status: order.courier_status, new_courier_status: null,
      changed: true, ok: true, error: null, raw_response: resp.raw,
    });
    return { orderId, ok: true, changed: true, provider, oldStatus: order.status, newStatus: mapped.orderStatus, delivery_status: resp.delivery_status };
  }

  // Intermediate courier state → only update courier_status if it changed.
  if (mapped.courierStatus && mapped.courierStatus !== order.courier_status) {
    const { error: updErr } = await supabase
      .from("orders")
      .update({ courier_status: mapped.courierStatus } as never)
      .eq("id", order.id);
    if (updErr) {
      await writeAuditLog({
        order_id: order.id, courier_id: courier.id, provider,
        consignment_id: order.consignment_id, delivery_status: resp.delivery_status,
        old_status: order.status, new_status: null,
        old_courier_status: order.courier_status, new_courier_status: mapped.courierStatus,
        changed: false, ok: false, error: updErr.message, raw_response: resp.raw,
      });
      return { orderId, ok: false, changed: false, provider, oldStatus: order.status, error: updErr.message };
    }
    await writeAuditLog({
      order_id: order.id, courier_id: courier.id, provider,
      consignment_id: order.consignment_id, delivery_status: resp.delivery_status,
      old_status: order.status, new_status: null,
      old_courier_status: order.courier_status, new_courier_status: mapped.courierStatus,
      changed: true, ok: true, error: null, raw_response: resp.raw,
    });
    return { orderId, ok: true, changed: true, provider, oldStatus: order.status, delivery_status: resp.delivery_status };
  }

  await writeAuditLog({
    order_id: order.id, courier_id: courier.id, provider,
    consignment_id: order.consignment_id, delivery_status: resp.delivery_status,
    old_status: order.status, new_status: null,
    old_courier_status: order.courier_status, new_courier_status: order.courier_status,
    changed: false, ok: true, error: null, raw_response: resp.raw,
  });
  return { orderId, ok: true, changed: false, provider, oldStatus: order.status, delivery_status: resp.delivery_status };
}

export type BulkSyncSummary = {
  checked: number;
  updated: number;
  completed: number;
  returned: number;
  unchanged: number;
  failed: number;
  ranAt: string;
  errors: Array<{ orderId: string; error: string }>;
};

export async function syncAllShippedOrders(supabase: Sb): Promise<BulkSyncSummary> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id")
    .in("status", ["shipped", "ready_to_ship", "cancel_request"])
    .not("consignment_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return {
      checked: 0, updated: 0, completed: 0, returned: 0, unchanged: 0, failed: 0,
      ranAt: new Date().toISOString(), errors: [{ orderId: "*", error: error.message }],
    };
  }

  const ids = (orders ?? []).map((o) => o.id as string);
  const results: SyncResult[] = [];
  const batchSize = 10;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((id) => syncOneOrder(supabase, id)));
    results.push(...batchResults);
  }

  const summary: BulkSyncSummary = {
    checked: results.length,
    updated: 0,
    completed: 0,
    returned: 0,
    unchanged: 0,
    failed: 0,
    ranAt: new Date().toISOString(),
    errors: [],
  };
  for (const r of results) {
    if (!r.ok) {
      summary.failed += 1;
      if (r.error) summary.errors.push({ orderId: r.orderId, error: r.error });
    } else if (r.changed) {
      summary.updated += 1;
      if (r.newStatus === "completed") summary.completed += 1;
      else if (r.newStatus === "returned") summary.returned += 1;
    } else {
      summary.unchanged += 1;
    }
  }
  return summary;
}
