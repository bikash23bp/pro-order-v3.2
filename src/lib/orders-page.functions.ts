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

const ORDER_LIST_SELECT = "id, order_number, invoice_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, created_at, consignment_id, tracking_url, invoice_note, internal_note, courier_id, order_source_id, source, preorder, preorder_date, customer_type, created_by, updated_by, oms_sender_name, oms_sender_order_no, source_site_id, is_paid_marketing, order_sources(name)";
const ORDER_LIST_COUNT_MODE: "exact" = "exact";

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
  const cached = OMS_ACCESS_CACHE.get(ctx.userId);
  const cached = OMS_ACCESS_CACHE.get(ctx.userId);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;
  const [rolesRes, profileRes, accessRes] = await Promise.all([
    ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .in("role", ["admin", "business_owner"]),
    ctx.supabase.from("profiles").select("permissions").eq("id", ctx.userId).maybeSingle(),
    (ctx.supabase as any).from("user_oms_access").select("sender_name").eq("user_id", ctx.userId),
  ]);
  const roles = new Set(((rolesRes.data ?? []) as { role: string }[]).map((r) => r.role));
  let value: string[] | null;
  if (roles.has("admin") || roles.has("business_owner")) value = null;
  else if ((profileRes.data?.permissions as any)?.can_view_all_orders) value = null;
  else value = ((accessRes.data ?? []) as { sender_name: string }[]).map((r) => r.sender_name);
  OMS_ACCESS_CACHE.set(ctx.userId, { value, expires: now + OMS_ACCESS_TTL_MS });
  return value;
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
  const orderIds = orders.map((o: any) => o.id).filter(Boolean) as string[];
  const userIds = Array.from(new Set([
    ...orders.map((o: any) => o.created_by).filter(Boolean),
    ...orders.map((o: any) => o.updated_by).filter(Boolean),
  ]));
  const siteIds = Array.from(new Set(orders.map((o: any) => o.source_site_id).filter(Boolean))) as string[];

  const [profileRes, siteRes, itemsRes, flagMap] = await Promise.all([
    userIds.length
      ? context.supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] }),
    siteIds.length
      ? context.supabase.from("integrations").select("id, name, site_url").in("id", siteIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? context.supabase
          .from("order_items")
          .select("order_id, quantity, unit_price, products(name), product_variants(attributes)")
          .in("order_id", orderIds)
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
  const itemMap = new Map<string, any[]>();
  for (const item of itemsRes.data ?? []) {
    const key = String((item as any).order_id ?? "");
    if (!key) continue;
    const list = itemMap.get(key) ?? [];
    list.push({
      quantity: (item as any).quantity,
      unit_price: (item as any).unit_price,
      products: (item as any).products ?? null,
      product_variants: (item as any).product_variants ?? null,
    });
    itemMap.set(key, list);
  }

  return orders.map((o: any) => ({
    ...o,
    order_items: itemMap.get(o.id) ?? [],
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
      // Filter by the dedicated `incomplete` status so the list always matches the tab count.
      let qb: any = context.supabase
        .from("orders")
        .select(ORDER_LIST_SELECT, { count: ORDER_LIST_COUNT_MODE })
        .eq("status", "incomplete");
      qb = applyCommonFilters(qb, data);
      qb = applyOmsAccessFilter(qb, omsAllowed);
      let { data: rows, error, count } = await qb
        .order("created_at", { ascending: false })
        .range(offset, offset + data.limit - 1);
      if (isRangeNotSatisfiable(error)) {
        let fallbackQb: any = context.supabase
          .from("orders")
          .select(ORDER_LIST_SELECT, { count: ORDER_LIST_COUNT_MODE })
          .eq("status", "incomplete");
        fallbackQb = applyCommonFilters(fallbackQb, data);
        fallbackQb = applyOmsAccessFilter(fallbackQb, omsAllowed);
        const { data: fallbackRows, error: fallbackError, count: fallbackCount } = await fallbackQb
          .order("created_at", { ascending: false })
          .range(0, data.limit - 1);
        if (fallbackError) throw new Error(fallbackError.message);
        rows = fallbackRows ?? [];
        count = fallbackCount ?? rows.length;
        data.page = 1;
        error = null as any;
      }
      if (error) throw new Error(error.message);
      const orders = rows ?? [];



      return {
        rows: await enrichOrdersForList(context, orders),
        totalCount: count ?? 0,
        currentPage: Math.min(data.page, Math.max(1, Math.ceil((count ?? 0) / data.limit) || 1)),
      };
    }

    let qb: any = context.supabase
      .from("orders")
      .select(ORDER_LIST_SELECT, { count: ORDER_LIST_COUNT_MODE });
    qb = applyFilters(qb, data);
    qb = applyOmsAccessFilter(qb, omsAllowed);
    let { data: rows, error, count } = await qb.order("created_at", { ascending: false }).range(offset, offset + data.limit - 1);
    if (isRangeNotSatisfiable(error)) {
      let fallbackQb: any = context.supabase
        .from("orders")
        .select(ORDER_LIST_SELECT, { count: ORDER_LIST_COUNT_MODE });
      fallbackQb = applyFilters(fallbackQb, data);
      fallbackQb = applyOmsAccessFilter(fallbackQb, omsAllowed);
      const { data: fallbackRows, error: fallbackError, count: fallbackCount } = await fallbackQb
        .order("created_at", { ascending: false })
        .range(0, data.limit - 1);
      if (fallbackError) throw new Error(fallbackError.message);
      rows = fallbackRows ?? [];
      count = fallbackCount ?? rows.length;
      data.page = 1;
      error = null as any;
    }
    if (error) throw new Error(error.message);

    const orders = rows ?? [];

    return {
      rows: await enrichOrdersForList(context, orders),
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
