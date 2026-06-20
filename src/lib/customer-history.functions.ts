import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-11);
}

export const getCustomerHistoryByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().min(3).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const norm = normalizePhone(data.phone);
    if (!norm) {
      return {
        totalOrders: 0, successful: 0, cancelled: 0, running: 0,
        lastOrderDate: null as string | null, recentOrders: [] as Array<{
          id: string; order_number: number; status: string; total_amount: number; created_at: string;
        }>,
      };
    }
    const { data: rows, error } = await supabase
      .from("orders")
      .select("id, order_number, status, total_amount, created_at")
      .eq("phone_normalized", norm)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    let successful = 0, cancelled = 0, running = 0;
    for (const r of list) {
      if (r.status === "completed") successful++;
      else if (r.status === "cancelled" || r.status === "returned") cancelled++;
      else running++;
    }
    return {
      totalOrders: list.length,
      successful,
      cancelled,
      running,
      lastOrderDate: list[0]?.created_at ?? null,
      recentOrders: list.slice(0, 5).map((r) => ({
        id: r.id,
        order_number: r.order_number,
        status: r.status as string,
        total_amount: Number(r.total_amount),
        created_at: r.created_at,
      })),
    };
  });

/**
 * Returns a map of phone_normalized -> count of past `returned` orders
 * for the supplied phone numbers. Used by the Orders page to mark
 * "return customers" with a red badge (they can still place orders).
 */
export const getReturnedPhones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phones: z.array(z.string().max(30)).max(500) }).parse(input ?? { phones: [] }),
  )
  .handler(async ({ data, context }) => {
    const norms = Array.from(
      new Set(
        (data.phones ?? [])
          .map((p) => normalizePhone(p))
          .filter((v): v is string => !!v),
      ),
    );
    if (!norms.length) return {} as Record<string, number>;
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("phone_normalized, customer_phone")
      .eq("status", "returned" as never)
      .in("phone_normalized", norms);
    if (error) throw new Error(error.message);
    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      const row = r as { phone_normalized: string | null; customer_phone: string | null };
      const k = row.phone_normalized || normalizePhone(row.customer_phone ?? "");
      if (k) map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  });
