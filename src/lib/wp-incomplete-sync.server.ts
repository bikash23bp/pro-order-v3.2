// Pulls rows from a WordPress plugin table `wp_incomplete_order_tracking`
// exposed via REST endpoints, and creates them as `pending_web` orders with
// source = 'woocommerce_incomplete'. Skips rows without a usable phone.
//
// Plugin endpoints (you implement these in WP):
//   GET  /wp-json/oms/v1/incomplete-orders?status=pending&limit=100
//        Basic Auth = WC consumer key / secret
//        Response: { items: [ { id, created_at, customer_name, phone, email,
//                               address, total, items: [{ product_id,
//                               variation_id?, name, sku, quantity,
//                               unit_price }] } ] }
//   POST /wp-json/oms/v1/incomplete-orders/mark-imported
//        Body: { ids: number[] }

import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeUnmatchedBlock } from "./web-unmatched";

type Sb = SupabaseClient;

function extractRows(payload: unknown): WpIncompleteRow[] {
  if (Array.isArray(payload)) return payload as WpIncompleteRow[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const direct = record.items ?? record.data ?? record.orders ?? record.rows;
  if (Array.isArray(direct)) return direct as WpIncompleteRow[];
  if (direct && typeof direct === "object") {
    const nested = extractRows(direct);
    if (nested.length > 0) return nested;
  }
  const firstArray = Object.values(record).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray as WpIncompleteRow[] : [];
}

export type WpIncompleteItem = {
  product_id: number;
  variation_id?: number | null;
  name: string;
  sku?: string;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  price?: number;
  total?: number;
};

export type WpIncompleteRow = {
  id: number;
  created_at?: string;
  customer_name?: string;
  phone?: string;
  customer_phone?: string;
  email?: string | null;
  customer_email?: string | null;
  address?: string;
  customer_address?: string;
  total?: number | string;
  cart_total?: number | string;
  shipping?: number | string;
  shipping_total?: number | string;
  status?: string;
  items?: WpIncompleteItem[];
  line_items?: WpIncompleteItem[];
  session_id?: string;
  event_id?: string;
};

export type WpIncompleteSummary = {
  sites: number;
  fetched: number;
  created: number;
  updated: number;
  skipped_no_phone: number;
  skipped_dup: number;
  failed: number;
  marked_imported: number;
};

export type WpIncompleteIntegration = {
  id: string;
  name: string | null;
  site_url?: string | null;
  consumer_key?: string | null;
  consumer_secret?: string | null;
  plugin_signature?: string | null;
};

export type WpIncompleteImportResult = Omit<WpIncompleteSummary, "sites" | "fetched" | "marked_imported"> & {
  imported_ids: number[];
  error: string | null;
};

const PLUGIN_BASE = "/wp-json/oms/v1/incomplete-orders";
const PLUGIN_BASE_V2 = "/wp-json/oms/v2/incomplete-orders";
const PLUGIN_BATCH_SIZE = 200;
const MAX_SYNC_BATCHES_PER_SITE = 25;

function normalizePhone(raw: string | undefined | null): string | null {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  const tail = digits.slice(-11);
  return tail.length === 11 ? tail : null;
}

async function pluginGet(
  siteUrl: string,
  ck: string,
  cs: string,
  pluginSignature: string | null,
): Promise<{ rows: WpIncompleteRow[]; diag: string }> {
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const baseV1 = `${siteUrl.replace(/\/+$/, "")}${PLUGIN_BASE}`;
  const baseV2 = `${siteUrl.replace(/\/+$/, "")}${PLUGIN_BASE_V2}`;
  const qsAuth = `consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`;
  const attempts: { url: string; headers: Record<string, string>; label: string }[] = [];

  for (const p of [
    `?status=pending&limit=${PLUGIN_BATCH_SIZE}`,
    `?status=processing&limit=${PLUGIN_BATCH_SIZE}`,
    `?status=incomplete&limit=${PLUGIN_BATCH_SIZE}`,
    `?limit=${PLUGIN_BATCH_SIZE}`,
  ]) {
    if (pluginSignature) {
      attempts.push({ url: `${baseV2}${p}`, headers: { "X-Plugin-Signature": pluginSignature }, label: "v2-sig" });
      attempts.push({ url: `${baseV2}${p}${p.includes("?") ? "&" : "?"}signature=${encodeURIComponent(pluginSignature)}`, headers: {}, label: "v2-sig-qs" });
    }
    attempts.push({ url: `${baseV2}${p}`, headers: { Authorization: `Basic ${auth}` }, label: "v2-basic" });
    attempts.push({ url: `${baseV2}${p}${p.includes("?") ? "&" : "?"}${qsAuth}`, headers: {}, label: "v2-qs" });
  }

  // v1 fallback (Basic Auth, query-string, custom header)
  const paths = [`?status=pending&limit=${PLUGIN_BATCH_SIZE}`, `?limit=${PLUGIN_BATCH_SIZE}`, `?status=incomplete&limit=${PLUGIN_BATCH_SIZE}`];
  for (const p of paths) {
    attempts.push({ url: `${baseV1}${p}`, headers: { Authorization: `Basic ${auth}` }, label: "basic" });
    attempts.push({ url: `${baseV1}${p}${p.includes("?") ? "&" : "?"}${qsAuth}`, headers: {}, label: "qs" });
    attempts.push({ url: `${baseV1}${p}`, headers: { "X-OMS-API-Key": ck, "X-OMS-API-Secret": cs }, label: "x-header" });
  }

  const diagLines: string[] = [];
  let lastError: string | null = null;
  let sawSuccessfulEmptyResponse = false;
  for (const a of attempts) {
    const res = await fetch(a.url, { headers: a.headers });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      lastError = `plugin GET ${res.status} (${a.label}): ${body.slice(0, 200)}`;
      diagLines.push(`${a.label} ${a.url.replace(qsAuth, "***")} → ${res.status}`);
      continue;
    }
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch {
      diagLines.push(`${a.label} → 200 non-JSON (${text.slice(0, 80)})`);
      continue;
    }
    const rows = extractRows(json);
    diagLines.push(`${a.label} → 200 rows=${rows.length}`);
    if (rows.length > 0) {
      return {
        rows: rows.map((row) => ({
          ...row,
          phone: row.phone ?? row.customer_phone,
          email: row.email ?? row.customer_email ?? null,
          address: row.address ?? row.customer_address,
          total: row.total ?? row.cart_total,
          items: row.items ?? row.line_items ?? [],
        })),
        diag: diagLines.join(" | "),
      };
    }
    sawSuccessfulEmptyResponse = true;
    // Keep trying alternate auth/path combinations before concluding empty.
    continue;
  }

  if (sawSuccessfulEmptyResponse) {
    return { rows: [], diag: diagLines.join(" | ") };
  }
  if (lastError) throw new Error(`${lastError} [tried: ${diagLines.join(" | ")}]`);
  return { rows: [], diag: diagLines.join(" | ") };
}

async function pluginMarkImported(
  siteUrl: string,
  ck: string,
  cs: string,
  pluginSignature: string | null,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const baseV1 = `${siteUrl.replace(/\/+$/, "")}${PLUGIN_BASE}/mark-imported`;
  const baseV2 = `${siteUrl.replace(/\/+$/, "")}${PLUGIN_BASE_V2}/mark-imported`;
  const qsAuth = `consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`;
  const attempts: { url: string; headers: Record<string, string> }[] = [];
  if (pluginSignature) {
    attempts.push({ url: baseV2, headers: { "X-Plugin-Signature": pluginSignature, "Content-Type": "application/json" } });
    attempts.push({ url: `${baseV2}?signature=${encodeURIComponent(pluginSignature)}`, headers: { "Content-Type": "application/json" } });
  }
  attempts.push(
    { url: baseV1, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" } },
    { url: `${baseV1}?${qsAuth}`, headers: { "Content-Type": "application/json" } },
    { url: baseV1, headers: { "X-OMS-API-Key": ck, "X-OMS-API-Secret": cs, "Content-Type": "application/json" } },
  );
  for (const a of attempts) {
    const res = await fetch(a.url, { method: "POST", headers: a.headers, body: JSON.stringify({ ids }) });
    if (res.ok) return;
    if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
      console.error(`[wp-incomplete-sync mark-imported] ${res.status}`,
        await res.text().catch(() => res.statusText));
      return;
    }
  }
  console.error("[wp-incomplete-sync mark-imported] all auth attempts failed");
}

export async function importWpIncompleteRows(
  supabase: Sb,
  site: WpIncompleteIntegration,
  rows: WpIncompleteRow[],
): Promise<WpIncompleteImportResult> {
  const result: WpIncompleteImportResult = {
    created: 0,
    updated: 0,
    skipped_no_phone: 0,
    skipped_dup: 0,
    failed: 0,
    imported_ids: [],
    error: null,
  };

  const normalizedRows = rows.map((row) => ({
    ...row,
    phone: row.phone ?? row.customer_phone,
    email: row.email ?? row.customer_email ?? null,
    address: row.address ?? row.customer_address,
    total: row.total ?? row.cart_total,
    items: row.items ?? row.line_items ?? [],
  }));
  if (normalizedRows.length === 0) return result;

  const externalIds = normalizedRows.map((r) => String(r.id));
  const { data: existing } = await supabase
    .from("orders")
    .select("id, external_order_id")
    .eq("source", "woocommerce_incomplete")
    .eq("source_site_id", site.id)
    .in("external_order_id", externalIds);
  const existingByExternalId = new Map(
    (existing ?? []).map((e: { id: string; external_order_id: string }) => [e.external_order_id, e.id]),
  );

  const allItems = normalizedRows.flatMap((r) => r.items ?? []);
  const allWooProductIds = Array.from(
    new Set(allItems.map((li) => li.product_id).filter(Boolean).map(String)),
  );
  const externalToProductId = new Map<string, string>();
  if (allWooProductIds.length > 0) {
    const { data: refs } = await supabase
      .from("product_external_refs")
      .select("product_id, external_product_id, external_variant_id")
      .eq("source", "woocommerce")
      .eq("source_site_id", site.id)
      .in("external_product_id", allWooProductIds);
    for (const r of (refs ?? []) as Array<{
      product_id: string; external_product_id: string; external_variant_id: string | null;
    }>) {
      externalToProductId.set(
        `${r.external_product_id}:${r.external_variant_id || ""}`,
        r.product_id,
      );
    }
  }
  const resolve = (it: WpIncompleteItem): string | undefined => {
    const exact = externalToProductId.get(`${it.product_id}:${it.variation_id || ""}`);
    if (exact) return exact;
    return externalToProductId.get(`${it.product_id}:`);
  };

  for (const row of normalizedRows) {
    const existingOrderId = existingByExternalId.get(String(row.id));
    const rawPhone = row.phone ?? row.customer_phone ?? "";
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      result.skipped_no_phone++;
      result.imported_ids.push(row.id);
      continue;
    }

    // If a real Woo order already exists for this phone (placed in the same
    // session after the abandoned cart), skip importing the incomplete row.
    if (!existingOrderId) {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      if (last10.length >= 7) {
        const { data: realOrders } = await supabase
          .from("orders")
          .select("id, customer_phone")
          .eq("source", "woocommerce")
          .eq("source_site_id", site.id)
          .limit(2000);
        const matched = (realOrders ?? []).some(
          (r: { customer_phone: string | null }) =>
            (r.customer_phone || "").replace(/\D/g, "").slice(-10) === last10,
        );
        if (matched) {
          result.skipped_dup++;
          result.imported_ids.push(row.id);
          continue;
        }
      }
    }

    const items = (row.items ?? []).map((it) => ({
      ...it,
      quantity: Math.max(1, Number(it.quantity ?? it.qty ?? 1)),
      unit_price: Number(
        it.unit_price
        ?? it.price
        ?? ((Number(it.total ?? 0) || 0) / Math.max(1, Number(it.quantity ?? it.qty ?? 1))),
      ),
    }));

    const matched: { product_id: string; quantity: number; unit_price: number }[] = [];
    const unmatched: typeof items = [];
    for (const it of items) {
      const pid = resolve(it);
      if (pid) matched.push({ product_id: pid, quantity: it.quantity, unit_price: it.unit_price });
      else unmatched.push(it);
    }
    const unmatchedBlock = unmatched.length
      ? serializeUnmatchedBlock(
          unmatched.map((u) => ({
            name: u.name,
            sku: u.sku || null,
            product_id: u.product_id ?? null,
            variation_id: u.variation_id ?? null,
            quantity: u.quantity,
            unit_price: u.unit_price,
          })),
        )
      : "";

    const subtotal = items.reduce((s2, it) => s2 + it.quantity * it.unit_price, 0);
    const shipping = Number(row.shipping ?? row.shipping_total ?? 0) || 0;
    const total = Number(row.total ?? (subtotal + shipping)) || (subtotal + shipping);

    // Keep internal note clean: do NOT include session_id / event_id tracking
    // metadata. Only surface actionable info (missing phone, unmatched items).
    const noteParts = [
      phone ? "" : "Missing phone from WP incomplete order",
      unmatchedBlock,
    ].filter(Boolean);

    const insertPayload = {
      customer_name: (row.customer_name || "").trim() || "Web Customer",
      customer_phone: rawPhone.trim() || phone || "—",
      customer_email: row.email || null,
      customer_address: (row.address || "").trim() || "—",
      status: "incomplete" as const,
      subtotal,
      delivery_charge: shipping,
      discount_amount: 0,
      total_amount: total,
      source: "woocommerce_incomplete",
      source_site_id: site.id,
      external_order_id: String(row.id),
      internal_note: noteParts.length ? noteParts.join("\n\n") : null,
      created_at: row.created_at ?? undefined,
    };

    const query = existingOrderId
      ? supabase.from("orders").update(insertPayload).eq("id", existingOrderId).select("id").single()
      : supabase.from("orders").insert(insertPayload).select("id").single();
    const { data: inserted, error } = await query;
    if (error || !inserted) {
      console.error("[wp-incomplete-sync orders upsert]", error?.message);
      result.failed++;
      if (!result.error) result.error = error?.message ?? "orders upsert failed";
      continue;
    }

    if (existingOrderId) {
      await supabase.from("order_items").delete().eq("order_id", inserted.id);
    }

    if (matched.length > 0) {
      const { error: itErr } = await supabase
        .from("order_items")
        .insert(matched.map((m) => ({ order_id: inserted.id, ...m })));
      if (itErr) console.error("[wp-incomplete-sync order_items insert]", itErr.message);
    }

    if (existingOrderId) result.updated++;
    else result.created++;
    result.imported_ids.push(row.id);
  }

  return result;
}

export async function syncWpIncomplete(
  supabase: Sb,
  opts: { integrationId?: string } = {},
): Promise<WpIncompleteSummary> {
  const q = supabase
    .from("integrations")
    .select("id, name, site_url, consumer_key, consumer_secret, plugin_signature, enabled")
    .eq("provider", "woocommerce")
    .eq("enabled", true);
  const { data: sites, error: sErr } = opts.integrationId
    ? await q.eq("id", opts.integrationId)
    : await q;
  if (sErr) throw new Error(sErr.message);

  const summary: WpIncompleteSummary = {
    sites: sites?.length ?? 0,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped_no_phone: 0,
    skipped_dup: 0,
    failed: 0,
    marked_imported: 0,
  };
  if (!sites || sites.length === 0) return summary;

  for (const s of sites as Array<{
    id: string; name: string | null; site_url: string | null;
    consumer_key: string | null; consumer_secret: string | null;
    plugin_signature: string | null;
  }>) {
    const perSite = {
      fetched: 0, created: 0, skipped_no_phone: 0, skipped_dup: 0,
      failed: 0, marked_imported: 0,
      imported_ids: [] as number[], error: null as string | null,
    };
    if (!s.site_url || !s.consumer_key || !s.consumer_secret) {
      summary.failed++; perSite.failed++; perSite.error = "Missing site_url or credentials";
      await supabase.from("wp_incomplete_sync_logs" as never).insert({
        integration_id: s.id, site_name: s.name, ...perSite,
      } as never);
      continue;
    }
    if (!s.plugin_signature) {
      summary.failed++; perSite.failed++; perSite.error = "Plugin signature is missing for this site. Paste it in Integrations before auto-sync can import incomplete orders.";
      await supabase.from("wp_incomplete_sync_logs" as never).insert({
        integration_id: s.id, site_name: s.name, ...perSite,
      } as never);
      continue;
    }

    const importedIds: number[] = [];
    let lastDiag = "";
    let sawAnyRows = false;

    for (let batchIndex = 0; batchIndex < MAX_SYNC_BATCHES_PER_SITE; batchIndex += 1) {
      let rows: WpIncompleteRow[] = [];
      try {
        const r = await pluginGet(s.site_url, s.consumer_key, s.consumer_secret, s.plugin_signature);
        rows = r.rows;
        lastDiag = r.diag;
      } catch (e) {
        console.error(`[wp-incomplete-sync GET] ${s.name}:`, e);
        summary.failed++;
        perSite.failed++;
        perSite.error = e instanceof Error ? e.message : String(e);
        break;
      }

      if (rows.length === 0) {
        if (!sawAnyRows && !perSite.error) {
          perSite.error = `No rows returned. Tried: ${lastDiag || PLUGIN_BASE_V2}`;
        }
        break;
      }

      sawAnyRows = true;
      summary.fetched += rows.length;
      perSite.fetched += rows.length;

      const imported = await importWpIncompleteRows(supabase, s, rows);
      summary.created += imported.created;
      summary.updated += imported.updated;
      summary.skipped_no_phone += imported.skipped_no_phone;
      summary.skipped_dup += imported.skipped_dup;
      summary.failed += imported.failed;
      perSite.created += imported.created;
      perSite.skipped_no_phone += imported.skipped_no_phone;
      perSite.skipped_dup += imported.skipped_dup;
      perSite.failed += imported.failed;
      if (imported.error && !perSite.error) perSite.error = imported.error;

      const importedBatchIds = imported.imported_ids;

      if (importedBatchIds.length > 0) {
        try {
          await pluginMarkImported(s.site_url, s.consumer_key, s.consumer_secret, s.plugin_signature, importedBatchIds);
          summary.marked_imported += importedBatchIds.length;
          perSite.marked_imported += importedBatchIds.length;
          importedIds.push(...importedBatchIds);
        } catch (e) {
          console.error(`[wp-incomplete-sync mark-imported] ${s.name}:`, e);
          if (!perSite.error) perSite.error = e instanceof Error ? e.message : String(e);
          break;
        }
      }

      if (rows.length < PLUGIN_BATCH_SIZE) break;
    }
    perSite.imported_ids = importedIds;

    await supabase.from("wp_incomplete_sync_logs" as never).insert({
      integration_id: s.id,
      site_name: s.name,
      fetched: perSite.fetched,
      created: perSite.created,
      skipped_no_phone: perSite.skipped_no_phone,
      skipped_dup: perSite.skipped_dup,
      failed: perSite.failed,
      marked_imported: perSite.marked_imported,
      imported_ids: perSite.imported_ids,
      error: perSite.error,
    } as never);
  }

  return summary;
}
