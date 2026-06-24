import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReviewRow = {
  id: string;
  phone: string;
  customer_name: string | null;
  order_id: string | null;
  order_number: number | null;
  rating: number;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

const phoneSchema = z.string().trim().min(1).max(64);

async function nameMap(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return out;
  const { data } = await supabase.rpc("get_user_display_names", { p_ids: uniq });
  for (const n of (data ?? []) as any[]) if (n?.id) out.set(n.id, n.display_name);
  return out;
}

async function orderNumberMap(supabase: any, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return out;
  const { data } = await supabase.from("orders").select("id, order_number").in("id", uniq);
  for (const r of (data ?? []) as any[]) if (r?.id) out.set(r.id, r.order_number);
  return out;
}

function enrich(rows: any[], names: Map<string, string>, orderNums: Map<string, number>): ReviewRow[] {
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    customer_name: r.customer_name,
    order_id: r.order_id,
    order_number: r.order_id ? orderNums.get(r.order_id) ?? null : null,
    rating: Number(r.rating),
    note: r.note,
    created_by: r.created_by,
    created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
    created_at: r.created_at,
  }));
}

export const listReviewsByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await (supabase as any)
      .from("customer_reviews")
      .select("*")
      .eq("phone", data.phone.trim())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const [names, orderNums] = await Promise.all([
      nameMap(supabase, list.map((r) => r.created_by)),
      orderNumberMap(supabase, list.map((r) => r.order_id)),
    ]);
    return enrich(list, names, orderNums);
  });

export const reviewSummaryByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await (supabase as any)
      .from("customer_reviews")
      .select("rating")
      .eq("phone", data.phone.trim());
    if (error) throw new Error(error.message);
    const arr = (rows ?? []) as Array<{ rating: number }>;
    const count = arr.length;
    const avg = count ? arr.reduce((s, r) => s + Number(r.rating), 0) / count : 0;
    return { count, avg };
  });

export const reviewSummaryByOrderIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderIds: z.array(z.string().uuid()).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    if (data.orderIds.length === 0) return {} as Record<string, { count: number; avg: number }>;
    const { data: rows, error } = await (supabase as any)
      .from("customer_reviews")
      .select("order_id, rating")
      .in("order_id", data.orderIds);
    if (error) throw new Error(error.message);
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of (rows ?? []) as Array<{ order_id: string; rating: number }>) {
      if (!r.order_id) continue;
      const cur = map.get(r.order_id) ?? { sum: 0, count: 0 };
      cur.sum += Number(r.rating);
      cur.count += 1;
      map.set(r.order_id, cur);
    }
    const out: Record<string, { count: number; avg: number }> = {};
    for (const [k, v] of map.entries()) out[k] = { count: v.count, avg: v.sum / v.count };
    return out;
  });

export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: phoneSchema,
      customer_name: z.string().trim().max(255).optional().nullable(),
      order_id: z.string().uuid().optional().nullable(),
      rating: z.number().int().min(1).max(5),
      note: z.string().trim().max(4000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await (supabase as any)
      .from("customer_reviews")
      .insert({
        phone: data.phone.trim(),
        customer_name: data.customer_name?.trim() || null,
        order_id: data.order_id || null,
        rating: data.rating,
        note: data.note?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await (supabase as any).from("customer_reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });