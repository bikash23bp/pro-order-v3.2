import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PhoneSchema = z.string().trim().min(3).max(32);
const MessageSchema = z.string().trim().min(1).max(1000);

type SmsSettings = {
  api_url: string | null;
  api_key: string | null;
  sender_id: string | null;
  enabled: boolean;
  template_confirmed: string;
  template_shipped: string;
  template_web_order: string;
  template_single_default: string;
  template_bulk_default: string;
  enabled_confirmed: boolean;
  enabled_shipped: boolean;
  enabled_web_order: boolean;
};


function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

async function dispatch(settings: SmsSettings, phone: string, message: string) {
  if (!settings.enabled) throw new Error("SMS gateway is disabled");
  if (!settings.api_url) throw new Error("SMS gateway URL is not configured");
  const url = settings.api_url;
  const payload: Record<string, string> = {
    api_key: settings.api_key ?? "",
    senderid: settings.sender_id ?? "",
    sender_id: settings.sender_id ?? "",
    number: phone,
    msisdn: phone,
    to: phone,
    message,
    msg: message,
    text: message,
  };
  const body = new URLSearchParams(payload).toString();
  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 15000;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      // 4xx is a permanent client/auth error — do not retry.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
      }
      // 5xx — retry up to MAX_ATTEMPTS.
      if (!res.ok) {
        lastErr = new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw lastErr;
      }
      return parsed;
    } catch (e) {
      clearTimeout(timer);
      const err = e instanceof Error ? e : new Error(String(e));
      // Permanent error from above (4xx): rethrow immediately.
      if (err.message.startsWith("Gateway 4")) throw err;
      lastErr = err.name === "AbortError"
        ? new Error(`Network timeout after ${TIMEOUT_MS}ms`)
        : new Error(`Network error: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error("SMS dispatch failed");
}

export const getSmsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("sms_settings")
      .select("api_url, api_key, sender_id, enabled, template_confirmed, template_shipped, template_web_order, template_single_default, template_bulk_default, enabled_confirmed, enabled_shipped, enabled_web_order, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      api_url: z.string().url().max(500).or(z.literal("")).optional(),
      api_key: z.string().max(500).optional(),
      sender_id: z.string().max(100).optional(),
      enabled: z.boolean(),
      template_confirmed: z.string().min(1).max(1000),
      template_shipped: z.string().min(1).max(1000),
      template_web_order: z.string().min(1).max(1000),
      template_single_default: z.string().min(1).max(1000),
      template_bulk_default: z.string().min(1).max(1000),
      enabled_confirmed: z.boolean(),
      enabled_shipped: z.boolean(),
      enabled_web_order: z.boolean(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("sms_settings").update({
      api_url: data.api_url || null,
      api_key: data.api_key || null,
      sender_id: data.sender_id || null,
      enabled: data.enabled,
      template_confirmed: data.template_confirmed,
      template_shipped: data.template_shipped,
      template_web_order: data.template_web_order,
      template_single_default: data.template_single_default,
      template_bulk_default: data.template_bulk_default,
      enabled_confirmed: data.enabled_confirmed,
      enabled_shipped: data.enabled_shipped,
      enabled_web_order: data.enabled_web_order,
      updated_at: new Date().toISOString(),
    } as never).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


async function logSms(supabase: any, row: {
  phone: string; message: string; status: string;
  provider_response?: unknown; error?: string | null;
  order_id?: string | null; sent_by?: string | null; trigger?: string;
}) {
  await supabase.from("sms_logs").insert({
    phone: row.phone,
    message: row.message,
    status: row.status,
    provider_response: row.provider_response ? (row.provider_response as object) : null,
    error: row.error ?? null,
    order_id: row.order_id ?? null,
    sent_by: row.sent_by ?? null,
    trigger: row.trigger ?? "manual",
  });
}

async function loadSettings(supabase: any): Promise<SmsSettings> {
  const { data, error } = await supabase.from("sms_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("SMS settings not found");
  return data as SmsSettings;
}

export const sendCustomSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: PhoneSchema,
      message: MessageSchema,
      order_id: z.string().uuid().nullable().optional(),
      trigger: z.string().max(40).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase);
    try {
      const provider = await dispatch(settings, data.phone, data.message);
      await logSms(supabase, {
        phone: data.phone, message: data.message, status: "sent",
        provider_response: provider, order_id: data.order_id ?? null,
        sent_by: userId, trigger: data.trigger ?? "manual",
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await logSms(supabase, {
        phone: data.phone, message: data.message, status: "failed",
        error: msg, order_id: data.order_id ?? null, sent_by: userId,
        trigger: data.trigger ?? "manual",
      });
      throw new Error(msg);
    }
  });

export const sendBulkOrderSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      order_ids: z.array(z.string().uuid()).min(1).max(500),
      message: MessageSchema,
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase);
    const { data: orders, error } = await supabase
      .from("orders").select("id, order_number, customer_name, customer_phone")
      .in("id", data.order_ids);
    if (error) throw new Error(error.message);

    let sent = 0, failed = 0;
    for (const o of (orders ?? []) as any[]) {
      const phone = (o.customer_phone ?? "").trim();
      if (!phone) { failed++; continue; }
      const message = renderTemplate(data.message, {
        name: o.customer_name, order_id: o.order_number,
      });
      try {
        const provider = await dispatch(settings, phone, message);
        await logSms(supabase, {
          phone, message, status: "sent", provider_response: provider,
          order_id: o.id, sent_by: userId, trigger: "bulk",
        });
        sent++;
      } catch (e) {
        await logSms(supabase, {
          phone, message, status: "failed",
          error: e instanceof Error ? e.message : String(e),
          order_id: o.id, sent_by: userId, trigger: "bulk",
        });
        failed++;
      }
    }
    return { sent, failed, total: (orders ?? []).length };
  });

export const sendBulkCustomerSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      contacts: z.array(z.object({
        phone: PhoneSchema,
        name: z.string().max(255).optional().nullable(),
      })).min(1).max(2000),
      message: MessageSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase);
    let sent = 0, failed = 0;
    const seen = new Set<string>();
    for (const c of data.contacts) {
      const phone = c.phone.trim();
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const message = renderTemplate(data.message, { name: c.name ?? "" });
      try {
        const provider = await dispatch(settings, phone, message);
        await logSms(supabase, {
          phone, message, status: "sent", provider_response: provider,
          sent_by: userId, trigger: "bulk_marketing",
        });
        sent++;
      } catch (e) {
        await logSms(supabase, {
          phone, message, status: "failed",
          error: e instanceof Error ? e.message : String(e),
          sent_by: userId, trigger: "bulk_marketing",
        });
        failed++;
      }
    }
    return { sent, failed, total: seen.size };
  });

export const sendOrderStatusSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      order_id: z.string().uuid(),
      kind: z.enum(["confirmed", "shipped", "web_order"]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase);
    if (!settings.enabled) return { ok: false, skipped: true };

    const enabledFor =
      data.kind === "confirmed" ? settings.enabled_confirmed
      : data.kind === "shipped" ? settings.enabled_shipped
      : settings.enabled_web_order;
    if (!enabledFor) return { ok: false, skipped: true };

    const { data: o, error } = await supabase
      .from("orders").select("id, order_number, customer_name, customer_phone")
      .eq("id", data.order_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o) throw new Error("Order not found");
    const phone = ((o as any).customer_phone ?? "").trim();
    if (!phone) return { ok: false, skipped: true };

    const tpl =
      data.kind === "confirmed" ? settings.template_confirmed
      : data.kind === "shipped" ? settings.template_shipped
      : settings.template_web_order;

    const message = renderTemplate(tpl, {
      name: (o as any).customer_name, order_id: (o as any).order_number,
    });
    try {
      const provider = await dispatch(settings, phone, message);
      await logSms(supabase, {
        phone, message, status: "sent", provider_response: provider,
        order_id: (o as any).id, sent_by: userId, trigger: `auto_${data.kind}`,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await logSms(supabase, {
        phone, message, status: "failed", error: msg,
        order_id: (o as any).id, sent_by: userId, trigger: `auto_${data.kind}`,
      });
      return { ok: false, error: msg };
    }
  });

export const listSmsLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("sms_logs")
      .select("id, order_id, phone, message, status, error, trigger, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
