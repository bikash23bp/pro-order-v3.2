import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Bucket = { count: number; qty: number; value: number };
export type CourierBucket = Bucket & { courier_id: string | null; courier_name: string };

export type DashboardBundle = {
  stats: {
    byStatus: Record<string, Bucket>;
    all: Bucket;
    preorder: Bucket;
    trend: Array<{ date: string; total: number }>;
    todayRevenue: number;
  };
  summary: {
    created: Bucket;
    sentToCourier: Bucket;
    byCourier: CourierBucket[];
  };
  quick: Record<"today" | "yesterday" | "week", { sentToCourier: Bucket }>;
  customerPeriod: Record<"this" | "last", {
    sales: number; orders: number; quantity: number; customers: number; returns: number;
  }>;
  repeat: { total: number; repeat: number; percent: number };
  webOrders: { count: number; total: number };
  incomplete: { count: number; total: number };
  facebook: { count: number; total: number; pending: number };
  recent: Array<{
    id: string; order_number: string | null; customer_name: string;
    status: string; total_amount: number | string; created_at: string;
  }>;
  business: {
    business_name: string | null; business_address: string | null;
    business_phone: string | null; logo_url: string | null;
  } | null;
};

const dateRange = z.object({ from: z.string(), to: z.string() });

export const getDashboardBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      main: dateRange,
      summary: dateRange,
      today: dateRange,
      yesterday: dateRange,
      week: dateRange,
      thisMonth: dateRange,
      lastMonth: dateRange,
      repeat: z.object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await (supabase as any).rpc("get_dashboard_bundle", {
      p_main_from: data.main.from,
      p_main_to: data.main.to,
      p_summary_from: data.summary.from,
      p_summary_to: data.summary.to,
      p_today_from: data.today.from,
      p_today_to: data.today.to,
      p_yesterday_from: data.yesterday.from,
      p_yesterday_to: data.yesterday.to,
      p_week_from: data.week.from,
      p_week_to: data.week.to,
      p_this_month_from: data.thisMonth.from,
      p_this_month_to: data.thisMonth.to,
      p_last_month_from: data.lastMonth.from,
      p_last_month_to: data.lastMonth.to,
      p_repeat_from: data.repeat.from ?? null,
      p_repeat_to: data.repeat.to ?? null,
    });
    if (error) throw new Error(error.message);
    return result as DashboardBundle;
  });
