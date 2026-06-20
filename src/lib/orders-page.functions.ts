import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toAsciiDigits, normalizeBDPhone } from "@/lib/phone-paste";

const OrdersInput = z.object({
  status: z.string().default("processing"),
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

const ORDER_LIST_SELECT = "id, order_number, invoice_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, created_at, consignment_id, tracking_url, invoice_note, internal_note, courier_id, order_source_id, source, preorder, preorder_date, customer_type, created_by, updated_by, oms_sender_name, oms_sender_order_no, source_site_id, is_paid_marketing, order_sources(name), order_items(quantity, unit_price, products(name), product_variants(attributes))";
const ORDER_LIST_COUNT_MODE: "planned" = "planned";

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

function isRangeNotSatisfiable(error: {
  message?: string | null;
  details?: string | null;
  code?: string | null;
  status?: number | null;
} | null | undefined) {
  if (!error) return false;
  if (Number(error.status ?? 0) === 416) return true;
  if (String(error.code ?? "").toUpperCase() === "PGRST103") return true;
  return /range not satisfiable/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

async function getAllowedOmsSenders(ctx: { supabase: any; userId: string }): Promise<string[] | null> {
  const [a, o] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "business_owner" }),
  ]);
  if (a.data || o.data) return null;
  const { data: prof } = await ctx.supabase.from("profiles").select("permissions").eq("id", ctx.userId).maybeSingle();
  if ((prof?.permissions as any)?.can_view_all_orders) return null;
  const { data } = await (ctx.supabase as any).from("user_oms_access").select("sender_name").eq("user_id", ctx.userId);
  return ((data ?? []) as { sender_name: string }[]).map((r) => r.sender_name);
}

function applyOmsAccessFilter(qb: any, allowed: string[] | null) {
  if (allowed === null) return qb;
  if (allowed.length === 0) return qb.neq("source", "oms");
  const list = allowed.map((s) => `"${String(s).replace(/"/g, '\\"')}"`).join(",");
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
    const safe = s.replace(/[%,()]/g, "");
    const digits = s.replace(/\D/g, "");
    const normPhone = normalizeBDPhone(sRaw);
    const parts: string[] = [`customer_name.ilike.%${safe}%`];
    if (normPhone.length === 11 && normPhone.startsWith("01")) {
      // Clean 11-digit BD phone — exact + last-8 fallback for legacy data
      const tail = normPhone.slice(-8);
      parts.push(`phone_normalized.eq.${normPhone}`);
      parts.push(`phone_normalized.ilike.%${tail}%`);
      parts.push(`customer_phone.ilike.%${tail}%`);
    } else if (digits.length >= 3) {
      const needle = digits.length >= 8 ? digits.slice(-8) : digits;
      parts.push(`customer_phone.ilike.%${needle}%`);
      parts.push(`phone_normalized.ilike.%${needle}%`);
      if (/^\d+$/.test(digits) && digits.length <= 9) {
        parts.push(`order_number.eq.${parseInt(digits, 10)}`);
      }
    } else {
      parts.push(`customer_phone.ilike.%${safe}%`);
    }
    qb = qb.or(parts.join(","));
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
  if (data.status === "preorder") return qb.eq("preorder", true);
  if (data.status === "all") return qb;

  // "pending" এখন স্বাধীন স্ট্যাটাস — শুধু status=pending
  if (data.status === "pending") return qb.eq("status", "pending");
  if (data.status === "ready_order") return qb.eq("status", "ready_order");

  return qb.eq("status", data.status);
}

async function enrichOrdersForList(context: any, orders: any[]) {
  const userIds = Array.from(new Set([
    ...orders.map((o: any) => o.created_by).filter(Boolean),
    ...orders.map((o: any) => o.updated_by).filter(Boolean),
  ]));
  const siteIds = Array.from(new Set(orders.map((o: any) => o.source_site_id).filter(Boolean))) as string[];

  const [profileRes, siteRes, flagMap] = await Promise.all([
    userIds.length
      ? context.supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] }),
    siteIds.length
      ? context.supabase.from("integrations").select("id, name, site_url").in("id", siteIds)
      : Promise.resolve({ data: [] }),
    getVisibleOrderFlags(context.supabase, orders),
  ]);

  const profileMap = Object.fromEntries((profileRes.data ?? []).map((p: any) => [
    p.id,
    { full_name: p.full_name, email: p.email },
  ]));
  const siteMap = Object.fromEntries((siteRes.data ?? []).map((s: any) => [
    s.id,
    s.name || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : null),
  ]));

  return orders.map((o: any) => ({
    ...o,
    creator: o.created_by ? (profileMap[o.created_by] ?? null) : null,
    editor: o.updated_by ? (profileMap[o.updated_by] ?? null) : null,
    site_name: o.source_site_id ? (siteMap[o.source_site_id] ?? null) : null,
    customer_flags: flagMap[o.id] ?? { is_vip: false, is_repeat: false, is_duplicate: false, returned_count: 0 },
  }));
}

async function getVisibleOrderFlags(supabase: any, orders: any[]) {
  const norms = Array.from(new Set(orders.map((o) => normalizePhoneForFlags(o.customer_phone ?? "")).filter(Boolean))) as string[];
  const emails = Array.from(new Set(orders.map((o) => String(o.customer_email ?? "").trim().toLowerCase()).filter(Boolean)));
  if (!norms.length && !emails.length) return {} as Record<string, { is_vip: boolean; is_repeat: boolean; is_duplicate: boolean; returned_count: number }>;

  const [{ data: settings }, historyRes, importedRes, memberRes, emailDupRes] = await Promise.all([
    supabase.from("app_settings").select("vip_spend_threshold, vip_order_threshold").eq("id", true).maybeSingle(),
    norms.length
      ? supabase.from("orders").select("phone_normalized, customer_phone, customer_email, status, total_amount").in("phone_normalized", norms)
      : Promise.resolve({ data: [] }),
    norms.length
      ? supabase.from("imported_customers").select("phone").in("phone", norms)
      : Promise.resolve({ data: [] }),
    norms.length
      ? supabase.from("membership_customers").select("phone").in("phone", norms)
      : Promise.resolve({ data: [] }),
    emails.length
      ? supabase.from("orders").select("customer_email, status").in("customer_email", emails)
      : Promise.resolve({ data: [] }),
  ]);

  const vipSpend = Number(settings?.vip_spend_threshold ?? 10000);
  const vipOrders = Number(settings?.vip_order_threshold ?? 5);
  const byNorm = new Map<string, { total: number; completed: number; spent: number; returned: number; active: number }>();
  const byKey = new Map<string, number>();
  const byEmail = new Map<string, number>();

  for (const r of (historyRes.data ?? []) as any[]) {
    const norm = r.phone_normalized || normalizePhoneForFlags(r.customer_phone ?? "");
    if (!norm) continue;
    const cur = byNorm.get(norm) ?? { total: 0, completed: 0, spent: 0, returned: 0, active: 0 };
    cur.total += 1;
    if (r.status === "completed") cur.completed += 1;
    if (r.status !== "cancelled" && r.status !== "returned") cur.spent += Number(r.total_amount ?? 0) || 0;
    if (r.status === "returned") cur.returned += 1;
    if (ACTIVE_ORDER_STATUSES.has(String(r.status))) cur.active += 1;
    byNorm.set(norm, cur);
    const key = phoneKey8(r.customer_phone ?? norm);
    if (key && ACTIVE_ORDER_STATUSES.has(String(r.status))) byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  for (const r of (emailDupRes.data ?? []) as any[]) {
    const email = String(r.customer_email ?? "").trim().toLowerCase();
    if (email && ACTIVE_ORDER_STATUSES.has(String(r.status))) byEmail.set(email, (byEmail.get(email) ?? 0) + 1);
  }

  const repeatNorms = new Set<string>();
  for (const r of [...(importedRes.data ?? []), ...(memberRes.data ?? [])] as any[]) {
    const norm = normalizePhoneForFlags(r.phone ?? "");
    if (norm) repeatNorms.add(norm);
  }

  return Object.fromEntries(orders.map((o) => {
    const norm = normalizePhoneForFlags(o.customer_phone ?? "");
    const key = phoneKey8(o.customer_phone ?? "");
    const email = String(o.customer_email ?? "").trim().toLowerCase();
    const stat = norm ? byNorm.get(norm) : undefined;
    return [o.id, {
      is_vip: !!stat && (stat.completed >= vipOrders || stat.spent >= vipSpend),
      is_repeat: !!norm && ((stat?.total ?? 0) >= 2 || repeatNorms.has(norm)),
      is_duplicate: ACTIVE_ORDER_STATUSES.has(String(o.status)) && ((!!key && (byKey.get(key) ?? 0) >= 2) || (!!email && (byEmail.get(email) ?? 0) >= 2)),
      returned_count: stat?.returned ?? 0,
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
      // Filter by the dedicated `incomplete` status so the list always matches the tab count.
      let qb: any = context.supabase
        .from("orders")
        .select(ORDER_LIST_SELECT, { count: "exact" })
        .eq("status", "incomplete");
      qb = applyCommonFilters(qb, data);
      qb = applyOmsAccessFilter(qb, omsAllowed);
      let { data: rows, error, count } = await qb
        .order("created_at", { ascending: false })
        .range(offset, offset + data.limit - 1);
      if (isRangeNotSatisfiable(error)) {
        let cq: any = context.supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "incomplete");
        cq = applyCommonFilters(cq, data);
        cq = applyOmsAccessFilter(cq, omsAllowed);
        const { count: c2, error: countError } = await cq;
        if (countError) throw new Error(countError.message);
        count = c2 ?? 0;
        const fallbackPage = Math.max(1, Math.ceil((count || 0) / data.limit));
        if ((count || 0) > 0) {
          let fallbackQb: any = context.supabase
            .from("orders")
            .select(ORDER_LIST_SELECT, { count: "exact" })
            .eq("status", "incomplete");
          fallbackQb = applyCommonFilters(fallbackQb, data);
          fallbackQb = applyOmsAccessFilter(fallbackQb, omsAllowed);
          const fallbackOffset = (fallbackPage - 1) * data.limit;
          const { data: fallbackRows, error: fallbackError } = await fallbackQb
            .order("created_at", { ascending: false })
            .range(fallbackOffset, fallbackOffset + data.limit - 1);
          if (fallbackError) throw new Error(fallbackError.message);
          rows = fallbackRows ?? [];
        } else {
          rows = [];
        }
        error = null as any;
      }
      if (error) throw new Error(error.message);
      const orders = rows ?? [];



      const userIds = Array.from(new Set([
        ...orders.map((o: any) => o.created_by).filter(Boolean),
        ...orders.map((o: any) => o.updated_by).filter(Boolean),
      ]));
      let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length) {
        const { data: profs } = await context.supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        profileMap = Object.fromEntries((profs ?? []).map((p: any) => [
          p.id,
          { full_name: p.full_name, email: p.email },
        ]));
      }

      // Resolve source site (WP integration) name for each row so the UI can show which site each incomplete order came from.
      const siteIds = Array.from(new Set(orders.map((o: any) => o.source_site_id).filter(Boolean))) as string[];
      let siteMap: Record<string, string | null> = {};
      if (siteIds.length) {
        const { data: sites } = await context.supabase
          .from("integrations")
          .select("id, name, site_url")
          .in("id", siteIds);
        siteMap = Object.fromEntries((sites ?? []).map((s: any) => [
          s.id,
          s.name || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : null),
        ]));
      }
      const flagMap = await getVisibleOrderFlags(context.supabase, orders);

      return {
        rows: orders.map((o: any) => ({
          ...o,
          creator: o.created_by ? (profileMap[o.created_by] ?? null) : null,
          editor: o.updated_by ? (profileMap[o.updated_by] ?? null) : null,
          site_name: o.source_site_id ? (siteMap[o.source_site_id] ?? null) : null,
          customer_flags: flagMap[o.id] ?? { is_vip: false, is_repeat: false, is_duplicate: false, returned_count: 0 },
        })),
        totalCount: count ?? 0,
        currentPage: Math.min(data.page, Math.max(1, Math.ceil((count ?? 0) / data.limit) || 1)),
      };
    }

    let qb: any = context.supabase
      .from("orders")
      .select(ORDER_LIST_SELECT, { count: "exact" });
    qb = applyFilters(qb, data);
    qb = applyOmsAccessFilter(qb, omsAllowed);
    let { data: rows, error, count } = await qb.order("created_at", { ascending: false }).range(offset, offset + data.limit - 1);
    if (isRangeNotSatisfiable(error)) {
      let cq: any = context.supabase.from("orders").select("id", { count: "exact", head: true });
      cq = applyFilters(cq, data);
      cq = applyOmsAccessFilter(cq, omsAllowed);
      const { count: c2, error: countError } = await cq;
      if (countError) throw new Error(countError.message);
      count = c2 ?? 0;
      const fallbackPage = Math.max(1, Math.ceil((count || 0) / data.limit));
      if ((count || 0) > 0) {
        let fallbackQb: any = context.supabase
          .from("orders")
          .select(ORDER_LIST_SELECT, { count: "exact" });
        fallbackQb = applyFilters(fallbackQb, data);
        fallbackQb = applyOmsAccessFilter(fallbackQb, omsAllowed);
        const fallbackOffset = (fallbackPage - 1) * data.limit;
        const { data: fallbackRows, error: fallbackError } = await fallbackQb
          .order("created_at", { ascending: false })
          .range(fallbackOffset, fallbackOffset + data.limit - 1);
        if (fallbackError) throw new Error(fallbackError.message);
        rows = fallbackRows ?? [];
      } else {
        rows = [];
      }
      error = null as any;
    }
    if (error) throw new Error(error.message);

    const orders = rows ?? [];

    const userIds = Array.from(new Set([
      ...orders.map((o: any) => o.created_by).filter(Boolean),
      ...orders.map((o: any) => o.updated_by).filter(Boolean),
    ]));
    let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await context.supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
    }

    // Resolve source site (WP integration) name for each row so the UI can show which site each order came from.
    const siteIds = Array.from(new Set(orders.map((o: any) => o.source_site_id).filter(Boolean))) as string[];
    let siteMap: Record<string, string | null> = {};
    if (siteIds.length) {
      const { data: sites } = await context.supabase
        .from("integrations")
        .select("id, name, site_url")
        .in("id", siteIds);
      siteMap = Object.fromEntries((sites ?? []).map((s: any) => [
        s.id,
        s.name || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : null),
      ]));
    }
    const flagMap = await getVisibleOrderFlags(context.supabase, orders);

    return {
      rows: orders.map((o: any) => ({
        ...o,
        creator: o.created_by ? (profileMap[o.created_by] ?? null) : null,
        editor: o.updated_by ? (profileMap[o.updated_by] ?? null) : null,
        site_name: o.source_site_id ? (siteMap[o.source_site_id] ?? null) : null,
        customer_flags: flagMap[o.id] ?? { is_vip: false, is_repeat: false, is_duplicate: false, returned_count: 0 },
      })),
      totalCount: count ?? 0,
      currentPage: Math.min(data.page, Math.max(1, Math.ceil((count ?? 0) / data.limit) || 1)),
    };
  });

export const getOrderCountsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OrdersInput.omit({ status: true, page: true, limit: true }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const omsAllowed = await getAllowedOmsSenders(context);
    const countArgs: any = {
      p_source: data.source === "all" ? null : data.source,
      p_site: data.site === "all" ? null : data.site,
      p_courier: data.courier === "all" ? null : data.courier,
      p_partner: data.partner === "all" ? null : data.partner,
      p_staff: data.staff === "all" ? null : data.staff,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
      p_search: data.q || null,
      p_phones: data.tagPhones ?? null,
      p_advance_only: data.advanceOnly || null,
      p_oms_restricted: omsAllowed !== null,
      p_allowed_oms: omsAllowed ?? null,
    };
    const { data: tabCountsData, error } = await (context.supabase as any).rpc("get_order_tab_counts_v2", countArgs);
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await context.supabase.from("orders").select("id", { count: "exact", head: true }).eq("preorder", true).not("preorder_date", "is", null).lte("preorder_date", today);
    const normalized = tabCountsData && typeof tabCountsData === "object"
      ? {
          ...(tabCountsData as Record<string, unknown>),
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
        };
    return { tabCountsData: normalized, preorderDueCount: count ?? 0 };
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
      const { data: rows, error } = await buildQuery()
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const list = rows ?? [];
      out.push(...list);
      if (list.length < EXPORT_CHUNK) break;
      from += EXPORT_CHUNK;
    }
    return { rows: out };
  });
