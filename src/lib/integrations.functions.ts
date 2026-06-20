import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationRow = {
  id: string;
  provider: string;
  name: string | null;
  site_url: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  webhook_secret: string;
  plugin_signature: string | null;
  enabled: boolean;
  updated_at: string;
};

export const listWooIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("integrations")
      .select("id, provider, name, site_url, consumer_key, consumer_secret, webhook_secret, plugin_signature, enabled, updated_at")
      .eq("provider", "woocommerce")
      .order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as IntegrationRow[];
  });

// Lightweight version used by Orders/WebOrders for the Source Site column.
export const listIntegrationLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("integrations")
      .select("id, name, site_url");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string | null; site_url: string | null }[];
  });

const SaveSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  site_url: z.string().url().max(500),
  consumer_key: z.string().min(1).max(255),
  consumer_secret: z.string().min(1).max(255),
  plugin_signature: z.string().trim().max(255).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const saveWooIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const siteUrl = data.site_url.replace(/\/+$/, "");
    const payload: Record<string, unknown> = {
      provider: "woocommerce",
      name: data.name,
      site_url: siteUrl,
      consumer_key: data.consumer_key,
      consumer_secret: data.consumer_secret,
      enabled: data.enabled,
    };
    if (data.plugin_signature !== undefined) {
      payload.plugin_signature = data.plugin_signature && data.plugin_signature.length > 0 ? data.plugin_signature : null;
    }
    const q = data.id
      ? supabase.from("integrations").update(payload as never).eq("id", data.id).select("*").single()
      : supabase.from("integrations").insert(payload as never).select("*").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row as IntegrationRow;
  });

export const deleteWooIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("integrations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWooIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("integrations")
      .select("site_url, consumer_key, consumer_secret")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.site_url || !row.consumer_key || !row.consumer_secret) {
      throw new Error("WooCommerce credentials are not configured.");
    }
    const auth = Buffer.from(`${row.consumer_key}:${row.consumer_secret}`).toString("base64");
    const res = await fetch(`${row.site_url}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) throw new Error(`WooCommerce returned ${res.status} ${res.statusText}`);
    const body = (await res.json()) as { environment?: { version?: string; site_url?: string } };
    return {
      ok: true,
      version: body.environment?.version ?? null,
      site_url: body.environment?.site_url ?? row.site_url,
    };
  });

export const getWooLastSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select("created_at")
      .eq("source", "woocommerce")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { last_sync: data?.created_at ?? null };
  });

export const getWooWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("webhook_logs")
      .select("id, status, http_status, action, external_id, error, created_at")
      .eq("provider", "woocommerce")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { logs: data ?? [] };
  });
