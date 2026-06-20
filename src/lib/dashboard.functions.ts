import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StatusKey =
  | "all"
  | "pending_web"
  | "processing"
  | "ready_to_ship"
  | "shipped"
  | "completed"
  | "cancelled"
  | "no_response"
  | "fraud"
  | "preorder";

export type StatBucket = { count: number; qty: number; value: number };

export type DashboardStats = {
  byStatus: Record<StatusKey, StatBucket>;
  trend: Array<{ date: string; total: number }>;
  todayRevenue: number;
};

export const getDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("orders")
      .select(
        "id, status, total_amount, created_at, preorder, order_items(quantity)",
      )
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (error) throw new Error(error.message);

    const empty: StatBucket = { count: 0, qty: 0, value: 0 };
    const byStatus: Record<StatusKey, StatBucket> = {
      all: { ...empty },
      pending_web: { ...empty },
      processing: { ...empty },
      ready_to_ship: { ...empty },
      shipped: { ...empty },
      completed: { ...empty },
      cancelled: { ...empty },
      no_response: { ...empty },
      fraud: { ...empty },
      preorder: { ...empty },
    };

    type Row = {
      status: string;
      total_amount: number | string;
      created_at: string;
      preorder: boolean | null;
      order_items: Array<{ quantity: number }> | null;
    };

    const trend: Record<string, number> = {};
    const fromDate = new Date(data.from);
    const toDate = new Date(data.to);
    const dayMs = 86400000;
    const dayCount = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / dayMs));
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < Math.min(31, dayCount); i++) {
      const d = new Date(start.getTime() + i * dayMs);
      trend[d.toISOString().slice(0, 10)] = 0;
    }

    let todayRevenue = 0;
    const todayKey = new Date().toISOString().slice(0, 10);

    for (const r of (rows ?? []) as Row[]) {
      const amt = Number(r.total_amount);
      const qty = (r.order_items ?? []).reduce((s, x) => s + Number(x.quantity || 0), 0);
      const dateKey = new Date(r.created_at).toISOString().slice(0, 10);

      if (r.status !== "pending_web") {
        byStatus.all.count += 1;
        byStatus.all.qty += qty;
        byStatus.all.value += amt;
      }

      const k = r.status as StatusKey;
      if (k in byStatus && k !== "all" && k !== "preorder") {
        byStatus[k].count += 1;
        byStatus[k].qty += qty;
        byStatus[k].value += amt;
      }

      if (r.preorder) {
        byStatus.preorder.count += 1;
        byStatus.preorder.qty += qty;
        byStatus.preorder.value += amt;
      }

      if (r.status === "completed") {
        if (dateKey in trend) trend[dateKey] += amt;
        if (dateKey === todayKey) todayRevenue += amt;
      }
    }

    return {
      byStatus,
      trend: Object.entries(trend).map(([date, total]) => ({ date, total: Math.round(total) })),
      todayRevenue,
    } satisfies DashboardStats;
  });

export type OrderUpdateBucket = { count: number; qty: number; value: number };
export type CourierBreakdown = OrderUpdateBucket & { courier_id: string | null; courier_name: string };
export type OrderUpdateSummary = {
  created: OrderUpdateBucket;
  sentToCourier: OrderUpdateBucket;
  byCourier: CourierBreakdown[];
};

export const getOrderUpdateSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [ordersRes, couriersRes] = await Promise.all([
      supabase
        .from("orders")
        .select("status, total_amount, courier_id, order_items(quantity)")
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      supabase.from("couriers").select("id, name"),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    if (couriersRes.error) throw new Error(couriersRes.error.message);

    const courierName = new Map<string, string>();
    for (const c of couriersRes.data ?? []) courierName.set(c.id as string, c.name as string);

    const created: OrderUpdateBucket = { count: 0, qty: 0, value: 0 };
    const sentToCourier: OrderUpdateBucket = { count: 0, qty: 0, value: 0 };
    const courierMap = new Map<string, CourierBreakdown>();

    type Row = {
      status: string;
      total_amount: number | string;
      courier_id: string | null;
      order_items: Array<{ quantity: number }> | null;
    };

    for (const r of (ordersRes.data ?? []) as Row[]) {
      if (r.status === "pending_web") continue;
      const amt = Number(r.total_amount) || 0;
      const qty = (r.order_items ?? []).reduce((s, x) => s + Number(x.quantity || 0), 0);
      created.count += 1;
      created.qty += qty;
      created.value += amt;
      if (r.status === "shipped" || r.status === "completed") {
        sentToCourier.count += 1;
        sentToCourier.qty += qty;
        sentToCourier.value += amt;
        const key = r.courier_id ?? "__none__";
        const existing = courierMap.get(key) ?? {
          courier_id: r.courier_id,
          courier_name: r.courier_id ? (courierName.get(r.courier_id) ?? "Unknown") : "No Courier",
          count: 0, qty: 0, value: 0,
        };
        existing.count += 1;
        existing.qty += qty;
        existing.value += amt;
        courierMap.set(key, existing);
      }
    }

    const byCourier = Array.from(courierMap.values()).sort((a, b) => b.count - a.count);
    return { created, sentToCourier, byCourier } satisfies OrderUpdateSummary;
  });

export type CustomerPeriodStats = {
  sales: number;
  orders: number;
  quantity: number;
  customers: number;
  returns: number;
};

export const getCustomerPeriodStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("orders")
      .select("status, total_amount, customer_phone, order_items(quantity)")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (error) throw new Error(error.message);

    type Row = {
      status: string;
      total_amount: number | string;
      customer_phone: string | null;
      order_items: Array<{ quantity: number }> | null;
    };

    let sales = 0;
    let orders = 0;
    let quantity = 0;
    let returns = 0;
    const phones = new Set<string>();

    for (const r of (rows ?? []) as Row[]) {
      if (r.status === "pending_web") continue;
      const amt = Number(r.total_amount) || 0;
      const qty = (r.order_items ?? []).reduce((s, x) => s + Number(x.quantity || 0), 0);
      orders += 1;
      quantity += qty;
      if (r.status === "completed") sales += amt;
      if (r.status === "returned") returns += 1;
      if (r.customer_phone) phones.add(r.customer_phone);
    }

    return {
      sales: Math.round(sales),
      orders,
      quantity,
      customers: phones.size,
      returns,
    } satisfies CustomerPeriodStats;
  });
