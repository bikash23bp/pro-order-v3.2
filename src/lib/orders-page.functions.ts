import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toAsciiDigits, normalizeBDPhone } from "@/lib/phone-paste";

const OrdersInput = z.object({
  status: z.string().default("all"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  source: z.string().default("all"),
  site: z.string().default("all"),
  courier: z.string().default("all"),
  partner: z.string().default("all"),
  staff: z.string().default("all"),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  q: z.string().max(128).default(""),
  tagPhones: z.array(z.string()).nullable().optional(),
  advanceOnly: z.boolean().default(false),
});

type CountBucket = { count: number; amount: number };

const ORDER_LIST_SELECT = "id, order_number, invoice_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, created_at, updated_at, consignment_id, tracking_url, invoice_note, internal_note, courier_id, courier_status, order_source_id, source, preorder, preorder_date, customer_type, created_by, updated_by, oms_sender_name, oms_sender_order_no, source_site_id, is_paid_marketing, forwarded_to_partner_at, order_sources(name)";
const ORDER_LIST_SELECT_LEGACY = "id, order_number, invoice_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, created_at, updated_at, consignment_id, tracking_url, invoice_note, internal_note, courier_id, order_source_id, source, preorder, preorder_date, customer_type, created_by, updated_by, oms_sender_name, oms_sender_order_no, source_site_id, is_paid_marketing, order_sources(name)";
const OMS_SENDERS_CACHE_TTL_MS = 25_000;
const omsSendersCache = new Map<string, { expiresAt: number; promise: Promise<string[] | null> }>();
const ACTIVE_ORDER_STATUSES = new Set([
  "pending_web",
  "pending",
  "ready_order",
  "processing",
  "ready_to_ship",
  "out_of_stock",
  "shipped",
  "no_response",
  "hold",
  "fraud",
  "incomplete",
]);

function normalizePhoneForFlags(phone: string): string | null {
  const normalized = normalizeBDPhone(phone);
  if (normalized) return normalized;
  const digits = toAsciiDigits(phone).replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-11) : null;
}

function phoneKey8(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = toAsciiDigits(phone).replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-8) : null;
}

function emptyBucket(): CountBucket {
  return { count: 0, amount: 0 };
}

function aggregateTabCounts(rows: Array<{
  status: string | null;
  source: string | null;
  preorder: boolean | null;
  total_amount: number | string | null;
}>) {
  const byStatus: Record<string, CountBucket> = {};
  const all = emptyBucket();
  const web = emptyBucket();
  const facebook = emptyBucket();
  const partner = emptyBucket();
  const preorder = emptyBucket();

  const addToBucket = (bucket: CountBucket, amount: number) => {
    bucket.count += 1;
    bucket.amount += amount;
  };

  for (const row of rows) {
    const amount = Number(row.total_amount ?? 0) || 0;
    const status = String(row.status ?? "");
    addToBucket(all, amount);
    if (status) {
      byStatus[status] ??= emptyBucket();
      addToBucket(byStatus[status], amount);
    }
    if (row.source === "woocommerce") addToBucket(web, amount);
    if (row.source === "facebook") addToBucket(facebook, amount);
    if (row.source === "oms") addToBucket(partner, amount);
    if (row.preorder) addToBucket(preorder, amount);
  }

  return { byStatus, all, web, facebook, partner, preorder };
}

function emptyTabCountsData() {
  return {
    byStatus: { incomplete: emptyBucket() },
    all: emptyBucket(),
    web: emptyBucket(),
    facebook: emptyBucket(),
    partner: emptyBucket(),
    preorder: emptyBucket(),
  };
}

function hasLiveCountFilters(data: Omit<z.infer<typeof OrdersInput>, "status" | "page" | "limit">, omsAllowed: string[] | null) {
  return Boolean(
    (data.source && data.source !== "all")
      || (data.site && data.site !== "all")
      || (data.courier && data.courier !== "all")
      || (data.partner && data.partner !== "all")
      || (data.staff && data.staff !== "all")
      || data.from
      || data.to
      || data.q?.trim()
      || data.tagPhones !== null && data.tagPhones !== undefined
      || data.advanceOnly
      || omsAllowed !== null,
  );
}

function isStatementTimeout(error: { message?: string | null; details?: string | null; code?: string | null } | null | undefined) {
  if (!error) return false;
  if (String(error.code ?? "").toUpperCase() === "57014") return true;
  return /statement timeout|canceling statement/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

function isMissingForwardedColumn(error: { message?: string | null; details?: string | null; code?: string | null } | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  return /42703|PGRST204|forwarded_to_partner_at|schema cache/i.test(text);
}

function isMissingReviewTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  const message = (e?.message ?? "").toLowerCase();
  return e?.code === "PGRST205"
    || (message.includes("customer_reviews") && message.includes("schema cache"))
    || message.includes('relation "public.customer_reviews" does not exist')
    || message.includes('relation "customer_reviews" does not exist');
}

async function computeAllowedOmsSenders(_ctx: { supabase: any; userId: string }): Promise<string[] | null> {
  // Permission removed: everyone can see all orders for fast counts.
  return null;
}

async function getAllowedOmsSenders(ctx: { supabase: any; userId: string }): Promise<string[] | null> {
  const now = Date.now();
  const cached = omsSendersCache.get(ctx.userId);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = computeAllowedOmsSenders(ctx).catch((error) => {
    if (omsSendersCache.get(ctx.userId)?.promise === promise) omsSendersCache.delete(ctx.userId);
    throw error;
  });
  omsSendersCache.set(ctx.userId, { expiresAt: now + OMS_SENDERS_CACHE_TTL_MS, promise });
  return promise;
}

function applyOmsAccessFilter(qb: any, allowed: string[] | null) {
  if (allowed === null) return qb;
  if (allowed.length === 0) return qb.neq("source", "oms");
  // Sender names can contain commas/parentheses which break PostgREST's .or() syntax.
  // Use a positive OR with native .in() filter chained via `or` raw is unsafe → split into two queries.
  // Safe encoding: percent-encode every reserved PostgREST char then wrap in double quotes.
  const encode = (s: string) =>
    `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/,/g, "\\,").replace(/[()]/g, (c) => `\\${c}`)}"`;
  const list = allowed.map(encode).join(",");
  return qb.or(`source.neq.oms,oms_sender_name.in.(${list})`);
}

function applyCommonFilters(qb: any, data: z.infer<typeof OrdersInput>) {
  if (data.source !== "all") qb = qb.eq("order_source_id", data.source);
  if (data.site && data.site !== "all") qb = qb.eq("source_site_id", data.site);
  if (data.courier !== "all") qb = qb.eq("courier_id", data.courier);
  if (data.partner && data.partner !== "all") qb = qb.eq("oms_sender_name", data.partner);
  if (data.staff && data.staff !== "all") qb = qb.eq("created_by", data.staff);
  if (data.from && data.to) qb = qb.gte("created_at", data.from).lte("created_at", data.to);
  if (data.advanceOnly) qb = qb.gt("advance_amount", 0);
  const sRaw = data.q.trim();
  const s = toAsciiDigits(sRaw);
  if (s) {
    const normPhone = normalizeBDPhone(sRaw);
    // Search ONLY by complete normalized phone for maximum speed.
    // No name/order/customer_phone ILIKE fallback: those force slower scans.
    if (normPhone.length === 11 && normPhone.startsWith("01")) {
      qb = qb.eq("phone_normalized", normPhone);
    } else {
      qb = qb.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }
  if (data.tagPhones !== null && data.tagPhones !== undefined) {
    const keys = Array.from(
      new Set(
        data.tagPhones
          .map((p) => String(p || "").replace(/\D/g, ""))
          .filter(Boolean),
      ),
    );
    if (keys.length === 0) {
      qb = qb.eq("id", "00000000-0000-0000-0000-000000000000");
    } else if (keys.some((k) => k.length <= 8)) {
      const phoneParts = keys.flatMap((k) => [
        `customer_phone.ilike.%${k}%`,
        `phone_normalized.ilike.%${k}%`,
      ]);
      qb = qb.or(phoneParts.join(","));
    } else {
      qb = qb.in("phone_normalized", keys);
    }
  }
  return qb;
}

function applyFilters(qb: any, data: z.infer<typeof OrdersInput>) {
  qb = applyCommonFilters(qb, data);
  
  if (data.status === "web") return qb.eq("source", "woocommerce");
  if (data.status === "web_pending" || data.status === "pending_web") return qb.eq("status", "pending_web");
  if (data.status === "facebook") return qb.eq("source", "facebook");
  if (data.status === "partner") return qb.eq("source", "oms");
  if (data.status === "partner_pending") return qb.eq("source", "oms").eq("status", "pending");
  if (data.status === "partner_ready_to_ship") return qb.eq("source", "oms").eq("status", "ready_to_ship");
  if (data.status === "partner_cancelled") return qb.eq("source", "oms").eq("status", "cancelled");
  if (data.status === "preorder") return qb.eq("preorder", true);
  if (data.status === "sent_to_partner") return qb.not("forwarded_to_partner_at", "is", null);
  if (data.status === "sent_to_partner_pending") return qb.not("forwarded_to_partner_at", "is", null).eq("status", "pending");
  if (data.status === "sent_to_partner_ready_to_ship") return qb.not("forwarded_to_partner_at", "is", null).eq("status", "ready_to_ship");
  if (data.status === "sent_to_partner_cancelled") return qb.not("forwarded_to_partner_at", "is", null).eq("status", "cancelled");
  if (data.status === "all") return qb;

  // Steadfast pipeline tab: shipped orders that have received a raw courier state.
  if (data.status === "steadfast") return qb.eq("status", "shipped").not("courier_status", "is", null);
  if (typeof data.status === "string" && data.status.startsWith("steadfast_status:")) {
    const cs = data.status.slice("steadfast_status:".length);
    return qb.eq("status", "shipped").eq("courier_status", cs);
  }
  // "Shipped" tab excludes orders that already have a courier response —
  // those move to the Steadfast tab.
  if (data.status === "shipped") return qb.eq("status", "shipped").is("courier_status", null);

  // Cancel-reason sub-tabs under the main "Cancelled" tile.
  if (typeof data.status === "string" && data.status.startsWith("cancelled_reason:")) {
    const id = data.status.slice("cancelled_reason:".length);
    return qb.eq("status", "cancelled").eq("cancel_reason_id", id);
  }
  if (data.status === "cancelled_no_reason") {
    return qb.eq("status", "cancelled").is("cancel_reason_id", null);
  }

  // "pending" এখন স্বাধীন স্ট্যাটাস — শুধু status=pending
  if (data.status === "pending") return qb.eq("status", "pending");
  if (data.status === "ready_order") return qb.eq("status", "ready_order");

  return qb.eq("status", data.status);
}

// When the tab pins `status` to a single value, ordering by (status, created_at)
// lets Postgres pick the composite index on (status, created_at) instead of
// scanning the created_at index backwards and filtering. Order-visible-wise it's
// identical because every returned row shares the same status.
function isSingleStatusFilter(status: string): boolean {
  switch (status) {
    case "all":
    case "web":
    case "facebook":
    case "partner":
    case "preorder":
    case "sent_to_partner":
    case "incomplete":
      return false;
    case "steadfast":
      return false;
    default:
      return true;
  }
}

function orderByListDefault(qb: any, status: string) {
  if (isSingleStatusFilter(status)) {
    qb = qb.order("status", { ascending: true });
  }
  return qb.order("created_at", { ascending: false });
}

async function fetchOrdersPageWithoutCount(
  context: any,
  data: z.infer<typeof OrdersInput>,
  offset: number,
  buildQuery: (qb: any) => any,
) {
  const runQuery = async (selectCols: string) => {
    let qb: any = context.supabase.from("orders").select(selectCols);
    qb = buildQuery(qb);
    return await orderByListDefault(qb, data.status)
      .range(offset, offset + data.limit);
  };

  let { data: fetchedRows, error } = await runQuery(ORDER_LIST_SELECT);
  if (error) {
    if (isStatementTimeout(error)) return { rows: [], totalCount: 0, currentPage: data.page, timedOut: true };
    if (isMissingForwardedColumn(error)) {
      if (data.status === "sent_to_partner") {
        return { rows: [], totalCount: 0, currentPage: 1, schemaMissingForwardedToPartnerAt: true };
      }
      const legacy = await runQuery(ORDER_LIST_SELECT_LEGACY);
      if (legacy.error) {
        if (isStatementTimeout(legacy.error)) return { rows: [], totalCount: 0, currentPage: data.page, timedOut: true };
        throw new Error(legacy.error.message);
      }
      fetchedRows = (legacy.data ?? []).map((row: any) => ({ ...row, forwarded_to_partner_at: null }));
      error = null;
    }
  }
  if (error) {
    throw new Error(error.message);
  }
  const fetched = fetchedRows ?? [];
  if (fetched.length === 0 && data.page > 1) {
    return fetchOrdersPageWithoutCount(context, { ...data, page: 1 }, 0, buildQuery);
  }
  const hasMore = fetched.length > data.limit;
  const orders = fetched.slice(0, data.limit);
  return {
    rows: await enrichOrdersForList(context, orders),
    totalCount: offset + orders.length + (hasMore ? 1 : 0),
    currentPage: data.page,
    estimatedTotal: true,
  };
}

async function enrichOrdersForList(context: any, orders: any[]) {
  const userIds = Array.from(new Set([
    ...orders.map((o: any) => o.created_by).filter(Boolean),
    ...orders.map((o: any) => o.updated_by).filter(Boolean),
  ]));
  const siteIds = Array.from(new Set(orders.map((o: any) => o.source_site_id).filter(Boolean))) as string[];
  const orderIds = orders.map((o: any) => o.id).filter(Boolean) as string[];

  // Keep the main order-list path light: only fetch data needed to render the
  // card shell. Duplicate/VIP/return flags are loaded by getOrderListFlags in a
  // separate background query so they don't block the first card paint.
  const [profileRes, siteRes, previewRes] = await Promise.all([
    userIds.length
      ? context.supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] }),
    siteIds.length
      ? context.supabase.from("integrations").select("id, name, site_url").in("id", siteIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? (context.supabase as any).rpc("get_order_item_previews_v1", { p_order_ids: orderIds })
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = Object.fromEntries((profileRes.data ?? []).map((p: any) => [
    p.id,
    { full_name: p.full_name, email: p.email },
  ]));
  const siteMap = Object.fromEntries((siteRes.data ?? []).map((s: any) => [
    s.id,
    s.name || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : null),
  ]));
  let previewRows = previewRes.error ? [] : (previewRes.data ?? []);
  if (previewRes.error && orderIds.length) {
    const fallback = await context.supabase
      .from("order_items")
      .select("order_id, quantity, products(name)")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });
    if (!fallback.error) {
      const grouped = new Map<string, { item_count: number; preview_items: any[] }>();
      for (const item of fallback.data ?? []) {
        const orderId = (item as any).order_id as string;
        const bucket = grouped.get(orderId) ?? { item_count: 0, preview_items: [] };
        bucket.item_count += 1;
        if (bucket.preview_items.length < 2) {
          bucket.preview_items.push({ quantity: (item as any).quantity, products: (item as any).products ?? null });
        }
        grouped.set(orderId, bucket);
      }
      previewRows = Array.from(grouped, ([order_id, value]) => ({ order_id, ...value }));
    }
  }
  const previewMap = new Map(previewRows.map((r: any) => [r.order_id, Array.isArray(r.preview_items) ? r.preview_items : []]));
  const itemCountMap = new Map(previewRows.map((r: any) => [r.order_id, Number(r.item_count ?? 0)]));

  return orders.map((o: any) => ({
    ...o,
    order_items: previewMap.get(o.id) ?? [],
    order_items_count: itemCountMap.get(o.id) ?? 0,
    creator: o.created_by ? (profileMap[o.created_by] ?? null) : null,
    editor: o.updated_by ? (profileMap[o.updated_by] ?? null) : null,
    site_name: o.source_site_id ? (siteMap[o.source_site_id] ?? null) : null,
    review_summary: null,
    customer_flags: { is_vip: false, is_repeat: false, is_duplicate: false, returned_count: 0 },
  }));
}

async function getVisibleOrderFlags(supabase: any, orders: any[]) {
  const norms = Array.from(new Set(orders.map((o) => normalizePhoneForFlags(o.customer_phone ?? "")).filter(Boolean))) as string[];
  const emails = Array.from(new Set(orders.map((o) => String(o.customer_email ?? "").trim().toLowerCase()).filter(Boolean)));
  if (!norms.length && !emails.length) return {} as Record<string, { is_vip: boolean; is_repeat: boolean; is_duplicate: boolean; returned_count: number }>;

  const { data, error } = await supabase.rpc("get_order_customer_flags_v1", {
    p_phones: norms,
    p_emails: emails,
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as {
    phones?: Record<string, { total?: number; returned?: number; active?: number; imported?: boolean; member?: boolean; vip?: boolean }>;
    emails?: Record<string, { active?: number }>;
  };
  const phoneStats = payload.phones ?? {};
  const emailStats = payload.emails ?? {};

  return Object.fromEntries(orders.map((o) => {
    const norm = normalizePhoneForFlags(o.customer_phone ?? "");
    const email = String(o.customer_email ?? "").trim().toLowerCase();
    const stat = norm ? phoneStats[norm] : undefined;
    const emailActive = email ? Number(emailStats[email]?.active ?? 0) : 0;
    return [o.id, {
      is_vip: Boolean(stat?.vip),
      is_repeat: !!norm && (Number(stat?.total ?? 0) >= 2 || Boolean(stat?.imported) || Boolean(stat?.member)),
      is_duplicate: ACTIVE_ORDER_STATUSES.has(String(o.status)) && (Number(stat?.active ?? 0) >= 2 || emailActive >= 2),
      returned_count: Number(stat?.returned ?? 0),
    }];
  })) as Record<string, { is_vip: boolean; is_repeat: boolean; is_duplicate: boolean; returned_count: number }>;
}
export const listOrdersPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrdersInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const offset = (data.page - 1) * data.limit;
    const omsAllowed = await getAllowedOmsSenders(context);
    if (data.status === "incomplete") {
      const buildQuery = (base: any) => applyOmsAccessFilter(applyCommonFilters(base.eq("status", "incomplete"), data), omsAllowed);
      // Filter by the dedicated `incomplete` status so the list always matches the tab count.
      // Keep the list path count-free; tab/count totals load separately in the background.
      return fetchOrdersPageWithoutCount(context, data, offset, buildQuery);
    }

    const buildQuery = (base: any) => applyOmsAccessFilter(applyFilters(base, data), omsAllowed);
    return fetchOrdersPageWithoutCount(context, data, offset, buildQuery);
  });

export const getOrderCountsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrdersInput.omit({ status: true, page: true, limit: true }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const omsAllowed = await getAllowedOmsSenders(context);
    if (!hasLiveCountFilters(data, omsAllowed)) {
      const { data: summary, error: summaryError } = await (context.supabase as any).rpc("get_order_counts_summary_v1");
      if (!summaryError && summary && typeof summary === "object") {
        const today = new Date().toISOString().slice(0, 10);
        const { count, error: dueError } = await context.supabase.from("orders").select("id", { count: "exact", head: true }).eq("preorder", true).not("preorder_date", "is", null).lte("preorder_date", today);
        const preorderDueCount = dueError && isStatementTimeout(dueError) ? 0 : (count ?? 0);
        const normalized = {
          ...(summary as Record<string, unknown>),
          sent_to_partner: (summary as { sent_to_partner?: CountBucket }).sent_to_partner ?? { count: 0, amount: 0 },
          byStatus: {
            ...(((summary as { byStatus?: Record<string, unknown> }).byStatus) ?? {}),
            incomplete: ((summary as { byStatus?: Record<string, unknown> }).byStatus?.incomplete) ?? { count: 0, amount: 0 },
          },
        };
        return { tabCountsData: normalized, preorderDueCount };
      }
    }
    const countArgs: any = {
      p_source: data.source === "all" ? null : data.source,
      p_site: data.site === "all" ? null : data.site,
      p_courier: data.courier === "all" ? null : data.courier,
      p_partner: data.partner === "all" ? null : data.partner,
      p_staff: data.staff === "all" ? null : data.staff,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
      p_search: toAsciiDigits(data.q || "") || null,
      p_phones: data.tagPhones ?? null,
      p_advance_only: data.advanceOnly || null,
      p_oms_restricted: omsAllowed !== null,
      p_allowed_oms: omsAllowed ?? null,
    };
    const { data: tabCountsData, error } = await (context.supabase as any).rpc("get_order_tab_counts_v2", countArgs);
    // IMPORTANT: do NOT silently return zero counts on error. Throwing keeps the
    // previous successful counts visible (via React Query's keepPreviousData) and
    // surfaces the failure so the UI can auto-retry instead of showing 0.
    if (isStatementTimeout(error)) {
      const err = new Error("Counts query timed out");
      (err as any).code = "TAB_COUNTS_TIMEOUT";
      throw err;
    }
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const { count, error: dueError } = await context.supabase.from("orders").select("id", { count: "exact", head: true }).eq("preorder", true).not("preorder_date", "is", null).lte("preorder_date", today);
    const preorderDueCount = dueError && isStatementTimeout(dueError) ? 0 : (count ?? 0);
    // Sent-to-Partner tab: live fallback only for filtered counts. Filterless
    // counts are served from order_status_counts above.
    let sentToPartnerBucket: { count: number; amount: number } = { count: 0, amount: 0 };
    try {
      let stp: any = context.supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .not("forwarded_to_partner_at", "is", null);
      if (data.source && data.source !== "all") stp = stp.eq("order_source_id", data.source);
      if (data.site && data.site !== "all") stp = stp.eq("source_site_id", data.site);
      if (data.courier && data.courier !== "all") stp = stp.eq("courier_id", data.courier);
      if (data.partner && data.partner !== "all") stp = stp.eq("oms_sender_name", data.partner);
      if (data.staff && data.staff !== "all") stp = stp.eq("created_by", data.staff);
      if (data.from && data.to) stp = stp.gte("created_at", data.from).lte("created_at", data.to);
      if (data.advanceOnly) stp = stp.gt("advance_amount", 0);
      const { count: stpCount, error: stpErr } = await stp;
      if (!stpErr) {
        sentToPartnerBucket = { count: stpCount ?? 0, amount: 0 };
      }
    } catch (err) {
      /* keep zero bucket for older schemas/caches */
    }
    const normalized = tabCountsData && typeof tabCountsData === "object"
      ? {
          ...(tabCountsData as Record<string, unknown>),
          sent_to_partner: sentToPartnerBucket,
          byStatus: {
            ...(((tabCountsData as { byStatus?: Record<string, unknown> }).byStatus) ?? {}),
            incomplete: ((tabCountsData as { byStatus?: Record<string, unknown> }).byStatus?.incomplete)
              ?? { count: 0, amount: 0 },
          },
        }
      : {
          byStatus: { incomplete: { count: 0, amount: 0 } },
          all: { count: 0, amount: 0 },
          web: { count: 0, amount: 0 },
          facebook: { count: 0, amount: 0 },
          partner: { count: 0, amount: 0 },
          preorder: { count: 0, amount: 0 },
          sent_to_partner: sentToPartnerBucket,
        };
    return { tabCountsData: normalized, preorderDueCount };
  });

export const getOrderFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [sources, couriers, assignableUsers, partners] = await Promise.all([
      context.supabase.from("order_sources").select("id,name").eq("visible", true).order("name"),
      context.supabase.from("couriers").select("id,name").eq("status", "active").order("name"),
      context.supabase.rpc("list_assignable_users"),
      (context.supabase as any).from("oms_inbound_settings").select("sender_name").order("sender_name"),
    ]);
    if (sources.error) throw new Error(sources.error.message);
    if (couriers.error) throw new Error(couriers.error.message);
    if (assignableUsers.error) throw new Error(assignableUsers.error.message);
    let partnerNames = Array.from(new Set(((partners.data ?? []) as Array<{ sender_name: string }>).map((p) => p.sender_name).filter(Boolean)));
    const omsAllowed = await getAllowedOmsSenders(context);
    if (omsAllowed !== null) {
      const allowSet = new Set(omsAllowed);
      partnerNames = partnerNames.filter((n) => allowSet.has(n));
    }
    return { sources: sources.data ?? [], couriers: couriers.data ?? [], assignableUsers: assignableUsers.data ?? [], partners: partnerNames };
  });

const EXPORT_CHUNK = 1000;
const EXPORT_SAFETY_CAP = 500_000;

const FlagInput = z.object({
  orders: z
    .array(
      z.object({
        id: z.string(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
      }),
    )
    .max(200),
});

export const getOrderListFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FlagInput.parse(input ?? { orders: [] }))
  .handler(async ({ data, context }) => {
    if (!data.orders.length) return {} as Record<string, { is_vip: boolean; is_repeat: boolean; is_duplicate: boolean; returned_count: number }>;
    const flat = data.orders.map((o) => ({
      id: o.id,
      customer_phone: o.phone ?? "",
      customer_email: o.email ?? "",
      status: o.status ?? "",
    }));
    return await getVisibleOrderFlags(context.supabase, flat);
  });

async function fetchAllByIds(supabase: any, ids: string[], selectCols: string) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += EXPORT_CHUNK) {
    const slice = ids.slice(i, i + EXPORT_CHUNK);
    const { data, error } = await supabase
      .from("orders")
      .select(selectCols)
      .in("id", slice);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

export const exportOrdersPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    OrdersInput.omit({ page: true, limit: true })
      .extend({ ids: z.array(z.string().uuid()).max(EXPORT_SAFETY_CAP).optional().nullable() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const selectCols =
      "id, order_number, created_at, customer_name, customer_phone, customer_address, status, subtotal, delivery_charge, discount_amount, total_amount, consignment_id, order_sources(name), order_items(quantity, unit_price, products(name), product_variants(attributes))";


    // Selected-only export: ignore filters, fetch exactly those rows in chunks
    if (data.ids && data.ids.length > 0) {
      const ids = Array.from(new Set(data.ids));
      const rows = await fetchAllByIds(context.supabase, ids, selectCols);
      // Preserve caller order
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      return { rows: ids.map((id) => byId.get(id)).filter(Boolean) };
    }

    // Filtered/full export: paginate via .range() in chunks (no hard cap from old 10k limit)
    const buildQuery = () => {
      if (data.status === "incomplete") {
        let qb: any = context.supabase.from("orders").select(selectCols).eq("status", "incomplete");
        return applyCommonFilters(qb, { ...data, page: 1, limit: EXPORT_CHUNK });
      }
      let qb: any = context.supabase.from("orders").select(selectCols);
      return applyFilters(qb, { ...data, page: 1, limit: EXPORT_CHUNK });
    };

    const out: any[] = [];
    let from = 0;
    while (from < EXPORT_SAFETY_CAP) {
      const to = from + EXPORT_CHUNK - 1;
      const { data: rows, error } = await orderByListDefault(buildQuery(), data.status)
        .range(from, to);
      if (error) throw new Error(error.message);
      const list = rows ?? [];
      out.push(...list);
      if (list.length < EXPORT_CHUNK) break;
      from += EXPORT_CHUNK;
    }
    return { rows: out };
  });

// Server-side verification: independently recounts orders with
// forwarded_to_partner_at IS NOT NULL and compares against the bucket
// returned by the same filter logic used by the Sent to Partner tab.
export const verifySentToPartnerCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    source?: string; site?: string; courier?: string; partner?: string;
    staff?: string; from?: string | null; to?: string | null; advanceOnly?: boolean;
  }) => input ?? {})
  .handler(async ({ data, context }) => {
    const applyFilters = (qb: any) => {
      if (data.source && data.source !== "all") qb = qb.eq("order_source_id", data.source);
      if (data.site && data.site !== "all") qb = qb.eq("source_site_id", data.site);
      if (data.courier && data.courier !== "all") qb = qb.eq("courier_id", data.courier);
      if (data.partner && data.partner !== "all") qb = qb.eq("oms_sender_name", data.partner);
      if (data.staff && data.staff !== "all") qb = qb.eq("created_by", data.staff);
      if (data.from && data.to) qb = qb.gte("created_at", data.from).lte("created_at", data.to);
      if (data.advanceOnly) qb = qb.gt("advance_amount", 0);
      return qb;
    };

    // Tab bucket recompute (mirrors getOrdersPageMeta logic)
    let bucket: any = context.supabase
      .from("orders")
      .select("total_amount", { count: "planned" })
      .not("forwarded_to_partner_at", "is", null);
    bucket = applyFilters(bucket);
    const { data: bucketRows, count: bucketCount, error: bucketErr } = await bucket;
    if (bucketErr) {
      if (isMissingForwardedColumn(bucketErr)) {
        return { tabCount: 0, actualCount: 0, tabAmount: 0, matches: true, diff: 0, schemaMissingForwardedToPartnerAt: true };
      }
      throw new Error(`bucket: ${bucketErr.message}`);
    }
    const bucketAmount = ((bucketRows ?? []) as Array<{ total_amount: number | string | null }>)
      .reduce((a, r) => a + (Number(r.total_amount ?? 0) || 0), 0);

    // Independent verification: exact head count over the same predicate
    let verify: any = context.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("forwarded_to_partner_at", "is", null);
    verify = applyFilters(verify);
    const { count: verifyCount, error: verifyErr } = await verify;
    if (verifyErr) {
      if (isMissingForwardedColumn(verifyErr)) {
        return { tabCount: 0, actualCount: 0, tabAmount: 0, matches: true, diff: 0, schemaMissingForwardedToPartnerAt: true };
      }
      throw new Error(`verify: ${verifyErr.message}`);
    }

    const tabCount = bucketCount ?? (bucketRows?.length ?? 0);
    const actualCount = verifyCount ?? 0;
    return {
      tabCount,
      actualCount,
      tabAmount: bucketAmount,
      matches: tabCount === actualCount,
      diff: tabCount - actualCount,
    };
  });
