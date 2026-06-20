import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebOrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  product_name: string | null;
};

export type WebOrder = {
  id: string;
  order_number: number;
  external_order_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  subtotal: number;
  total_amount: number;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  advance_source_id: string | null;
  advance_txn_id: string | null;
  invoice_note: string | null;
  internal_note: string | null;
  consignment_id: string | null;
  status: string;
  created_at: string;
  items: WebOrderItem[];
};

export const listWebOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, external_order_id, customer_name, customer_phone, customer_email, customer_address, subtotal, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, invoice_note, internal_note, consignment_id, status, created_at, order_items(id, quantity, unit_price, products(name))",
      )
      .eq("source", "woocommerce")
      .eq("status", "processing" as never)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((o) => ({
      ...o,
      subtotal: Number(o.subtotal),
      total_amount: Number(o.total_amount),
      delivery_charge: Number(o.delivery_charge),
      discount_amount: Number(o.discount_amount),
      advance_amount: Number(o.advance_amount),
      items: (o.order_items ?? []).map((it: any) => ({
        id: it.id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        product_name: it.products?.name ?? null,
      })),
    })) as WebOrder[];
  });

export const confirmWebOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("orders")
      .update({ status: "processing" as never })
      .in("id", data.ids)
      .eq("status", "pending_web" as never)
      .select("id");
    if (error) throw new Error(error.message);
    return { count: rows?.length ?? 0 };
  });

export const getWebOrderStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select("total_amount")
      .eq("source", "woocommerce")
      .eq("status", "processing" as never);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ total_amount: number | string }>;
    const total = rows.reduce((s, r) => s + Number(r.total_amount), 0);
    return { count: rows.length, total };
  });
