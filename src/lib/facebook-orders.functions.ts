import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Lazy admin client — avoids top-level client.server import (keeps service-role key out of client bundle)
const getAdmin = async () => (await import("@/integrations/supabase/client.server")).(await getAdmin());


export const getFacebookSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Admin/permission check happens in the RPC (get_facebook_settings_admin).
    // We use (await getAdmin()) to read secret columns that are revoked from the authenticated role.
    const { userId } = context;
    if (!userId) throw new Error("Unauthorized");
    const { data, error } = await (await getAdmin())
      .from("facebook_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: data ?? {
        id: true,
        access_token: "",
        verify_token: "",
        webhook_secret: "",
        app_id: "",
        app_secret: "",
        enabled: false,
        updated_at: new Date().toISOString(),
      },
    };
  });

const settingsSchema = z.object({
  access_token: z.string().max(2000).optional().nullable(),
  verify_token: z.string().max(500).optional().nullable(),
  webhook_secret: z.string().max(500).optional().nullable(),
  app_id: z.string().max(100).optional().nullable(),
  app_secret: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const saveFacebookSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("facebook_settings")
      .upsert({ id: true, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFacebookPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("facebook_pages")
      .select("*")
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pages: data ?? [] };
  });

const pageSchema = z.object({
  page_id: z.string().min(1).max(100),
  page_name: z.string().min(1).max(200),
  access_token: z.string().max(2000).optional().nullable(),
});

export const upsertFacebookPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("facebook_pages")
      .upsert(
        {
          page_id: data.page_id,
          page_name: data.page_name,
          access_token: data.access_token ?? null,
          status: "active",
          token_status: data.access_token ? "valid" : "missing",
        },
        { onConflict: "page_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFacebookPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("facebook_pages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFacebookOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        q: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        page_id: z.string().max(100).optional(),
        limit: z.number().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, customer_address, total_amount, status, created_at, invoice_note, internal_note, external_order_id",
      )
      .eq("source", "facebook")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.q) q = q.ilike("customer_phone", `%${data.q}%`);
    if (data.status) q = q.eq("status", data.status as never);
    else q = q.eq("status", "processing" as never);
    if (data.page_id) q = q.eq("external_order_id", data.page_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

export const getFacebookOrderStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("total_amount, status")
      .eq("source", "facebook");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ total_amount: number | string; status: string }>;
    const total = rows.reduce((s, r) => s + Number(r.total_amount), 0);
    const pending = rows.filter((r) => r.status === "processing").length;
    return { count: rows.length, total, pending };
  });

export const listFacebookWebhookLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        q: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        limit: z.number().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("facebook_webhook_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    if (data.q) q = q.or(`event_type.ilike.%${data.q}%,page_name.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });
