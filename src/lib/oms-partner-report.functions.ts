import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PartnerReportRow = {
  sender_name: string;
  total_count: number;
  total_amount: number;
  by_status: Record<string, { count: number; amount: number }>;
};

export const getOmsPartnerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("oms_sender_name, status, total_amount, created_at")
      .eq("source", "oms")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (error) throw new Error(error.message);

    const map = new Map<string, PartnerReportRow>();
    for (const r of (rows ?? []) as Array<{
      oms_sender_name: string | null;
      status: string | null;
      total_amount: number | string | null;
    }>) {
      const name = r.oms_sender_name || "Unknown";
      let row = map.get(name);
      if (!row) {
        row = { sender_name: name, total_count: 0, total_amount: 0, by_status: {} };
        map.set(name, row);
      }
      const amount = Number(r.total_amount ?? 0) || 0;
      row.total_count += 1;
      row.total_amount += amount;
      const s = String(r.status ?? "unknown");
      row.by_status[s] ??= { count: 0, amount: 0 };
      row.by_status[s].count += 1;
      row.by_status[s].amount += amount;
    }
    return Array.from(map.values()).sort((a, b) => b.total_count - a.total_count);
  });
