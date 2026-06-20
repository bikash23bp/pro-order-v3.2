import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MinBucket = { count: number; qty: number; value: number };

export type DashboardMinimal = {
  byStatus: Record<string, MinBucket>;
  all: MinBucket;
  preorder: MinBucket;
  todaySent: MinBucket;
  thisMonth: {
    orders: number;
    quantity: number;
    sales: number;
    returns: number;
    customers: number;
  };
};

const dateRange = z.object({ from: z.string(), to: z.string() });

export const getDashboardMinimal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      main: dateRange,
      today: dateRange,
      thisMonth: dateRange,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await (supabase as any).rpc("get_dashboard_minimal", {
      p_main_from: data.main.from,
      p_main_to: data.main.to,
      p_today_from: data.today.from,
      p_today_to: data.today.to,
      p_this_month_from: data.thisMonth.from,
      p_this_month_to: data.thisMonth.to,
    });
    if (error) throw new Error(error.message);
    return result as DashboardMinimal;
  });
