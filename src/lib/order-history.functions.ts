import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderHistoryEntry = {
  id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
};

export const getOrderHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OrderHistoryEntry[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("order_history")
      .select("id, event_type, from_value, to_value, created_at, changed_by")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.changed_by).filter(Boolean))) as string[];
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: names } = await supabase.rpc("get_user_display_names", { p_ids: ids });
      nameMap = new Map((names ?? []).map((n: { id: string; display_name: string }) => [n.id, n.display_name]));
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      from_value: r.from_value,
      to_value: r.to_value,
      created_at: r.created_at,
      changed_by: r.changed_by,
      changed_by_name: r.changed_by ? nameMap.get(r.changed_by) ?? null : null,
    }));
  });

const STATUS = z.enum([
  "pending_web", "processing", "ready_to_ship", "out_of_stock", "shipped",
  "completed", "cancelled", "cancel_request", "returned", "no_response", "fraud", "hold",
]);

export const updateOrderStatusOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), status: STATUS }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("orders")
      .update({ status: data.status, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
