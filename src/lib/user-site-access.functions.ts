import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const [a, o] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "business_owner" }),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (o.error) throw new Error(o.error.message);
  if (!a.data && !o.data) throw new Error("Admin access required");
}

export const listUserSiteAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("user_site_access")
      .select("user_id, site_id");
    if (error) throw new Error(error.message);
    return (data ?? []) as { user_id: string; site_id: string }[];
  });

export const setUserSiteAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      siteIds: z.array(z.string().uuid()).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error: delErr } = await context.supabase
      .from("user_site_access")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    if (data.siteIds.length) {
      const rows = data.siteIds.map((site_id) => ({
        user_id: data.userId,
        site_id,
        created_by: context.userId,
      }));
      const { error: insErr } = await context.supabase
        .from("user_site_access")
        .insert(rows as never);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true, count: data.siteIds.length };
  });
