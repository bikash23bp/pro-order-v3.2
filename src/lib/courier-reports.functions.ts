import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdapter } from "./couriers/registry";
import type { Credentials, Range } from "./couriers/types";

const RangeInput = z.object({
  courierId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const TrackInput = z.object({
  courierId: z.string().uuid(),
  consignmentId: z.string().min(1).max(128),
});

async function loadCourier(_supabase: any, id: string) {
  const { data, error } = await supabaseAdmin
    .from("couriers")
    .select("id, name, base_url, api_key, secret_key, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; name: string; base_url: string | null; api_key: string | null; secret_key: string | null; status: string };
}

function creds(row: { base_url: string | null; api_key: string | null; secret_key: string | null }): Credentials {
  return { apiKey: row.api_key, secretKey: row.secret_key, baseUrl: row.base_url };
}

function parseRange(input: { from?: string; to?: string }): Range {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

async function countOrdersByStatus(supabase: any, courierId: string, r: Range) {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("courier_id", courierId)
    .gte("created_at", r.from.toISOString())
    .lte("created_at", r.to.toISOString());
  if (error || !Array.isArray(data)) {
    return { total: 0, delivered: 0, cancelled: 0, in_transit: 0, hold: 0, partial: 0, returned: 0 };
  }
  const counts = { total: data.length, delivered: 0, cancelled: 0, in_transit: 0, hold: 0, partial: 0, returned: 0 };
  for (const row of data) {
    const s = String((row as any).status ?? "").toLowerCase();
    if (s === "delivered") counts.delivered++;
    else if (s === "cancelled" || s === "canceled") counts.cancelled++;
    else if (s === "in_transit" || s === "shipped" || s === "picked") counts.in_transit++;
    else if (s === "hold" || s === "on_hold") counts.hold++;
    else if (s === "partial" || s === "partial_delivered") counts.partial++;
    else if (s === "returned" || s === "return") counts.returned++;
  }
  return counts;
}

export const getCourierOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadCourier(context.supabase, data.courierId);
    if (!row) return { courier: null, balance: { supported: false as const }, analytics: null };
    const adapter = resolveAdapter(row.name);
    const range = parseRange(data);
    const [balance, analytics] = await Promise.all([
      adapter.getBalance(creds(row)),
      countOrdersByStatus(context.supabase, row.id, range),
    ]);
    return {
      courier: { id: row.id, name: row.name, status: row.status, adapter: adapter.name },
      balance,
      analytics,
    };
  });

export const getCourierCod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadCourier(context.supabase, data.courierId);
    if (!row) return { supported: false as const };
    const adapter = resolveAdapter(row.name);
    return adapter.getCodReport(creds(row), parseRange(data));
  });

export const getCourierReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadCourier(context.supabase, data.courierId);
    if (!row) return { supported: false as const };
    const adapter = resolveAdapter(row.name);
    return adapter.getReturns(creds(row), parseRange(data));
  });

export const getCourierPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RangeInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadCourier(context.supabase, data.courierId);
    if (!row) return { supported: false as const };
    const adapter = resolveAdapter(row.name);
    return adapter.getPayments(creds(row), parseRange(data));
  });

export const trackByConsignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TrackInput.parse(i))
  .handler(async ({ data, context }) => {
    const row = await loadCourier(context.supabase, data.courierId);
    if (!row) return { supported: false as const };
    const adapter = resolveAdapter(row.name);
    return adapter.getTracking(creds(row), data.consignmentId);
  });

const SummaryInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const getCouriersSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SummaryInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: list, error } = await supabaseAdmin
      .from("couriers")
      .select("id, name, base_url, api_key, secret_key, status");
    if (error || !Array.isArray(list)) return { items: [] as any[] };
    const range = parseRange(data);
    const items = await Promise.all(
      list.map(async (row: any) => {
        const adapter = resolveAdapter(row.name);
        const [balance, analytics] = await Promise.all([
          adapter.getBalance(creds(row)).catch(() => ({ supported: false as const })),
          countOrdersByStatus(context.supabase, row.id, range),
        ]);
        const b: any = balance;
        return {
          courierId: row.id,
          balance: b?.supported ? { current: b.current ?? null, supported: true } : { current: null, supported: false },
          total: analytics.total,
          delivered: analytics.delivered,
          returned: analytics.returned,
        };
      })
    );
    return { items };
  });

