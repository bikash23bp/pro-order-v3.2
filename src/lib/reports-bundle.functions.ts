import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReportsBundle = {
  summary: {
    revenue: number;
    productCost: number;
    manualExpense: number;
    adCost: number;
    returnExpense: number;
    courierCharge: number;
    orderCount: number;
    orderValueTotal: number;
    revenueOrderCount: number;
    returnedCount: number;
  };
  statusBreakdown: Array<{ name: string; value: number }>;
  incomeVsExpense: Array<{ day: string; income: number; expense: number }>;
  staff: Array<{ user_id: string | null; name: string; orders: number; sales: number }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  returnedOrders: Array<{
    id: string;
    order_number: number;
    customer_name: string;
    customer_phone: string;
    total_amount: number | string;
    created_at: string;
  }>;
  userStats: Record<string, { count: number; total: number }>;
};

export const getReportsBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(),
      to: z.string(),
      fromDate: z.string(),
      toDate: z.string(),
      source: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await (supabase as any).rpc("get_reports_bundle", {
      p_from: data.from,
      p_to: data.to,
      p_from_date: data.fromDate,
      p_to_date: data.toDate,
      p_source: data.source ?? null,
    });
    if (error) throw new Error(error.message);
    return result as ReportsBundle;
  });
