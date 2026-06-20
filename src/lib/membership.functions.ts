import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MembershipCustomer = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  tier: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_orders: number;
  cancelled_orders: number;
  total_spent: number;
  last_order_at: string | null;
  sources: string[];
  products: string[];
  has_discount: boolean;
};

const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-11) || p.trim();

const memberInput = z.object({
  name: z.string().max(255).optional().nullable(),
  phone: z.string().min(3).max(32),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  address: z.string().max(1000).optional().nullable(),
  date_of_birth: z.string().optional().nullable().or(z.literal("")),
  tier: z.string().max(64).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listMembershipCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("membership_customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    type Agg = {
      total_orders: number;
      cancelled_orders: number;
      total_spent: number;
      last_order_at: string | null;
      sources: Set<string>;
      products: Set<string>;
      has_discount: boolean;
    };
    const byPhone = new Map<string, Agg>();

    // Only fetch orders that belong to current members — chunked .in() to stay
    // under URL limits. Previously we pulled 5000 random orders and ignored most.
    const memberPhones = Array.from(new Set(
      ((members ?? []) as Array<{ phone: string }>)
        .map((m) => normalizePhone(m.phone))
        .filter((p) => !!p),
    ));
    if (memberPhones.length > 0) {
      const chunk = 300;
      for (let i = 0; i < memberPhones.length; i += chunk) {
        const slice = memberPhones.slice(i, i + chunk);
        const { data: orders, error: oe } = await supabase
          .from("orders")
          .select("customer_phone, phone_normalized, source, status, discount_amount, total_amount, created_at, order_items(products(name))")
          .in("phone_normalized", slice);
        if (oe) throw new Error(oe.message);
        for (const o of (orders ?? []) as any[]) {
          const key = (o.phone_normalized || normalizePhone(o.customer_phone ?? "")) as string;
          if (!key) continue;
          let a = byPhone.get(key);
          if (!a) {
            a = { total_orders: 0, cancelled_orders: 0, total_spent: 0, last_order_at: null, sources: new Set(), products: new Set(), has_discount: false };
            byPhone.set(key, a);
          }
          a.total_orders += 1;
          if (o.status === "cancelled") a.cancelled_orders += 1;
          a.total_spent += Number(o.total_amount ?? 0);
          if (!a.last_order_at || (o.created_at && o.created_at > a.last_order_at)) a.last_order_at = o.created_at;
          if (o.source) a.sources.add(o.source);
          if (Number(o.discount_amount ?? 0) > 0) a.has_discount = true;
          for (const it of (o.order_items ?? [])) {
            const n = it?.products?.name;
            if (n) a.products.add(n);
          }
        }
      }
    }

    return ((members ?? []) as any[]).map((m) => {
      const key = normalizePhone(m.phone);
      const a = byPhone.get(key);
      return {
        ...m,
        total_orders: a?.total_orders ?? 0,
        cancelled_orders: a?.cancelled_orders ?? 0,
        total_spent: a?.total_spent ?? 0,
        last_order_at: a?.last_order_at ?? null,
        sources: a ? Array.from(a.sources) : [],
        products: a ? Array.from(a.products) : [],
        has_discount: a?.has_discount ?? false,
      } as MembershipCustomer;
    });
  });

export const addMembershipCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      name: data.name?.trim() || null,
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      date_of_birth: data.date_of_birth ? data.date_of_birth : null,
      tier: data.tier?.trim() || "standard",
      notes: data.notes?.trim() || null,
      created_by: userId,
    };
    const { data: r, error } = await supabase
      .from("membership_customers")
      .upsert(row, { onConflict: "phone" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return r;
  });

export const updateMembershipCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    memberInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("membership_customers")
      .update({
        name: patch.name?.trim() || null,
        phone: patch.phone.trim(),
        email: patch.email?.trim() || null,
        address: patch.address?.trim() || null,
        date_of_birth: patch.date_of_birth ? patch.date_of_birth : null,
        tier: patch.tier?.trim() || "standard",
        notes: patch.notes?.trim() || null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMembershipCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("membership_customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      customers: z.array(z.object({
        name: z.string().nullable().optional(),
        phone: z.string().min(3).max(32),
        email: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
      })).min(1).max(2000),
      tier: z.string().max(64).optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tier = data.tier?.trim() || "standard";
    const rows = data.customers
      .filter((c) => c.phone && c.phone.trim())
      .map((c) => ({
        name: c.name?.trim() || null,
        phone: c.phone.trim(),
        email: c.email?.trim() || null,
        address: c.address?.trim() || null,
        tier,
        created_by: userId,
      }));
    if (rows.length === 0) return { inserted: 0 };
    const { data: r, error } = await supabase
      .from("membership_customers")
      .upsert(rows, { onConflict: "phone", ignoreDuplicates: false })
      .select("id");
    if (error) throw new Error(error.message);
    return { inserted: r?.length ?? 0 };
  });

export const importMembershipCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(z.object({
        name: z.string().nullable().optional(),
        phone: z.string().min(3).max(32),
        email: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        date_of_birth: z.string().nullable().optional(),
      })).min(1).max(5000),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.rows
      .filter((r) => r.phone && r.phone.trim())
      .map((r) => ({
        name: r.name?.trim() || null,
        phone: r.phone.trim(),
        email: r.email?.trim() || null,
        address: r.address?.trim() || null,
        date_of_birth: r.date_of_birth?.trim() || null,
        tier: "standard",
        created_by: userId,
      }));
    if (rows.length === 0) return { inserted: 0, skipped: data.rows.length };
    const { data: ins, error } = await supabase
      .from("membership_customers")
      .upsert(rows, { onConflict: "phone", ignoreDuplicates: false })
      .select("id");
    if (error) throw new Error(error.message);
    return { inserted: ins?.length ?? 0, skipped: data.rows.length - rows.length };
  });
