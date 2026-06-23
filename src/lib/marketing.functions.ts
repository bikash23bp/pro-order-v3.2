import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Lazy admin client — avoids top-level client.server import (keeps service-role key out of client bundle)
const getAdmin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;


const PhoneSchema = z.string().trim().min(3).max(32);
const MessageSchema = z.string().trim().min(1).max(4000);

type WhatsAppSettings = {
  enabled: boolean;
  api_url: string | null;
  api_token: string | null;
  phone_number_id: string | null;
  sender_name: string | null;
};

function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

async function dispatchWhatsApp(s: WhatsAppSettings, phone: string, message: string) {
  if (!s.enabled) throw new Error("WhatsApp is disabled");
  if (!s.api_url) throw new Error("WhatsApp API URL not configured");
  if (!s.api_token) throw new Error("WhatsApp API token not configured");
  // Generic Cloud-API-style POST. Works with Meta Cloud API and most providers.
  const url = s.phone_number_id
    ? s.api_url.replace(/\/+$/, "") + `/${s.phone_number_id}/messages`
    : s.api_url;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.api_token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      }),
    });
  } catch (e) {
    throw new Error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
  return parsed;
}

// ---------- Settings ----------

export const getWhatsappSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await (await getAdmin())
      .from("whatsapp_settings")
      .select("enabled, api_url, api_token, phone_number_id, sender_name, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveWhatsappSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      enabled: z.boolean(),
      api_url: z.string().url().max(500).or(z.literal("")).optional(),
      api_token: z.string().max(1000).optional(),
      phone_number_id: z.string().max(100).optional(),
      sender_name: z.string().max(100).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("whatsapp_settings").update({
      enabled: data.enabled,
      api_url: data.api_url || null,
      api_token: data.api_token || null,
      phone_number_id: data.phone_number_id || null,
      sender_name: data.sender_name || null,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Templates ----------

export type MessageTemplate = {
  id: string;
  channel: "whatsapp" | "sms";
  name: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ channel: z.enum(["whatsapp", "sms"]).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("message_templates").select("*").order("updated_at", { ascending: false });
    if (data.channel) q = q.eq("channel", data.channel);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageTemplate[];
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      channel: z.enum(["whatsapp", "sms"]),
      name: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(4000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase.from("message_templates")
        .update({ name: data.name, body: data.body, channel: data.channel })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: r, error } = await supabase.from("message_templates")
      .insert({ name: data.name, body: data.body, channel: data.channel, created_by: userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: r.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("message_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Recipients ----------

export type RecipientFilters = {
  q?: string;
  source?: string;
  product?: string;
  status?: string; // order_status enum value or "all"
  tag?: "all" | "member" | "discount" | "cancelled" | "fraud";
  datePreset?: "all" | "today" | "week" | "month" | "custom";
  customFrom?: string;
  customTo?: string;
};

export type Recipient = {
  phone: string;
  name: string | null;
  tags: string[];
  last_order_at: string | null;
  total_orders: number;
};

const recipientFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  source: z.string().max(200).optional(),
  product: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
  tag: z.enum(["all", "member", "discount", "cancelled", "fraud"]).optional(),
  datePreset: z.enum(["all", "today", "week", "month", "custom"]).optional(),
  customFrom: z.string().max(40).optional(),
  customTo: z.string().max(40).optional(),
});

function rangeFor(preset: string | undefined, from?: string, to?: string): [Date | null, Date | null] {
  const now = new Date();
  if (preset === "today") { const s = new Date(now); s.setHours(0,0,0,0); return [s, now]; }
  if (preset === "week") { const s = new Date(now); s.setDate(s.getDate() - 7); return [s, now]; }
  if (preset === "month") { const s = new Date(now); s.setMonth(s.getMonth() - 1); return [s, now]; }
  if (preset === "custom") return [from ? new Date(from) : null, to ? new Date(to) : null];
  return [null, null];
}

const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-11) || p.trim();

export const listMarketingRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recipientFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [ordersRes, membersRes] = await Promise.all([
      supabase
        .from("orders")
        .select("customer_phone, customer_name, phone_normalized, source, status, discount_amount, created_at, order_items(products(name))")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("membership_customers").select("phone, name").limit(2000),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (membersRes.error) throw new Error(membersRes.error.message);

    const memberPhones = new Set<string>();
    for (const m of (membersRes.data ?? []) as any[]) {
      const n = normalizePhone(m.phone);
      if (n) memberPhones.add(n);
    }

    type Agg = {
      phone: string; name: string | null;
      total_orders: number; cancelled_orders: number;
      last_order_at: string | null;
      sources: Set<string>; products: Set<string>; statuses: Set<string>;
      has_discount: boolean;
    };
    const byPhone = new Map<string, Agg>();
    for (const o of (ordersRes.data ?? []) as any[]) {
      const phoneRaw = (o.customer_phone ?? "").trim();
      const key = (o.phone_normalized || normalizePhone(phoneRaw)) as string;
      if (!key) continue;
      let a = byPhone.get(key);
      if (!a) {
        a = { phone: phoneRaw, name: o.customer_name ?? null, total_orders: 0, cancelled_orders: 0, last_order_at: null, sources: new Set(), products: new Set(), statuses: new Set(), has_discount: false };
        byPhone.set(key, a);
      }
      a.total_orders += 1;
      if (o.status === "cancelled") a.cancelled_orders += 1;
      if (o.status) a.statuses.add(o.status);
      if (!a.last_order_at || (o.created_at && o.created_at > a.last_order_at)) a.last_order_at = o.created_at;
      if (o.source) a.sources.add(o.source);
      if (Number(o.discount_amount ?? 0) > 0) a.has_discount = true;
      for (const it of (o.order_items ?? [])) {
        const n = it?.products?.name;
        if (n) a.products.add(n);
      }
    }

    // Add members with no orders so they're still reachable
    for (const m of (membersRes.data ?? []) as any[]) {
      const key = normalizePhone(m.phone);
      if (!key || byPhone.has(key)) continue;
      byPhone.set(key, {
        phone: m.phone, name: m.name ?? null, total_orders: 0, cancelled_orders: 0,
        last_order_at: null, sources: new Set(), products: new Set(), statuses: new Set(), has_discount: false,
      });
    }

    const [from, to] = rangeFor(data.datePreset, data.customFrom, data.customTo);
    const qLower = (data.q ?? "").toLowerCase().trim();
    const rows: Recipient[] = [];

    for (const [key, a] of byPhone) {
      if (qLower) {
        const hit = (a.name ?? "").toLowerCase().includes(qLower) || a.phone.includes(qLower);
        if (!hit) continue;
      }
      if (data.source && data.source !== "all" && !a.sources.has(data.source)) continue;
      if (data.product && data.product !== "all" && !a.products.has(data.product)) continue;
      if (data.status && data.status !== "all" && !a.statuses.has(data.status)) continue;
      const tag = data.tag ?? "all";
      if (tag === "member" && !memberPhones.has(key)) continue;
      if (tag === "discount" && !a.has_discount) continue;
      if (tag === "cancelled" && a.cancelled_orders === 0) continue;
      if (tag === "fraud" && a.cancelled_orders < 2) continue;
      if (from || to) {
        if (!a.last_order_at) continue;
        const d = new Date(a.last_order_at);
        if (from && d < from) continue;
        if (to && d > to) continue;
      }
      const tags: string[] = [];
      if (memberPhones.has(key)) tags.push("Member");
      if (a.has_discount) tags.push("Discount");
      if (a.cancelled_orders >= 2) tags.push("Fraud");
      else if (a.cancelled_orders > 0) tags.push("Cancelled");
      rows.push({
        phone: a.phone, name: a.name, tags,
        last_order_at: a.last_order_at, total_orders: a.total_orders,
      });
    }

    // Sort by most recent activity
    rows.sort((x, y) => (y.last_order_at ?? "").localeCompare(x.last_order_at ?? ""));
    return rows.slice(0, 2000);
  });

export const getRecipientFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Sources from the curated `order_sources` table (small) instead of a 5000-row order scan.
    const [src, prod] = await Promise.all([
      supabase.from("order_sources").select("name").eq("visible", true).order("name").limit(500),
      supabase.from("products").select("name").eq("status", "active").order("name").limit(500),
    ]);
    const sources = Array.from(new Set(((src.data ?? []) as Array<{ name: string }>).map((r) => r.name).filter(Boolean))).sort();
    const products = ((prod.data ?? []) as Array<{ name: string }>).map((p) => p.name).filter(Boolean);
    return { sources, products };
  });

// ---------- Bulk send ----------

async function loadWhatsappSettings(_supabase: any): Promise<WhatsAppSettings> {
  const { data, error } = await (await getAdmin()).from("whatsapp_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("WhatsApp settings not configured");
  return data as WhatsAppSettings;
}

export const sendBulkWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      message: MessageSchema,
      recipients: z.array(z.object({
        phone: PhoneSchema,
        name: z.string().max(255).nullable().optional(),
      })).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadWhatsappSettings(supabase);
    const batch_id = crypto.randomUUID();
    let sent = 0, failed = 0;
    const seen = new Set<string>();
    for (const r of data.recipients) {
      const phone = r.phone.trim();
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const message = renderTemplate(data.message, { name: r.name ?? "", phone });
      try {
        const provider = await dispatchWhatsApp(settings, phone, message);
        await supabase.from("whatsapp_logs").insert({
          phone, customer_name: r.name ?? null, message, status: "sent",
          provider_response: provider as any, batch_id, sent_by: userId,
        });
        sent++;
      } catch (e) {
        await supabase.from("whatsapp_logs").insert({
          phone, customer_name: r.name ?? null, message, status: "failed",
          error: e instanceof Error ? e.message : String(e), batch_id, sent_by: userId,
        });
        failed++;
      }
    }
    return { sent, failed, total: seen.size, batch_id };
  });

export const listWhatsappLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.from("whatsapp_logs")
      .select("id, phone, customer_name, message, status, error, batch_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
