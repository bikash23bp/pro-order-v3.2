import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTIVE_STATUSES, dupPhoneKey, normalizeEmailValue } from "./duplicates.shared";

export const checkDuplicatePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z.string().max(50).default(""),
        email: z.string().max(255).optional().nullable(),
        excludeId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const key8 = dupPhoneKey(data.phone);
    const emailNorm = normalizeEmailValue(data.email ?? null);
    if (!key8 && !emailNorm) return { count: 0, otherIds: [] as string[], orders: [] as Array<{ id: string; order_number: number; status: string; created_at: string; matched_by: ("phone" | "email")[] }> };

    type Row = { id: string; order_number: number; status: string; created_at: string; customer_phone: string };
    const byId = new Map<string, Row & { matched_by: Set<"phone" | "email"> }>();
    const activeList = [...ACTIVE_STATUSES];

    if (key8) {
      // Pull recent active orders and filter by last-8 suffix in JS (the DB
      // doesn't have a last-8 index; this stays bounded by .in(active) + limit).
      let q = supabase
        .from("orders")
        .select("id, order_number, status, created_at, customer_phone")
        .ilike("customer_phone", `%${key8}%`)
        .in("status", activeList)
        .order("created_at", { ascending: false })
        .limit(200);
      if (data.excludeId) q = q.neq("id", data.excludeId);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as Row[]) {
        if (dupPhoneKey(r.customer_phone) !== key8) continue;
        const e = byId.get(r.id) ?? { ...r, matched_by: new Set<"phone" | "email">() };
        e.matched_by.add("phone");
        byId.set(r.id, e);
      }
    }

    if (emailNorm) {
      let q = supabase
        .from("orders")
        .select("id, order_number, status, created_at, customer_phone")
        .ilike("customer_email", emailNorm)
        .in("status", activeList)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data.excludeId) q = q.neq("id", data.excludeId);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as Row[]) {
        const e = byId.get(r.id) ?? { ...r, matched_by: new Set<"phone" | "email">() };
        e.matched_by.add("email");
        byId.set(r.id, e);
      }
    }

    const orders = Array.from(byId.values())
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({
        id: r.id,
        order_number: r.order_number,
        status: r.status,
        created_at: r.created_at,
        matched_by: Array.from(r.matched_by),
      }));
    return { count: orders.length, otherIds: orders.map((o) => o.id), orders };
  });

// Backed by SQL function so we get accurate results across the entire orders
// table (no 1000-row PostgREST cap — uses array-returning wrapper).
export const getDuplicatePhones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_duplicate_active_phones_array");
    if (error) throw new Error(error.message);
    const obj = (data ?? {}) as { phones?: string[]; emails?: string[]; phonesNormalized?: string[] };
    return {
      phones: obj.phones ?? [],
      emails: obj.emails ?? [],
      phonesNormalized: obj.phonesNormalized ?? [],
    };
  });

// Repeat customers: any phone in imported_customers / membership_customers,
// OR a phone that has placed >= 2 orders. Last-8 digit keys, computed in SQL.
export const getRepeatPhones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_repeat_phones_array");
    if (error) throw new Error(error.message);
    return { phones: (data ?? []) as string[] };
  });
