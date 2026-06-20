import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REVENUE_STATUSES = ["processing", "ready_to_ship", "shipped", "completed"] as const;

export type PaidOrganicSplit = {
  paidRevenue: number;
  organicRevenue: number;
  paidOrders: number;
  organicOrders: number;
};

export const getPaidOrganicSplit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(),
      to: z.string(),
      sourceId: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PaidOrganicSplit> => {
    let q = context.supabase
      .from("orders")
      .select("total_amount, is_paid_marketing")
      .in("status", REVENUE_STATUSES as unknown as ("processing" | "ready_to_ship" | "shipped" | "completed")[])
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (data.sourceId) q = q.eq("order_source_id", data.sourceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let paidRevenue = 0, organicRevenue = 0, paidOrders = 0, organicOrders = 0;
    for (const r of rows ?? []) {
      const amt = Number((r as { total_amount: number }).total_amount || 0);
      const paid = (r as { is_paid_marketing: boolean }).is_paid_marketing !== false;
      if (paid) { paidRevenue += amt; paidOrders += 1; }
      else { organicRevenue += amt; organicOrders += 1; }
    }
    return { paidRevenue, organicRevenue, paidOrders, organicOrders };
  });
