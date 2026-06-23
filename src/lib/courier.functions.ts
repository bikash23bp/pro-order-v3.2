import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Lazy admin client — avoids top-level client.server import (keeps service-role key out of client bundle)
const getAdmin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;


const Input = z.object({ orderId: z.string().uuid() });

type SteadfastResp = {
  status?: number;
  message?: string;
  consignment?: {
    consignment_id?: number | string;
    invoice?: string;
    tracking_code?: string;
    status?: string;
  };
};

export const pushToSteadfast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) return { ok: false, error: orderErr.message };
    if (!order) return { ok: false, error: "Order not found" };
    if (order.consignment_id) {
      return { ok: false, error: "Order already pushed to courier" };
    }

    type CourierRow = { id: string; name: string; base_url: string | null; api_key: string | null; secret_key: string | null };
    let courierId: string | null = order.courier_id;
    let courier: CourierRow | null = null;

    if (courierId) {
      const { data: c } = await (await getAdmin()).from("couriers").select("id, name, base_url, api_key, secret_key").eq("id", courierId).maybeSingle();
      courier = (c as CourierRow | null) ?? null;
    }
    if (!courier) {
      // Prefer is_default Steadfast/Packzy, then fall back to any active one.
      const { data: rows } = await (await getAdmin())
        .from("couriers")
        .select("id, name, base_url, api_key, secret_key, is_default")
        .eq("status", "active")
        .or("name.ilike.%steadfast%,name.ilike.%packzy%,provider.eq.steadfast")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      const list = (rows ?? []) as (CourierRow & { is_default: boolean | null })[];
      courier = list[0] ?? null;
      courierId = courier?.id ?? null;
    }

    if (!courier || !courier.api_key || !courier.secret_key) {
      return { ok: false, error: "No active Steadfast courier with credentials configured" };
    }

    const baseUrl = (courier.base_url || "https://portal.packzy.com/api/v1").replace(/\/$/, "");

    const invoiceLabel = (order.invoice_number && String(order.invoice_number).trim())
      ? String(order.invoice_number).trim()
      : `OMS-${order.order_number}`;
    const payload = {
      invoice: invoiceLabel,
      recipient_name: order.customer_name,
      recipient_phone: order.customer_phone,
      recipient_address: order.customer_address,
      cod_amount: Math.max(0, Number(order.total_amount) - Number(order.advance_amount)),
      note: order.invoice_note || "",
    };

    let upstream: Response;
    try {
      upstream = await fetch(`${baseUrl}/create_order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": courier.api_key,
          "Secret-Key": courier.secret_key,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false, error: `Network error reaching courier: ${(e as Error).message}` };
    }

    const text = await upstream.text();
    let json: SteadfastResp = {};
    try { json = JSON.parse(text) as SteadfastResp; } catch { /* keep raw */ }

    if (!upstream.ok || (json.status && json.status >= 400)) {
      return { ok: false, error: json.message || `Steadfast error (${upstream.status}): ${text.slice(0, 240)}` };
    }

    const consignmentId = json.consignment?.consignment_id != null ? String(json.consignment.consignment_id) : null;
    const trackingCode = json.consignment?.tracking_code ?? null;
    const trackingUrl = trackingCode ? `https://steadfast.com.bd/t/${trackingCode}` : null;

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        courier_id: courierId,
        consignment_id: consignmentId,
        tracking_url: trackingUrl,
        status: "ready_to_ship",
      })
      .eq("id", order.id);

    if (updErr) return { ok: false, error: updErr.message };

    return {
      ok: true,
      consignmentId,
      trackingUrl,
      message: json.message ?? "Order pushed to Steadfast",
    };
  });
