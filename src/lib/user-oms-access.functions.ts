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

export const listUserOmsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from("user_oms_access")
      .select("user_id, sender_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { user_id: string; sender_name: string }[];
  });

export const setUserOmsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      senderNames: z.array(z.string().min(1).max(200)).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error: delErr } = await (context.supabase as any)
      .from("user_oms_access")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    if (data.senderNames.length) {
      const unique = Array.from(new Set(data.senderNames));
      const rows = unique.map((sender_name) => ({
        user_id: data.userId,
        sender_name,
        created_by: context.userId,
      }));
      const { error: insErr } = await (context.supabase as any)
        .from("user_oms_access")
        .insert(rows as never);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true, count: data.senderNames.length };
  });
