import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DateRangeFilter,
  getPresetRange,
  type PresetKey,
  type DateRange,
} from "@/components/date-range-filter";
import {
  getMetaCampaignReport,
  getMetaHourlyReport,
  getMetaMonthlyReport,
} from "@/lib/meta-ads.functions";

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtBdt = (n: number) => `৳${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number) => n.toLocaleString();
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
const toIsoDay = (d: Date) => d.toISOString().slice(0, 10);

export function MetaAdReport() {
  const qc = useQueryClient();
  const hourlyFn = useServerFn(getMetaHourlyReport);
  const monthlyFn = useServerFn(getMetaMonthlyReport);
  const campaignFn = useServerFn(getMetaCampaignReport);

  const [preset, setPreset] = useState<PresetKey>("last7");
  const [range, setRange] = useState<DateRange>(() => {
    const r = getPresetRange("last7");
    return { from: r.from, to: r.to };
  });
  const fromIso = toIsoDay(range.from);
  const toIsoStr = toIsoDay(range.to);

  const hourlyQ = useQuery({
    queryKey: ["meta-ad-report", "hourly"],
    queryFn: () => hourlyFn(),
    staleTime: 5 * 60 * 1000,
  });
  const monthlyQ = useQuery({
    queryKey: ["meta-ad-report", "monthly"],
    queryFn: () => monthlyFn(),
    staleTime: 5 * 60 * 1000,
  });
  const campaignQ = useQuery({
    queryKey: ["meta-ad-report", "campaigns", fromIso, toIsoStr],
    queryFn: () => campaignFn({ data: { from: fromIso, to: toIsoStr } }),
    staleTime: 60 * 1000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["meta-ad-report"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Hourly */}
      <Card>
        <CardHeader>
          <CardTitle>Last 24 Hours — Hourly Breakdown</CardTitle>
          <CardDescription>
            Ad spend vs orders for the past 24 hours (Asia/Dhaka time).
            {hourlyQ.data?.errors?.length
              ? ` · ${hourlyQ.data.errors.length} account error(s)`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlyQ.data?.rows ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis yAxisId="left" className="text-xs" />
                <YAxis yAxisId="right" orientation="right" className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="spend_bdt" name="Spend (৳)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="orders" name="Orders" stroke="#3b82f6" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ReportTable
            isHourly
            rows={(hourlyQ.data?.rows ?? []).map((r) => ({
              label: r.label,
              spend_usd: r.spend_usd,
              spend_bdt: r.spend_bdt,
              orders: r.orders,
              pieces: r.pieces,
              revenue: r.revenue,
            }))}
            loading={hourlyQ.isLoading}
          />
          {hourlyQ.data?.errors?.length ? (
            <div className="text-xs text-rose-500 space-y-1">
              {hourlyQ.data.errors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Report (Last 12 Months)</CardTitle>
          <CardDescription>Monthly ad spend, orders, pieces and revenue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyQ.data?.rows ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis yAxisId="left" className="text-xs" />
                <YAxis yAxisId="right" orientation="right" className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="spend_bdt" name="Spend (৳)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="revenue" name="Revenue (৳)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="orders" name="Orders" stroke="#3b82f6" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ReportTable
            rows={(monthlyQ.data?.rows ?? []).map((r) => ({
              label: r.month,
              spend_usd: r.spend_usd,
              spend_bdt: r.spend_bdt,
              orders: r.orders,
              pieces: r.pieces,
              revenue: r.revenue,
            }))}
            loading={monthlyQ.isLoading}
          />
        </CardContent>
      </Card>

      {/* Campaign-wise */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <CardTitle>Campaign-wise Breakdown</CardTitle>
              <CardDescription>
                Spend per campaign across all connected ad accounts.
              </CardDescription>
            </div>
            <DateRangeFilter
              value={range}
              preset={preset}
              onChange={(r, p) => {
                setPreset(p);
                setRange(r);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Spend (USD)</TableHead>
                  <TableHead className="text-right">Spend (৳)</TableHead>
                  <TableHead className="text-right">Avg/Day (৳)</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                  <TableHead>Last Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (campaignQ.data?.rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No campaign spend in this range
                    </TableCell>
                  </TableRow>
                ) : (
                  (campaignQ.data?.rows ?? []).map((r) => {
                    const total = campaignQ.data?.totalSpendBdt ?? 0;
                    const pct = total > 0 ? (r.spend_bdt / total) * 100 : 0;
                    return (
                      <TableRow key={`${r.campaign_id}-${r.account_name}`}>
                        <TableCell className="font-medium max-w-xs truncate" title={r.campaign_name}>
                          {r.campaign_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.account_name}</TableCell>
                        <TableCell className="text-right">{r.days}</TableCell>
                        <TableCell className="text-right">{fmtUsd(r.spend_usd)}</TableCell>
                        <TableCell className="text-right">{fmtBdt(r.spend_bdt)}</TableCell>
                        <TableCell className="text-right">
                          {r.days > 0 ? fmtBdt(safeDiv(r.spend_bdt, r.days)) : "—"}
                        </TableCell>
                        <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-muted-foreground">{r.last_spend_date ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {(campaignQ.data?.rows ?? []).length > 0 && (
                <TableBody>
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={4}>Total ({campaignQ.data?.rows.length})</TableCell>
                    <TableCell className="text-right">
                      {fmtBdt(campaignQ.data?.totalSpendBdt ?? 0)}
                    </TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                </TableBody>
              )}
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Note: Orders are not tagged with campaign IDs, so per-campaign ROAS isn't shown here.
            Use the Hourly / Monthly sections above for overall ROAS.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

type Row = {
  label: string;
  spend_usd: number;
  spend_bdt: number;
  orders: number;
  pieces: number;
  revenue: number;
};

function ReportTable({ rows, loading, isHourly }: { rows: Row[]; loading: boolean; isHourly?: boolean }) {
  const totals = rows.reduce(
    (a, r) => ({
      spend_usd: a.spend_usd + r.spend_usd,
      spend_bdt: a.spend_bdt + r.spend_bdt,
      orders: a.orders + r.orders,
      pieces: a.pieces + r.pieces,
      revenue: a.revenue + r.revenue,
    }),
    { spend_usd: 0, spend_bdt: 0, orders: 0, pieces: 0, revenue: 0 },
  );
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isHourly ? "Hour" : "Month"}</TableHead>
            <TableHead className="text-right">Spend (USD)</TableHead>
            <TableHead className="text-right">Spend (৳)</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right">Pieces</TableHead>
            <TableHead className="text-right">Revenue (৳)</TableHead>
            <TableHead className="text-right">Cost / Order</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No data
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right">{fmtUsd(r.spend_usd)}</TableCell>
                <TableCell className="text-right">{fmtBdt(r.spend_bdt)}</TableCell>
                <TableCell className="text-right">{fmtNum(r.orders)}</TableCell>
                <TableCell className="text-right">{fmtNum(r.pieces)}</TableCell>
                <TableCell className="text-right">{fmtBdt(r.revenue)}</TableCell>
                <TableCell className="text-right">
                  {r.orders > 0 ? fmtBdt(safeDiv(r.spend_bdt, r.orders)) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {r.spend_bdt > 0 ? `${safeDiv(r.revenue, r.spend_bdt).toFixed(2)}×` : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 && (
          <TableBody>
            <TableRow className="font-semibold border-t-2">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{fmtUsd(totals.spend_usd)}</TableCell>
              <TableCell className="text-right">{fmtBdt(totals.spend_bdt)}</TableCell>
              <TableCell className="text-right">{fmtNum(totals.orders)}</TableCell>
              <TableCell className="text-right">{fmtNum(totals.pieces)}</TableCell>
              <TableCell className="text-right">{fmtBdt(totals.revenue)}</TableCell>
              <TableCell className="text-right">
                {totals.orders > 0 ? fmtBdt(safeDiv(totals.spend_bdt, totals.orders)) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {totals.spend_bdt > 0 ? `${safeDiv(totals.revenue, totals.spend_bdt).toFixed(2)}×` : "—"}
              </TableCell>
            </TableRow>
          </TableBody>
        )}
      </Table>
    </div>
  );
}
