import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebsiteSalesRow = {
  site_id: string | null;
  site_name: string;
  orders: number;
  revenue: number;
  delivered: number;
  cancelled: number;
  returned: number;
};

const REVENUE_STATUSES = new Set(["processing", "ready_to_ship", "shipped", "completed"]);

export const getWebsiteSalesBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(),
      to: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("orders")
      .select("source_site_id, source, status, total_amount")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (error) throw new Error(error.message);

    const siteIds = Array.from(new Set((rows ?? []).map((r: any) => r.source_site_id).filter(Boolean))) as string[];
    let siteMap: Record<string, string> = {};
    if (siteIds.length) {
      const { data: sites } = await supabase
        .from("integrations")
        .select("id, name, site_url")
        .in("id", siteIds);
      siteMap = Object.fromEntries((sites ?? []).map((s: any) => [
        s.id,
        (s.name as string) || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : "Unknown site"),
      ]));
    }

    const labelForNoSite = (src: string | null | undefined) => {
      const s = String(src ?? "").toLowerCase();
      if (s === "facebook") return "Facebook";
      if (s === "manual") return "Manual / Direct";
      if (!s) return "Direct";
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const bucket = new Map<string, WebsiteSalesRow>();
    for (const r of (rows ?? []) as any[]) {
      const id = (r.source_site_id as string | null) ?? `__src_${String(r.source ?? "")}`;
      const name = r.source_site_id
        ? (siteMap[r.source_site_id] ?? "Unknown site")
        : labelForNoSite(r.source);
      const cur = bucket.get(id) ?? {
        site_id: r.source_site_id ?? null,
        site_name: name,
        orders: 0,
        revenue: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
      };
      cur.orders += 1;
      const amt = Number(r.total_amount ?? 0) || 0;
      const st = String(r.status ?? "");
      if (REVENUE_STATUSES.has(st)) cur.revenue += amt;
      if (st === "completed") cur.delivered += 1;
      if (st === "cancelled") cur.cancelled += 1;
      if (st === "returned") cur.returned += 1;
      bucket.set(id, cur);
    }

    return Array.from(bucket.values()).sort((a, b) => b.revenue - a.revenue);
  });
