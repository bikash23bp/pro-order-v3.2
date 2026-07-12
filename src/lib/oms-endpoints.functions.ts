import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OmsDestination = {
  id: string;
  name: string;
  url: string;
  products_url: string | null;
  api_token: string;
  auto_forward: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OmsInboundSetting = {
  id: string;
  sender_name: string;
  api_token: string;
  active: boolean;
  default_courier_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OmsForwardLog = {
  id: string;
  order_id: string | null;
  destination_id: string | null;
  destination_name: string | null;
  direction: string;
  status: string;
  http_status: number | null;
  remote_order_no: string | null;
  error_message: string | null;
  created_at: string;
};

// ===== Destinations =====

export const listOmsDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("oms_destinations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OmsDestination[];
  });

export const upsertOmsDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(120),
      url: z.string().url().max(500),
      products_url: z.string().url().max(500).nullable().optional(),
      api_token: z.string().min(8).max(500),
      auto_forward: z.boolean().default(false),
      active: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    if (data.id) {
      const { error } = await supabase
        .from("oms_destinations")
        .update({
          name: data.name,
          url: data.url,
          products_url: data.products_url ?? null,
          api_token: data.api_token,
          auto_forward: data.auto_forward,
          active: data.active,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("oms_destinations")
      .insert({
        name: data.name,
        url: data.url,
        products_url: data.products_url ?? null,
        api_token: data.api_token,
        auto_forward: data.auto_forward,
        active: data.active,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteOmsDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("oms_destinations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Inbound settings =====

export const listOmsInbound = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("oms_inbound_settings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OmsInboundSetting[];
  });

export const upsertOmsInbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      sender_name: z.string().min(1).max(120),
      api_token: z.string().min(8).max(500),
      active: z.boolean().default(true),
      default_courier_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    if (data.id) {
      const { error } = await supabase
        .from("oms_inbound_settings")
        .update({
          sender_name: data.sender_name,
          api_token: data.api_token,
          active: data.active,
          default_courier_id: data.default_courier_id ?? null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("oms_inbound_settings")
      .insert({
        sender_name: data.sender_name,
        api_token: data.api_token,
        active: data.active,
        default_courier_id: data.default_courier_id ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteOmsInbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("oms_inbound_settings")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Logs =====

export const listOmsForwardLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("oms_forward_logs")
      .select("id, order_id, destination_id, destination_name, direction, status, http_status, remote_order_no, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as OmsForwardLog[];
  });

// ===== Public endpoint URL helper (read on server) =====

export const getOmsInboundUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const base = (process.env.PUBLIC_APP_URL || process.env.SITE_URL || "").replace(/\/+$/, "");
    return {
      url: base ? `${base}/api/public/oms-inbound` : "/api/public/oms-inbound",
      products_url: base ? `${base}/api/public/oms-products` : "/api/public/oms-products",
    };
  });

// ===== Per-partner product allowlist =====

export type OmsAllowedProduct = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  image_url: string | null;
  status: string;
};

export const listAllowedProductsForSender = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sender_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const { data: rows, error } = await supabase
      .from("oms_inbound_product_access")
      .select("product_id, products:product_id (id, name, sku, price, image_url, status)")
      .eq("sender_id", data.sender_id);
    if (error) throw new Error(error.message);
    return ((rows ?? [])
      .map((r: any) => r.products)
      .filter(Boolean)) as OmsAllowedProduct[];
  });

export const setAllowedProductsForSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      sender_id: z.string().uuid(),
      product_ids: z.array(z.string().uuid()).max(5000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const { data: existing, error: eErr } = await supabase
      .from("oms_inbound_product_access")
      .select("product_id")
      .eq("sender_id", data.sender_id);
    if (eErr) throw new Error(eErr.message);
    const have = new Set<string>((existing ?? []).map((r: any) => r.product_id as string));
    const want = new Set<string>(data.product_ids);
    const toAdd = [...want].filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !want.has(id));

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("oms_inbound_product_access")
        .insert(toAdd.map((pid) => ({
          sender_id: data.sender_id,
          product_id: pid,
          created_by: context.userId,
        })));
      if (error) throw new Error(error.message);
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("oms_inbound_product_access")
        .delete()
        .eq("sender_id", data.sender_id)
        .in("product_id", toRemove);
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length, removed: toRemove.length };
  });

export const listAllProductsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");
    const { data, error } = await (context.supabase as any)
      .from("products")
      .select("id, name, sku, price, image_url, status")
      .order("name", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []) as OmsAllowedProduct[];
  });

