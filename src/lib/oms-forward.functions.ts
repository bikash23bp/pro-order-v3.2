import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ForwardResult = {
  destination_id: string;
  destination_name: string;
  ok: boolean;
  http_status: number | null;
  remote_order_no: string | null;
  error: string | null;
};

export const forwardOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      orderId: z.string().uuid(),
      destinationIds: z.array(z.string().uuid()).min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const userSupabase = context.supabase as any;
    const { data: canForward } = await userSupabase
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_forward_orders" });
    if (!canForward) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildOrderPayload, sendToDestination } = await import("./oms-forward.server");
    const supabase = supabaseAdmin as any;
    const { data: dests, error: dErr } = await supabase
      .from("oms_destinations")
      .select("id, name, url, api_token, active")
      .in("id", data.destinationIds);
    if (dErr) throw new Error(dErr.message);
    const list = (dests ?? []).filter((d: any) => d.active);
    if (list.length === 0) throw new Error("No active destinations selected");

    const payload = await buildOrderPayload(supabase, data.orderId);
    const results: ForwardResult[] = [];
    for (const dest of list) {
      results.push(await sendToDestination(supabase, context.userId ?? null, data.orderId, dest, payload));
    }
    return { results };
  });

export const autoForwardNewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const userSupabase = context.supabase as any;
    const { data: canForward } = await userSupabase
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_forward_orders" });
    if (!canForward) return { skipped: true, reason: "No permission to auto-forward" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildOrderPayload, sendToDestination } = await import("./oms-forward.server");
    const supabase = supabaseAdmin as any;

    // Loop-prevention: don't auto-forward orders that came from another OMS.
    const { data: order } = await supabase
      .from("orders")
      .select("source, oms_sender_name")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { skipped: true, reason: "Order not found" };
    if (order.source === "oms" || order.oms_sender_name) {
      return { skipped: true, reason: "Inbound OMS order — not auto-forwarded" };
    }

    const { data: dests } = await supabase
      .from("oms_destinations")
      .select("id, name, url, api_token, active")
      .eq("auto_forward", true)
      .eq("active", true);
    const list = (dests ?? []) as Array<{ id: string; name: string; url: string; api_token: string }>;
    if (list.length === 0) return { skipped: true, reason: "No auto-forward destinations" };

    const payload = await buildOrderPayload(supabase, data.orderId);
    const results: ForwardResult[] = [];
    for (const dest of list) {
      results.push(await sendToDestination(supabase, context.userId ?? null, data.orderId, dest, payload));
    }
    return { skipped: false, results };
  });

export const testOmsDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ url: z.string().url(), api_token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await (context.supabase as any)
      .rpc("user_has_permission", { _user_id: context.userId, _perm: "can_manage_oms_endpoints" });
    if (!canManage) throw new Error("Forbidden");

    // SSRF guard: only allow https public hosts. Block localhost, private,
    // and cloud-metadata ranges so an attacker can't probe internal services.
    try {
      const parsed = new URL(data.url);
      if (parsed.protocol !== "https:") {
        return { ok: false, status: 0, body: "Only https:// URLs are allowed" };
      }
      const host = parsed.hostname.toLowerCase();
      const blocked =
        host === "localhost" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host === "metadata.google.internal" ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^fe80:/i.test(host) ||
        /^fc00:/i.test(host);
      if (blocked) {
        return { ok: false, status: 0, body: "Private/loopback hosts are not allowed" };
      }
    } catch {
      return { ok: false, status: 0, body: "Invalid URL" };
    }
    try {
      const res = await fetch(data.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OMS-Token": data.api_token },
        body: JSON.stringify({ __ping: true }),
        signal: AbortSignal.timeout(10000),
      });
      const text = (await res.text()).slice(0, 300);
      return { ok: res.status < 500, status: res.status, body: text };
    } catch (err) {
      return { ok: false, status: 0, body: err instanceof Error ? err.message : "Network error" };
    }
  });
