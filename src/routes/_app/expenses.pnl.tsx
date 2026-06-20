import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getProfitLoss } from "@/lib/meta-ads.functions";

const PnLCharts = lazy(() => import("@/components/charts/PnLCharts"));
const ChartFallback = () => (
  <Card><CardContent className="h-72 flex items-center justify-center text-sm text-muted-foreground">Loading chart…</CardContent></Card>
);

export const Route = createFileRoute("/_app/expenses/pnl")({
  component: PnLPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const fmt = (n: number) => `৳ ${Math.round(n).toLocaleString()}`;

function PnLPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const fn = useServerFn(getProfitLoss);
  const { data, isLoading } = useQuery({ queryKey: ["pnl", from, to], queryFn: () => fn({ data: { from, to } }) });

  const profitColor = (data?.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex gap-3 items-end">
          <div><label className="text-xs text-muted-foreground block">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground block">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi title="Gross Revenue" value={fmt(data?.revenue ?? 0)} loading={isLoading} />
        <Kpi title="Ad Expenses" value={fmt(data?.spend ?? 0)} loading={isLoading} />
        <Kpi title="Net Profit" value={fmt(data?.netProfit ?? 0)} loading={isLoading} cls={profitColor} />
        <Kpi title="ROI (all sales)" value={`${(data?.roi ?? 0).toFixed(1)}%`} loading={isLoading} cls={profitColor} />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          Paid Marketing only (Ad-driven sales)
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Kpi title="Paid Revenue" value={fmt(data?.paidRevenue ?? 0)} loading={isLoading} cls="text-emerald-500" />
          <Kpi title="Paid Orders" value={String(data?.paidOrders ?? 0)} loading={isLoading} />
          <Kpi
            title="True ROAS"
            value={data && data.spend > 0 ? `${(data.paidRevenue / data.spend).toFixed(2)}×` : "—"}
            loading={isLoading}
            cls={(data?.paidRevenue ?? 0) >= (data?.spend ?? 0) ? "text-emerald-500" : "text-rose-500"}
          />
          <Kpi
            title="CPA (Cost / Order)"
            value={data && data.paidOrders > 0 ? fmt(data.spend / data.paidOrders) : "—"}
            loading={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          Organic Sales (excluded from ROAS)
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Kpi title="Organic Revenue" value={fmt(data?.organicRevenue ?? 0)} loading={isLoading} cls="text-sky-500" />
          <Kpi title="Organic Orders" value={String(data?.organicOrders ?? 0)} loading={isLoading} />
          <Kpi
            title="% of Total Revenue"
            value={
              data && (data.paidRevenue + data.organicRevenue) > 0
                ? `${((data.organicRevenue / (data.paidRevenue + data.organicRevenue)) * 100).toFixed(1)}%`
                : "—"
            }
            loading={isLoading}
          />
          <Kpi title="Organic + Paid Total" value={fmt((data?.paidRevenue ?? 0) + (data?.organicRevenue ?? 0))} loading={isLoading} />
        </div>
      </div>


      <Suspense fallback={<><ChartFallback /><ChartFallback /></>}>
        <PnLCharts daily={data?.daily ?? []} monthly={data?.monthly ?? []} />
      </Suspense>
    </div>
  );
}

function Kpi({ title, value, loading, cls }: { title: string; value: string; loading?: boolean; cls?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-medium">{title}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-bold ${cls ?? ""}`}>{loading ? "..." : value}</div></CardContent>
    </Card>
  );
}