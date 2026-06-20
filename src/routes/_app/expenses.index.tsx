import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfitLoss } from "@/lib/meta-ads.functions";
import {
  DateRangeFilter,
  endOfDay,
  startOfDay,
  type DateRange,
  type PresetKey,
} from "@/components/dashboard/DateRangeFilter";

const ExpenseOverviewCharts = lazy(() => import("@/components/charts/ExpenseOverviewCharts"));

export const Route = createFileRoute("/_app/expenses/")({
  component: OverviewPage,
});

const fmt = (n: number) => `৳ ${Math.round(n).toLocaleString()}`;

function defaultRange(): DateRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 29); // last 30 days incl. today
  return { from: startOfDay(from), to: endOfDay(now) };
}

function OverviewPage() {
  const fetchPnL = useServerFn(getProfitLoss);
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [preset, setPreset] = useState<PresetKey>("custom");

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["expense-overview", fromIso, toIso],
    queryFn: () => fetchPnL({ data: { from: fromIso, to: toIso } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayRow = (data?.daily ?? []).find((d) => d.date === todayKey);
  const todaySpend = todayRow?.spend ?? 0;
  const todayRevenue = todayRow?.revenue ?? 0;

  const profitColor = (data?.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Expenses Overview</h1>
        <DateRangeFilter
          value={range}
          preset={preset}
          onChange={(r, p) => { setRange(r); setPreset(p); }}
        />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Today Ad Spend" value={fmt(todaySpend)} loading={isLoading} />
        <KpiCard title="Total Ad Spend" value={fmt(data?.spend ?? 0)} loading={isLoading} />
        <KpiCard title="Today Revenue" value={fmt(todayRevenue)} loading={isLoading} />
        <KpiCard title="Total Revenue" value={fmt(data?.revenue ?? 0)} loading={isLoading} />
        <KpiCard title="Net Profit" value={fmt(data?.netProfit ?? 0)} loading={isLoading} valueClass={profitColor} />
        <KpiCard title="ROI" value={`${(data?.roi ?? 0).toFixed(1)}%`} loading={isLoading} valueClass={profitColor} />
      </div>

      <Suspense fallback={<div className="h-72 rounded-md border bg-muted/20 animate-pulse" />}>
        <ExpenseOverviewCharts daily={data?.daily ?? []} />
      </Suspense>
    </div>
  );
}

function KpiCard({ title, value, loading, valueClass }: { title: string; value: string; loading?: boolean; valueClass?: string }) {
  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tracking-tight ${valueClass ?? ""}`}>
          {loading ? "…" : value}
        </div>
      </CardContent>
    </Card>
  );
}
