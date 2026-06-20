import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const normalize = (p: string) => {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length ? digits.slice(-11) : null;
};

export const listBlockedCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string }) =>
    z.object({ search: z.string().max(100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("blocked_customers")
      .select("id, phone_normalized, ip_address, reason, blocked_by, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.search) {
      const s = data.search.trim();
      const phoneNorm = normalize(s);
      if (phoneNorm) {
        q = q.or(`phone_normalized.ilike.%${phoneNorm}%,reason.ilike.%${s}%`);
      } else {
        q = q.ilike("reason", `%${s}%`);
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.blocked_by).filter(Boolean))) as string[];
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: names } = await supabase.rpc("get_user_display_names", { p_ids: ids });
      nameMap = Object.fromEntries((names ?? []).map((n: { id: string; display_name: string }) => [n.id, n.display_name]));
    }
    return (rows ?? []).map((r) => ({
      ...r,
      ip_address: r.ip_address ? String(r.ip_address) : null,
      blocked_by_name: r.blocked_by ? nameMap[r.blocked_by] ?? "User" : null,
    }));
  });

export const blockCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone?: string; ip?: string; reason: string }) =>
    z
      .object({
        phone: z.string().max(30).optional(),
        ip: z.string().max(64).optional(),
        reason: z.string().trim().min(1, "Reason is required").max(500),
      })
      .refine((v) => (v.phone && v.phone.trim()) || (v.ip && v.ip.trim()), {
        message: "Phone or IP is required",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const phoneNorm = data.phone ? normalize(data.phone) : null;
    const ip = data.ip?.trim() || null;
    if (!phoneNorm && !ip) throw new Error("Phone or IP is required");
    const row = {
      reason: data.reason.trim(),
      blocked_by: userId,
      phone_normalized: phoneNorm,
      ip_address: ip,
    };
    const cols = "id, phone_normalized, ip_address, reason, blocked_by, created_at";
    const existingQuery = supabase.from("blocked_customers").select(cols).limit(1);
    const { data: existing } = phoneNorm
      ? await existingQuery.eq("phone_normalized", phoneNorm).maybeSingle()
      : await existingQuery.eq("ip_address", ip!).maybeSingle();
    let result;
    if (existing) {
      const { data: updated, error } = await supabase
        .from("blocked_customers")
        .update({ reason: row.reason, blocked_by: userId })
        .eq("id", (existing as any).id)
        .select(cols)
        .single();
      if (error) throw new Error(error.message);
      result = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("blocked_customers")
        .insert(row)
        .select(cols)
        .single();
      if (error) throw new Error(error.message);
      result = inserted;
    }
    return {
      ...result,
      ip_address: result.ip_address ? String(result.ip_address) : null,
    };
  });

export const unblockCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("blocked_customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUnblockCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("blocked_customers")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, removed: count ?? 0 };
  });

export const checkBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone?: string; ip?: string }) =>
    z.object({ phone: z.string().max(30).optional(), ip: z.string().max(64).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const phoneNorm = data.phone ? normalize(data.phone) : null;
    const ip = data.ip?.trim() || null;
    if (!phoneNorm && !ip) return { blocked: false as const };

    const filters: string[] = [];
    if (phoneNorm) filters.push(`phone_normalized.eq.${phoneNorm}`);
    if (ip) filters.push(`ip_address.eq.${ip}`);
    const { data: row, error } = await supabase
      .from("blocked_customers")
      .select("id, reason, blocked_by, created_at, phone_normalized, ip_address")
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { blocked: false as const };

    let blockedByName: string | null = null;
    if (row.blocked_by) {
      const { data: names } = await supabase.rpc("get_user_display_names", { p_ids: [row.blocked_by] });
      blockedByName = (names?.[0] as { display_name?: string } | undefined)?.display_name ?? null;
    }
    return {
      blocked: true as const,
      reason: row.reason,
      blocked_by_name: blockedByName,
      blocked_at: row.created_at,
    };
  });

export const checkBlockedPhones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phones: string[] }) =>
    z.object({ phones: z.array(z.string().max(30)).max(500) }).parse(input ?? { phones: [] }),
  )
  .handler(async ({ data, context }) => {
    const norms = Array.from(
      new Set(data.phones.map((p) => normalize(p)).filter((v): v is string => !!v)),
    );
    if (!norms.length) return {} as Record<string, string>;
    const { data: rows, error } = await context.supabase
      .from("blocked_customers")
      .select("phone_normalized, reason")
      .in("phone_normalized", norms);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const r of rows ?? []) {
      if (r.phone_normalized) map[r.phone_normalized] = r.reason;
    }
    return map;
  });

export const getMyIp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      (getRequestHeader("x-forwarded-for") || "").split(",")[0].trim() ||
      null;
    return { ip };
  });
