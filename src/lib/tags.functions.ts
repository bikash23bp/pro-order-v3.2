import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CUSTOMER_TAGS = [
  "new_customer",
  "interested",
  "vip",
  "silver",
  "gold",
  "premium",
  "retail",
  "wholesale",
] as const;

export type CustomerTag = (typeof CUSTOMER_TAGS)[number];

export const TAG_LABEL: Record<CustomerTag, string> = {
  new_customer: "New Customer",
  interested: "Interested",
  vip: "VIP",
  silver: "Silver",
  gold: "Gold",
  premium: "Premium",
  retail: "Retail",
  wholesale: "Wholesale",
};

// tailwind classes per tag for badge color
export const TAG_TONE: Record<CustomerTag, string> = {
  new_customer: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  interested: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  vip: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  silver: "bg-zinc-400/15 text-zinc-300 border-zinc-400/40",
  gold: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  premium: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  retail: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  wholesale: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const tagEnum = z.enum(CUSTOMER_TAGS);
const phoneSchema = z.string().trim().min(1).max(64);

export type CustomerTagRow = { phone: string; tags: CustomerTag[] };

/** Normalize a phone the same way `orders.phone_normalized` does in the DB:
 *  last 11 digits. Used for cross-table joins (orders ↔ customer_tags). */
export function normalizePhoneKey(p: string | null | undefined): string {
  const digits = String(p ?? "").replace(/\D/g, "");
  return digits.slice(-11);
}

export const listAllTagsByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      tag: z.enum(CUSTOMER_TAGS).optional(),
      maxRows: z.number().min(1).max(50000).default(10000),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Chunked range fetch — Supabase caps a single .select() at 1000 rows.
    // Loop in pages until we hit maxRows or the page is short.
    const pageSize = 1000;
    const map: Record<string, CustomerTag[]> = {};
    let from = 0;
    while (from < data.maxRows) {
      const to = Math.min(from + pageSize, data.maxRows) - 1;
      let q = supabase.from("customer_tags").select("phone, tag").range(from, to);
      if (data.tag) q = q.eq("tag", data.tag);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      const list = (rows ?? []) as Array<{ phone: string; tag: CustomerTag }>;
      for (const r of list) {
        const k = normalizePhoneKey(r.phone);
        if (!k) continue;
        if (!map[k]) map[k] = [];
        if (!map[k].includes(r.tag)) map[k].push(r.tag);
      }
      if (list.length < pageSize) break;
      from += pageSize;
    }
    return map;
  });


export const listCustomerTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phones: z.array(phoneSchema).max(2000).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("customer_tags").select("phone, tag");
    if (data.phones && data.phones.length) q = q.in("phone", data.phones);
    const { data: rows, error } = await q.limit(5000);
    if (error) throw new Error(error.message);
    const map = new Map<string, Set<CustomerTag>>();
    for (const r of (rows ?? []) as any[]) {
      const k = (r.phone as string).trim();
      if (!k) continue;
      let s = map.get(k);
      if (!s) { s = new Set(); map.set(k, s); }
      s.add(r.tag as CustomerTag);
    }
    const out: CustomerTagRow[] = [];
    map.forEach((s, phone) => out.push({ phone, tags: Array.from(s) }));
    return out;
  });

export const getCustomerTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: phoneSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("customer_tags")
      .select("tag")
      .eq("phone", data.phone.trim());
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => r.tag as CustomerTag);
  });

export const setCustomerTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: phoneSchema,
      tags: z.array(tagEnum).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const phone = data.phone.trim();
    const desired = new Set(data.tags);

    const { data: existing, error: e1 } = await supabase
      .from("customer_tags")
      .select("tag")
      .eq("phone", phone);
    if (e1) throw new Error(e1.message);
    const current = new Set((existing ?? []).map((r: any) => r.tag as CustomerTag));

    const toAdd: CustomerTag[] = [...desired].filter((t) => !current.has(t));
    const toRemove: CustomerTag[] = [...current].filter((t) => !desired.has(t));

    if (toAdd.length) {
      const { error } = await supabase
        .from("customer_tags")
        .upsert(
          toAdd.map((tag) => ({ phone, tag, created_by: userId })),
          { onConflict: "phone,tag", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    }
    if (toRemove.length) {
      const { error } = await supabase
        .from("customer_tags")
        .delete()
        .eq("phone", phone)
        .in("tag", toRemove);
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length, removed: toRemove.length };
  });

export const bulkAddTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phones: z.array(phoneSchema).min(1).max(2000),
      tag: tagEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const seen = new Set<string>();
    const rows = data.phones
      .map((p) => p.trim())
      .filter((p) => {
        if (!p || seen.has(p)) return false;
        seen.add(p);
        return true;
      })
      .map((phone) => ({ phone, tag: data.tag, created_by: userId }));
    if (rows.length === 0) return { added: 0 };
    // upsert by unique (phone, tag)
    const { error } = await supabase
      .from("customer_tags")
      .upsert(rows, { onConflict: "phone,tag", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const bulkRemoveTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phones: z.array(phoneSchema).min(1).max(2000),
      tag: tagEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("customer_tags")
      .delete()
      .eq("tag", data.tag)
      .in("phone", data.phones.map((p) => p.trim()));
    if (error) throw new Error(error.message);
    return { ok: true };
  });
