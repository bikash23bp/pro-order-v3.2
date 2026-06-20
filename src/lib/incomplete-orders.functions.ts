import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IncompleteOrderItem = {
  quantity: number;
  unit_price: number;
  product_name: string | null;
  variant_name: string | null;
  image_url: string | null;
};

export type IncompleteOrder = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: string;
  total_amount: number;
  source: string;
  created_at: string;
  missing_fields: string[];
  items: IncompleteOrderItem[];
};

export const listIncompleteOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("incomplete_orders" as never)
      .select(
        "id, order_number, customer_name, customer_phone, customer_address, status, total_amount, source, created_at, missing_fields",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Omit<IncompleteOrder, "items"> & { total_amount: number | string }>;
    const ids = rows.map((r) => r.id);
    let itemsByOrder: Record<string, IncompleteOrderItem[]> = {};
    if (ids.length) {
      const { data: items, error: ierr } = await supabase
        .from("order_items")
        .select("order_id, quantity, unit_price, products(name, image_url), product_variants(image_url, attributes)")
        .in("order_id", ids);
      if (ierr) throw new Error(ierr.message);
      for (const it of (items ?? []) as any[]) {
        const arr = (itemsByOrder[it.order_id] ??= []);
        arr.push({
          quantity: Number(it.quantity ?? 0),
          unit_price: Number(it.unit_price ?? 0),
          product_name: it.products?.name ?? null,
          variant_name: it.product_variants?.attributes
            ? Object.values(it.product_variants.attributes as Record<string, string>).filter(Boolean).join(" / ") || null
            : null,
          image_url: it.product_variants?.image_url ?? it.products?.image_url ?? null,
        });
      }
    }
    return rows.map((o) => ({
      ...o,
      total_amount: Number(o.total_amount),
      missing_fields: o.missing_fields ?? [],
      items: itemsByOrder[o.id] ?? [],
    })) as IncompleteOrder[];
  });

export const getIncompleteStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("incomplete_orders" as never)
      .select("total_amount");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ total_amount: number | string }>;
    const total = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    return { count: rows.length, total };
  });
