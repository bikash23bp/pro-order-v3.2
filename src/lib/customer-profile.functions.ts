import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-11);
}

export type CustomerProfile = {
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  totalOrders: number;
  successful: number;
  cancelled: number;
  running: number;
  returns: number;
  totalSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  orders: Array<{
    id: string;
    order_number: number;
    status: string;
    total_amount: number;
    created_at: string;
    items: Array<{ name: string; quantity: number; unit_price: number }>;
  }>;
};

export const getCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().min(3).max(40) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CustomerProfile | null> => {
    const { supabase } = context;
    const norm = normalizePhone(data.phone);
    if (!norm) return null;

    const { data: rows, error } = await supabase
      .from("orders")
      .select("id, order_number, status, total_amount, created_at, customer_name, customer_email, customer_address, customer_phone, order_items(quantity, unit_price, products(name))")
      .eq("phone_normalized", norm)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    let successful = 0, cancelled = 0, running = 0, returns = 0, spent = 0;
    for (const r of list) {
      if (r.status === "completed") { successful++; spent += Number(r.total_amount); }
      else if (r.status === "returned") returns++;
      else if (r.status === "cancelled") cancelled++;
      else running++;
    }
    const latest = list[0];
    const earliest = list[list.length - 1];

    return {
      phone: latest?.customer_phone ?? data.phone,
      name: latest?.customer_name ?? null,
      email: latest?.customer_email ?? null,
      address: latest?.customer_address ?? null,
      totalOrders: list.length,
      successful, cancelled, running, returns,
      totalSpent: spent,
      firstOrderAt: earliest?.created_at ?? null,
      lastOrderAt: latest?.created_at ?? null,
      orders: list.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        status: String(r.status),
        total_amount: Number(r.total_amount),
        created_at: r.created_at,
        items: (r.order_items ?? []).map((i: any) => ({
          name: i.products?.name ?? "—",
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
        })),
      })),
    };
  });

export const updateCustomerByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: z.string().min(3).max(40),
      name: z.string().trim().min(1).max(255),
      email: z.string().trim().max(255).optional().nullable(),
      address: z.string().trim().min(1).max(1000),
      newPhone: z.string().trim().min(3).max(40).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const norm = normalizePhone(data.phone);
    if (!norm) throw new Error("Invalid phone");

    const patch: {
      customer_name: string;
      customer_address: string;
      customer_email: string | null;
      customer_phone?: string;
    } = {
      customer_name: data.name.trim(),
      customer_address: data.address.trim(),
      customer_email: data.email?.trim() || null,
    };
    if (data.newPhone) patch.customer_phone = data.newPhone.trim();

    const { error, count } = await supabase
      .from("orders")
      .update(patch, { count: "exact" })
      .eq("phone_normalized", norm);
    if (error) throw new Error(error.message);

    // best-effort update on imported_customers
    await supabase
      .from("imported_customers")
      .update({
        name: data.name.trim(),
        address: data.address.trim(),
      })
      .eq("phone", data.phone);

    return { updated: count ?? 0 };
  });
