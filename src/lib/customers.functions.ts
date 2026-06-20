import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CustomerTag } from "@/lib/tags.functions";

export type CustomerTagDetail = {
  tag: CustomerTag;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export type CustomerStat = {
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_spent: number;
  last_order_at: string | null;
  first_order_at: string | null;
  is_vip: boolean;
  is_wholesale: boolean;
  sources: string[];
  products: string[];
  has_discount: boolean;
  tags: CustomerTag[];
  tag_details: CustomerTagDetail[];
};

async function getThresholds(supabase: any) {
  const { data } = await supabase
    .from("app_settings")
    .select("vip_spend_threshold, vip_order_threshold")
    .eq("id", true)
    .maybeSingle();
  return {
    spend: Number(data?.vip_spend_threshold ?? 10000),
    orders: Number(data?.vip_order_threshold ?? 5),
  };
}

const SORT_COLS = new Set([
  "total_spent",
  "total_orders",
  "completed_orders",
  "cancelled_orders",
  "last_order_at",
  "first_order_at",
  "name",
  "phone",
]);

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(5000).default(25),
        q: z.string().trim().max(128).optional().nullable(),
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
        sortBy: z.string().max(64).optional().nullable(),
        sortDir: z.enum(["asc", "desc"]).optional().nullable(),
        enrich: z.boolean().optional().default(true),
        customerType: z.enum(["retail", "wholesale"]).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const page = data.page ?? 1;
    const limit = data.limit ?? 25;
    const sortBy = SORT_COLS.has(data.sortBy ?? "") ? (data.sortBy as string) : "total_spent";
    const sortDir = data.sortDir ?? "desc";

    let q = supabase.from("customer_stats").select("*", { count: "exact" });
    if (data.q) {
      const s = data.q.replace(/[%_,]/g, " ").trim();
      if (s) {
        const digits = s.replace(/\D/g, "");
        const parts = [`name.ilike.%${s}%`, `email.ilike.%${s}%`];
        if (digits.length >= 3) {
          const needle = digits.length >= 8 ? digits.slice(-8) : digits;
          parts.push(`phone.ilike.%${needle}%`);
        } else {
          parts.push(`phone.ilike.%${s}%`);
        }
        q = q.or(parts.join(","));
      }
    }
    if (data.from) q = q.gte("last_order_at", data.from);
    if (data.to) q = q.lte("last_order_at", data.to);
    if (data.customerType === "wholesale") {
      q = q.eq("is_wholesale" as never, true as never);
    } else if (data.customerType === "retail") {
      q = q.or("is_wholesale.is.null,is_wholesale.eq.false");
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const [{ data: rows, count, error }, t] = await Promise.all([
      q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false }).range(from, to),
      getThresholds(supabase),
    ]);
    if (error) throw new Error(error.message);

    const phones = ((rows ?? []) as any[]).map((r) => r.phone).filter(Boolean);
    let enrich: Record<string, { sources: string[]; products: string[]; has_discount: boolean; tags: CustomerTag[]; tag_details: CustomerTagDetail[] }> = {};
    if (data.enrich !== false && phones.length) {
      enrich = await enrichPhones(supabase, phones);
    }

    const out = ((rows ?? []) as any[]).map((r) => {
      const e = enrich[r.phone];
      return {
        ...r,
        total_spent: Number(r.total_spent),
        is_vip:
          Number(r.completed_orders) >= t.orders || Number(r.total_spent) >= t.spend,
        is_wholesale: !!r.is_wholesale,
        sources: e?.sources ?? [],
        products: e?.products ?? [],
        has_discount: e?.has_discount ?? false,
        tags: e?.tags ?? [],
        tag_details: e?.tag_details ?? [],
      } as CustomerStat;
    });

    return { rows: out, total: count ?? out.length };
  });

async function enrichPhones(supabase: any, phones: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < phones.length; i += 300) chunks.push(phones.slice(i, i + 300));
  const ordersChunks = await Promise.all(
    chunks.map((ch) =>
      supabase
        .from("orders")
        .select("customer_phone, source, order_source_id, discount_amount, order_items(products(name))")
        .in("customer_phone", ch),
    ),
  );
  const tagsChunks = await Promise.all(
    chunks.map((ch) =>
      supabase
        .from("customer_tags")
        .select("phone, tag, created_at, created_by")
        .in("phone", ch)
        .order("created_at", { ascending: false }),
    ),
  );
  const sourcesRes = await supabase.from("order_sources").select("id, name");
  const ordersRes = { data: ordersChunks.flatMap((r: any) => r.data ?? []) };
  const tagsRes = { data: tagsChunks.flatMap((r: any) => r.data ?? []) };

  const sourceNameById = new Map<string, string>();
  for (const s of (sourcesRes.data ?? []) as any[]) {
    if (s?.id && s?.name) sourceNameById.set(s.id, s.name);
  }

  const taggerIds = Array.from(
    new Set(((tagsRes.data ?? []) as any[]).map((r) => r.created_by).filter(Boolean)),
  ) as string[];
  const nameById = new Map<string, string>();
  if (taggerIds.length) {
    const { data: names } = await supabase.rpc("get_user_display_names", { p_ids: taggerIds });
    for (const n of (names ?? []) as any[]) {
      if (n?.id) nameById.set(n.id, n.display_name);
    }
  }

  const tagsByPhone = new Map<string, CustomerTag[]>();
  const detailsByPhone = new Map<string, CustomerTagDetail[]>();
  for (const r of (tagsRes.data ?? []) as any[]) {
    const k = (r.phone as string).trim();
    if (!k) continue;
    const arr = tagsByPhone.get(k) ?? [];
    if (!arr.includes(r.tag)) arr.push(r.tag);
    tagsByPhone.set(k, arr);
    const det = detailsByPhone.get(k) ?? [];
    det.push({
      tag: r.tag,
      created_at: r.created_at,
      created_by: r.created_by ?? null,
      created_by_name: r.created_by ? (nameById.get(r.created_by) ?? null) : null,
    });
    detailsByPhone.set(k, det);
  }

  const meta = new Map<string, { sources: Set<string>; products: Set<string>; has_discount: boolean }>();
  for (const o of (ordersRes.data ?? []) as any[]) {
    const phone = (o.customer_phone ?? "").trim();
    if (!phone) continue;
    let m = meta.get(phone);
    if (!m) { m = { sources: new Set(), products: new Set(), has_discount: false }; meta.set(phone, m); }
    const named = o.order_source_id ? sourceNameById.get(o.order_source_id) : null;
    if (named) m.sources.add(named);
    else if (o.source) m.sources.add(o.source);
    if (Number(o.discount_amount ?? 0) > 0) m.has_discount = true;
    for (const it of (o.order_items ?? [])) {
      const name = it?.products?.name;
      if (name) m.products.add(name);
    }
  }

  const out: Record<string, any> = {};
  for (const p of phones) {
    const m = meta.get(p);
    out[p] = {
      sources: m ? Array.from(m.sources) : [],
      products: m ? Array.from(m.products) : [],
      has_discount: m?.has_discount ?? false,
      tags: tagsByPhone.get(p) ?? [],
      tag_details: detailsByPhone.get(p) ?? [],
    };
  }
  return out;
}

export const getCustomersForExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().trim().max(128).optional().nullable(),
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
        // Selected-only export: when present, ignore filters and return exactly these phones
        phones: z.array(z.string().min(1).max(64)).max(500_000).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const t = await getThresholds(supabase);
    const CHUNK = 1000;
    const SAFETY_CAP = 500_000;
    const out: any[] = [];

    if (data.phones && data.phones.length > 0) {
      const phones = Array.from(new Set(data.phones));
      for (let i = 0; i < phones.length; i += CHUNK) {
        const slice = phones.slice(i, i + CHUNK);
        const { data: rows, error } = await supabase
          .from("customer_stats")
          .select("*")
          .in("phone", slice);
        if (error) throw new Error(error.message);
        out.push(...(rows ?? []));
      }
    } else {
      const buildBase = () => {
        let q = supabase.from("customer_stats").select("*");
        if (data.q) {
          const s = data.q.replace(/[%_,]/g, " ").trim();
          if (s) {
            const digits = s.replace(/\D/g, "");
            const parts = [`name.ilike.%${s}%`, `email.ilike.%${s}%`];
            if (digits.length >= 3) {
              const needle = digits.length >= 8 ? digits.slice(-8) : digits;
              parts.push(`phone.ilike.%${needle}%`);
            } else {
              parts.push(`phone.ilike.%${s}%`);
            }
            q = q.or(parts.join(","));
          }
        }
        if (data.from) q = q.gte("last_order_at", data.from);
        if (data.to) q = q.lte("last_order_at", data.to);
        return q;
      };

      let from = 0;
      while (from < SAFETY_CAP) {
        const to = from + CHUNK - 1;
        const { data: rows, error } = await buildBase()
          .order("total_spent", { ascending: false })
          .range(from, to);
        if (error) throw new Error(error.message);
        const list = rows ?? [];
        out.push(...list);
        if (list.length < CHUNK) break;
        from += CHUNK;
      }
    }

    return out.map((r: any) => ({
      ...r,
      total_spent: Number(r.total_spent),
      is_vip:
        Number(r.completed_orders) >= t.orders || Number(r.total_spent) >= t.spend,
    })) as CustomerStat[];
  });

export const getCustomerInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const phone = data.phone.trim();
    const digits = phone.replace(/\D/g, "");
    const norm = digits.length >= 7 ? digits.slice(-11) : phone;
    const [{ data: rows, error }, t] = await Promise.all([
      supabase
        .from("orders")
        .select("customer_name, customer_email, customer_address, customer_phone, status, total_amount, created_at")
        .eq("phone_normalized", norm)
        .order("created_at", { ascending: false })
        .limit(500),
      getThresholds(supabase),
    ]);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    if (!list.length) return null;
    const completed = list.filter((r) => r.status === "completed").length;
    const cancelled = list.filter((r) => r.status === "cancelled" || r.status === "returned").length;
    const spent = list.reduce((sum, r) => r.status === "cancelled" || r.status === "returned" ? sum : sum + Number(r.total_amount ?? 0), 0);
    const latest = list[0];
    const oldest = list[list.length - 1];
    return {
      phone: latest.customer_phone ?? phone,
      name: latest.customer_name ?? null,
      email: latest.customer_email ?? null,
      address: latest.customer_address ?? null,
      total_orders: list.length,
      completed_orders: completed,
      cancelled_orders: cancelled,
      total_spent: spent,
      last_order_at: latest.created_at ?? null,
      first_order_at: oldest?.created_at ?? null,
      is_vip: completed >= t.orders || spent >= t.spend,
      is_wholesale: false,
      sources: [],
      products: [],
      has_discount: false,
      tags: [],
      tag_details: [],
    } as CustomerStat;
  });

export const getVipPhones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const t = await getThresholds(supabase);
    const { data } = await supabase
      .from("customer_stats")
      .select("phone, completed_orders, total_spent")
      .or(`completed_orders.gte.${t.orders},total_spent.gte.${t.spend}`)
      .limit(20000);
    const set = new Set<string>();
    (data ?? []).forEach((r: any) => set.add(r.phone));
    return Array.from(set);
  });

export const bulkCreateFollowUpTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().max(2000).optional().nullable(),
      assigned_to: z.string().uuid(),
      customers: z.array(z.object({
        name: z.string().max(255).nullable(),
        phone: z.string().min(1).max(64),
      })).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const seen = new Set<string>();
    const rows = data.customers
      .filter((c) => {
        const k = c.phone.trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((c) => ({
        title: data.title,
        description: data.description || null,
        assigned_to: data.assigned_to,
        assigned_by: userId,
        customer_name: c.name,
        customer_phone: c.phone.trim(),
        customer_source: "repeat",
        status: "pending" as const,
      }));
    if (rows.length === 0) return { created: 0 };
    const { error } = await supabase.from("tasks").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  });

export const listFollowUpAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("list_assignable_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; display_name: string; email: string | null; role: string }>;
  });

export const getRepeatCustomerStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().nullable().optional(), to: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("orders").select("customer_phone, created_at").not("customer_phone", "is", null);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.limit(50000);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of (rows ?? []) as any[]) {
      const p = (r.customer_phone ?? "").trim();
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    let total = 0; let repeat = 0;
    counts.forEach((c) => { total += 1; if (c >= 2) repeat += 1; });
    return { total, repeat, percent: total > 0 ? (repeat / total) * 100 : 0 };
  });
