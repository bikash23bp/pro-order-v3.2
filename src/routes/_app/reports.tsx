import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Save, RefreshCw, Settings2, Download, FileText } from "lucide-react";
import { syncAllMetaAccounts } from "@/lib/meta-ads.functions";
import { getReportsBundle } from "@/lib/reports-bundle.functions";
import { getWebsiteSalesBreakdown } from "@/lib/website-sales.functions";
import { getPaidOrganicSplit } from "@/lib/paid-organic-split.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
const StaffReport = lazy(() => import("@/components/staff-report").then(m => ({ default: m.StaffReport })));
const MetaAdReport = lazy(() => import("@/components/reports/MetaAdReport").then(m => ({ default: m.MetaAdReport })));
const MotherProductsReport = lazy(() => import("@/components/reports/MotherProductsReport").then(m => ({ default: m.MotherProductsReport })));
const PartnerOrdersReport = lazy(() => import("@/components/reports/PartnerOrdersReport").then(m => ({ default: m.PartnerOrdersReport })));
import { DateRangeFilter, getPresetRange, type PresetKey, type DateRange } from "@/components/date-range-filter";
import { exportCSV, exportPDF } from "@/lib/export-utils";
import { RecurringExpensesCard, computeRuleContribution, type ExpenseRule, type UserOrderStats } from "@/components/reports/RecurringExpensesCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportsChart } from "@/components/charts/ReportsCharts";

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  source: z.string().optional(),
  tab: z.string().optional(),
});

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — OMS" }] }),
  validateSearch: searchSchema,
  component: ReportsPage,
});

const STATUS_COLORS: Record<string, string> = {
  completed: "#10b981",
  processing: "#eab308",
  ready_to_ship: "#3b82f6",
  shipped: "#6366f1",
  cancelled: "#ef4444",
  returned: "#f97316",
  no_response: "#f59e0b",
  fraud: "#dc2626",
  pending_web: "#94a3b8",
};

// Statuses counted as revenue (আয়)
const REVENUE_STATUSES = new Set(["processing", "ready_to_ship", "shipped", "completed"]);

function ReportsPage() {
  const { isAdmin } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const fromDate = useMemo(
    () => search.from
      ? new Date(search.from)
      : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })(),
    [search.from],
  );
  const toDate = useMemo(
    () => search.to
      ? new Date(search.to)
      : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })(),
    [search.to],
  );

  const fromIso = useMemo(() => fromDate.toISOString(), [fromDate]);
  const toIso = useMemo(() => {
    const d = new Date(toDate); d.setHours(23, 59, 59, 999); return d.toISOString();
  }, [toDate]);
  const sourceId = search.source && search.source !== "all" ? search.source : null;
  const tab = search.tab ?? "overview";

  const sourcesQ = useQuery({
    queryKey: ["report-sources"],
    queryFn: async () => {
      const { data } = await supabase.from("order_sources").select("id,name").eq("visible", true).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const settingsQ = useQuery({
    queryKey: ["report-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("return_delivery_charge, return_packing_cost, report_courier_charge")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return {
        return_delivery_charge: Number(data?.return_delivery_charge ?? 0),
        return_packing_cost: Number(data?.return_packing_cost ?? 0),
        report_courier_charge: Number((data as { report_courier_charge?: number } | null)?.report_courier_charge ?? 0),
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const reportsBundleFn = useServerFn(getReportsBundle);
  const bundleQ = useQuery({
    queryKey: ["reports-bundle", fromIso, toIso, sourceId],
    queryFn: () =>
      reportsBundleFn({
        data: {
          from: fromIso,
          to: toIso,
          fromDate: fromDate.toISOString().slice(0, 10),
          toDate: toDate.toISOString().slice(0, 10),
          source: sourceId,
        },
      }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const paidOrganicFn = useServerFn(getPaidOrganicSplit);
  const paidOrganicQ = useQuery({
    queryKey: ["reports-paid-organic", fromIso, toIso, sourceId],
    queryFn: () => paidOrganicFn({ data: { from: fromIso, to: toIso, sourceId } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const expensesQ = useQuery({
    queryKey: ["report-expenses", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, amount, category, incurred_on, created_at")
        .gte("incurred_on", fromDate.toISOString().slice(0, 10))
        .lte("incurred_on", toDate.toISOString().slice(0, 10))
        .order("incurred_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const recurringQ = useQuery({
    queryKey: ["report-recurring-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_rules")
        .select("id,name,category,amount,frequency,per_order_amount,per_order_pct,assigned_user_id,enabled,start_date,end_date,note")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRule[];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const bundle = bundleQ.data;

  const userStats: UserOrderStats = useMemo(() => {
    const m: UserOrderStats = new Map();
    const us = bundle?.userStats ?? {};
    for (const [uid, v] of Object.entries(us)) {
      m.set(uid, { count: v.count, total: Number(v.total) });
    }
    return m;
  }, [bundle]);

  const returnedOrders = bundle?.returnedOrders ?? [];
  const orderValueTotal = Number(bundle?.summary.orderValueTotal ?? 0);

  const summary = useMemo(() => {
    const b = bundle?.summary;
    const rules = recurringQ.data ?? [];
    const revenue = Number(b?.revenue ?? 0);
    const productCost = Number(b?.productCost ?? 0);
    const manualExpenses = Number(b?.manualExpense ?? 0);
    const returnExpense = Number(b?.returnExpense ?? 0);

    const adCost = Number(b?.adCost ?? 0);
    const courierCharge = Number(b?.courierCharge ?? 0);
    const orderCount = Number(b?.orderCount ?? 0);
    const recurringExpense = rules.reduce(
      (s, r) => s + computeRuleContribution(r, fromDate, toDate, orderCount, userStats, orderValueTotal),
      0,
    );
    const totalExpenses = manualExpenses + returnExpense + adCost + recurringExpense + courierCharge;
    const grossProfit = revenue - productCost;
    return {
      revenue,
      productCost,
      grossProfit,
      manualExpenses,
      returnExpense,
      adCost,
      recurringExpense,
      courierCharge,
      totalExpenses,
      profit: grossProfit - totalExpenses,
      orderCount,
    };
  }, [bundle, recurringQ.data, expensesQ.data, fromDate, toDate, userStats, orderValueTotal]);

  const statusBreakdown = useMemo(
    () => (bundle?.statusBreakdown ?? []).map((s) => ({ name: s.name, value: Number(s.value) })),
    [bundle],
  );
  const incomeVsExpense = useMemo(
    () => (bundle?.incomeVsExpense ?? []).map((d) => ({ day: d.day, income: Number(d.income), expense: Number(d.expense) })),
    [bundle],
  );
  const staff = bundle?.staff ?? [];
  const topProducts = bundle?.topProducts ?? [];


  const setRange = (from?: Date, to?: Date) => {
    navigate({
      search: {
        ...search,
        from: from ? from.toISOString().slice(0, 10) : undefined,
        to: to ? to.toISOString().slice(0, 10) : undefined,
      },
    });
  };

  const [preset, setPreset] = useState<PresetKey>("custom");
  const dateRange: DateRange = { from: fromDate, to: toDate };
  const handleRangeChange = (r: DateRange, p: PresetKey) => {
    setPreset(p);
    setRange(r.from, r.to);
  };

  const rangeLabel = `${format(fromDate, "yyyy-MM-dd")} → ${format(toDate, "yyyy-MM-dd")}`;

  const handleExportCSV = () => {
    const rows = [
      { Metric: "Revenue", Value: summary.revenue.toFixed(2) },
      { Metric: "Product Cost", Value: summary.productCost.toFixed(2) },
      { Metric: "Gross Profit", Value: summary.grossProfit.toFixed(2) },
      { Metric: "Manual Expenses", Value: summary.manualExpenses.toFixed(2) },
      { Metric: "Return Expense", Value: summary.returnExpense.toFixed(2) },
      { Metric: "Ad Cost", Value: summary.adCost.toFixed(2) },
      { Metric: "Total Expenses", Value: summary.totalExpenses.toFixed(2) },
      { Metric: "Net Profit", Value: summary.profit.toFixed(2) },
      { Metric: "Orders", Value: String(summary.orderCount) },
    ];
    const daily = incomeVsExpense.map((d) => {
      const inc = Number(d.income); const exp = Number(d.expense);
      return { Date: d.day, Income: inc.toFixed(2), Expense: exp.toFixed(2), Net: (inc - exp).toFixed(2) };
    });
    exportCSV(
      `report-overview-${format(fromDate, "yyyyMMdd")}-${format(toDate, "yyyyMMdd")}`,
      [...rows, { Metric: "", Value: "" }, { Metric: "--- Daily ---", Value: "" }, ...(daily as unknown as Record<string, unknown>[])],
    );
  };

  const handleExportPDF = () => {
    const headers = ["Date", "Income (৳)", "Expense (৳)", "Net (৳)"];
    const body: (string | number)[][] = incomeVsExpense.map((d) => {
      const inc = Number(d.income); const exp = Number(d.expense);
      return [d.day, inc.toFixed(2), exp.toFixed(2), (inc - exp).toFixed(2)];
    });
    body.push(["TOTAL",
      summary.revenue.toFixed(2),
      summary.totalExpenses.toFixed(2),
      summary.profit.toFixed(2),
    ]);
    const meta =
      `Range: ${rangeLabel} · Revenue ৳${summary.revenue.toFixed(0)} · ` +
      `Product Cost ৳${summary.productCost.toFixed(0)} · ` +
      `Expenses ৳${summary.totalExpenses.toFixed(0)} · ` +
      `Net Profit ৳${summary.profit.toFixed(0)} · Orders ${summary.orderCount}`;
    exportPDF({ title: "Report Overview", meta, headers, rows: body });
  };


  const setSource = (val: string) => {
    navigate({ search: { ...search, source: val === "all" ? undefined : val } });
  };

  const setTab = (val: string) => {
    navigate({ search: { ...search, tab: val === "overview" ? undefined : val } });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Revenue (processing → completed) − Product Cost − Expenses (incl. Return &amp; Ad Cost) = Net Profit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={search.source ?? "all"} onValueChange={setSource}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(sourcesQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <SyncMetaAdsButton />
          <Button asChild variant="outline" size="sm">
            <Link to="/expenses/accounts"><Settings2 className="h-4 w-4" /> Ad Settings</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <DateRangeFilter value={dateRange} preset={preset} onChange={handleRangeChange} />
        {tab === "overview" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="staff">Staff Report</TabsTrigger>
          <TabsTrigger value="meta-ads">Meta Ad Report</TabsTrigger>
          <TabsTrigger value="mother">Mother Products</TabsTrigger>
          <TabsTrigger value="partners">OMS Partners</TabsTrigger>
          <TabsTrigger value="returns">
            Returns
            {returnedOrders.length > 0 && (
              <Badge variant="secondary" className="ml-2">{returnedOrders.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <Suspense fallback={<div className="h-40 rounded-md border bg-muted/20 animate-pulse" />}>
            <StaffReport />
          </Suspense>
        </TabsContent>

        <TabsContent value="meta-ads" className="mt-4">
          <Suspense fallback={<div className="h-72 rounded-md border bg-muted/20 animate-pulse" />}>
            <MetaAdReport />
          </Suspense>
        </TabsContent>

        <TabsContent value="mother" className="mt-4">
          <Suspense fallback={<div className="h-40 rounded-md border bg-muted/20 animate-pulse" />}>
            <MotherProductsReport from={fromIso} to={toIso} />
          </Suspense>
        </TabsContent>

        <TabsContent value="partners" className="mt-4">
          <Suspense fallback={<div className="h-40 rounded-md border bg-muted/20 animate-pulse" />}>
            <PartnerOrdersReport from={fromIso} to={toIso} />
          </Suspense>
        </TabsContent>




        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Revenue" value={`৳ ${summary.revenue.toFixed(2)}`} tone="text-emerald-500" />
            <StatCard label="Product Cost" value={`৳ ${summary.productCost.toFixed(2)}`} tone="text-amber-500" />
            <StatCard label="Gross Profit" value={`৳ ${summary.grossProfit.toFixed(2)}`} tone={summary.grossProfit >= 0 ? "text-emerald-500" : "text-rose-500"} />
            <StatCard
              label="Total Expenses"
              value={`৳ ${summary.totalExpenses.toFixed(2)}`}
              tone="text-rose-500"
              hint={[
                summary.recurringExpense > 0 ? `Recurring ৳${summary.recurringExpense.toFixed(0)}` : null,
                summary.returnExpense > 0 ? `Return ৳${summary.returnExpense.toFixed(0)}` : null,
                summary.adCost > 0 ? `Ad ৳${summary.adCost.toFixed(0)}` : null,
                summary.courierCharge > 0 ? `Courier ৳${summary.courierCharge.toFixed(0)}` : null,
              ].filter(Boolean).join(" · ") || undefined}
            />
            <StatCard label="Net Profit" value={`৳ ${summary.profit.toFixed(2)}`} tone={summary.profit >= 0 ? "text-emerald-500" : "text-rose-500"} />
            <StatCard label="Orders in Range" value={summary.orderCount} tone="text-blue-500" />
          </div>

          {/* Paid vs Organic breakdown */}
          {paidOrganicQ.data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Paid Sales"
                value={`৳ ${paidOrganicQ.data.paidRevenue.toFixed(2)}`}
                tone="text-fuchsia-500"
                hint="Ad-driven orders"
              />
              <StatCard
                label="Organic Sales"
                value={`৳ ${paidOrganicQ.data.organicRevenue.toFixed(2)}`}
                tone="text-teal-500"
                hint="Excluded from ROAS"
              />
              <StatCard
                label="Paid Orders"
                value={paidOrganicQ.data.paidOrders}
                tone="text-fuchsia-500"
              />
              <StatCard
                label="Organic Orders"
                value={paidOrganicQ.data.organicOrders}
                tone="text-teal-500"
              />
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Income vs Expense</CardTitle>
                <CardDescription>Daily revenue compared to expenses (incl. return cost)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ReportsChart variant="income-vs-expense" data={incomeVsExpense} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Status</CardTitle>
                <CardDescription>Breakdown by status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ReportsChart variant="status-pie" data={statusBreakdown} colors={STATUS_COLORS} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Staff */}
            <Card>
              <CardHeader>
                <CardTitle>Staff Performance</CardTitle>
                <CardDescription>Orders processed and sales per user</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>User</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {staff.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
                    ) : staff.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{s.orders}</TableCell>
                        <TableCell className="text-right">৳ {Number(s.sales).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Top products */}
            <Card>
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
                <CardDescription>By quantity sold</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topProducts.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
                    ) : topProducts.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{p.qty}</TableCell>
                        <TableCell className="text-right">৳ {Number(p.revenue).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Website-wise sales (WooCommerce sites) */}
          <WebsiteSalesCard fromIso={fromIso} toIso={toIso} />

          {/* Expenses manager */}
          <ExpensesManager
            expenses={expensesQ.data ?? []}
            loading={expensesQ.isLoading}
            canDelete={isAdmin}
            returnExpense={summary.returnExpense}
            returnedCount={returnedOrders.length}
            productCost={summary.productCost}
            adCost={summary.adCost}
            onChange={() => { qc.invalidateQueries({ queryKey: ["report-expenses"] }); qc.invalidateQueries({ queryKey: ["reports-bundle"] }); }}
          />

          <RecurringExpensesCard
            rules={recurringQ.data ?? []}
            loading={recurringQ.isLoading}
            canManage={isAdmin}
            from={fromDate}
            to={toDate}
            orderCount={summary.orderCount}
            userStats={userStats}
            orderValueTotal={orderValueTotal}
            onChange={() => qc.invalidateQueries({ queryKey: ["report-recurring-rules"] })}
          />
        </TabsContent>

        <TabsContent value="returns" className="space-y-6 mt-4">
          <ReturnsSettingsCard
            isAdmin={isAdmin}
            initial={settingsQ.data}
            onSaved={() => { qc.invalidateQueries({ queryKey: ["report-settings"] }); qc.invalidateQueries({ queryKey: ["reports-bundle"] }); }}
          />
          <ReturnedOrdersCard
            orders={returnedOrders}
            perOrderCost={
              (settingsQ.data?.return_delivery_charge ?? 0) +
              (settingsQ.data?.return_packing_cost ?? 0)
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, tone, hint }: { label: string; value: string | number; tone: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", tone)}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function DatePick({ label, date, onChange }: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-40 justify-start font-normal">
            <CalendarIcon className="h-4 w-4" />
            {format(date, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={(d) => d && onChange(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReturnsSettingsCard({
  isAdmin,
  initial,
  onSaved,
}: {
  isAdmin: boolean;
  initial?: { return_delivery_charge: number; return_packing_cost: number; report_courier_charge: number };
  onSaved: () => void;
}) {
  const [delivery, setDelivery] = useState("");
  const [packing, setPacking] = useState("");
  const [courier, setCourier] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setDelivery(String(initial.return_delivery_charge ?? 0));
      setPacking(String(initial.return_packing_cost ?? 0));
      setCourier(String(initial.report_courier_charge ?? 0));
    }
  }, [initial]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        return_delivery_charge: parseFloat(delivery) || 0,
        return_packing_cost: parseFloat(packing) || 0,
        report_courier_charge: parseFloat(courier) || 0,
      })
      .eq("id", true);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cost settings saved");
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Settings (Reports Only)</CardTitle>
        <CardDescription>
          These per-order amounts are used only for income/expense reports — they are NOT auto-added on the order form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Return Delivery Charge (per returned parcel)</Label>
            <Input
              type="number" step="0.01" value={delivery}
              disabled={!isAdmin}
              onChange={(e) => setDelivery(e.target.value)}
              placeholder="e.g. 60"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Packing Cost (per returned parcel)</Label>
            <Input
              type="number" step="0.01" value={packing}
              disabled={!isAdmin}
              onChange={(e) => setPacking(e.target.value)}
              placeholder="e.g. 20"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Courier Charge (per delivered/shipped order)</Label>
            <Input
              type="number" step="0.01" value={courier}
              disabled={!isAdmin}
              onChange={(e) => setCourier(e.target.value)}
              placeholder="e.g. 80"
            />
          </div>
        </div>
        {isAdmin ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}><Save className="h-4 w-4" />Save</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can change these values.</p>
        )}
      </CardContent>
    </Card>
  );
}


function ReturnedOrdersCard({
  orders,
  perOrderCost,
}: {
  orders: Array<{
    id: string;
    order_number: number;
    customer_name: string;
    customer_phone: string;
    total_amount: number | string;
    created_at: string;
  }>;
  perOrderCost: number;
}) {
  const total = orders.length * perOrderCost;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Returned Orders</CardTitle>
        <CardDescription>
          {orders.length} returned · auto expense: ৳ {total.toFixed(2)} ({orders.length} × ৳ {perOrderCost.toFixed(2)})
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Order Total</TableHead>
              <TableHead className="text-right">Return Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No returned orders in this range.</TableCell></TableRow>
            ) : orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">#{o.order_number}</TableCell>
                <TableCell>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(o.created_at), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">৳ {Number(o.total_amount).toFixed(2)}</TableCell>
                <TableCell className="text-right text-rose-500">৳ {perOrderCost.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type Expense = { id: string; title: string; amount: number; category: string | null; incurred_on: string };

function ExpensesManager({
  expenses, loading, canDelete, returnExpense, returnedCount, productCost, adCost, onChange,
}: {
  expenses: Expense[];
  loading: boolean;
  canDelete: boolean;
  returnExpense: number;
  returnedCount: number;
  productCost: number;
  adCost: number;
  onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(new Date());
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !amount) { toast.error("Title and amount required"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({
      title: title.trim(),
      amount: parseFloat(amount),
      category: category.trim() || null,
      incurred_on: date.toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Expense added");
    setTitle(""); setAmount(""); setCategory("");
    onChange();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Expense deleted");
    onChange();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
        <CardDescription>
          Track expenses to compute Net Profit. Product Cost, Return Expense, and Meta Ad Cost are auto-included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="md:col-span-2" />
          <Input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start font-normal">
                <CalendarIcon className="h-4 w-4" />
                {format(date, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex justify-end">
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4" /> Add Expense</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {productCost > 0 && (
              <TableRow className="bg-amber-500/5">
                <TableCell className="text-xs text-muted-foreground">auto</TableCell>
                <TableCell className="font-medium">Product Cost (COGS)</TableCell>
                <TableCell className="text-muted-foreground">Auto</TableCell>
                <TableCell className="text-right text-amber-500">৳ {productCost.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            )}
            {adCost > 0 && (
              <TableRow className="bg-sky-500/5">
                <TableCell className="text-xs text-muted-foreground">auto</TableCell>
                <TableCell className="font-medium">Ad Cost (Meta)</TableCell>
                <TableCell className="text-muted-foreground">Auto</TableCell>
                <TableCell className="text-right text-sky-500">৳ {adCost.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            )}
            {returnExpense > 0 && (
              <TableRow className="bg-rose-500/5">
                <TableCell className="text-xs text-muted-foreground">auto</TableCell>
                <TableCell className="font-medium">Return Expense ({returnedCount} parcel{returnedCount === 1 ? "" : "s"})</TableCell>
                <TableCell className="text-muted-foreground">Auto</TableCell>
                <TableCell className="text-right text-rose-500">৳ {returnExpense.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            )}
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : expenses.length === 0 && returnExpense === 0 && productCost === 0 && adCost === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No expenses in range.</TableCell></TableRow>
            ) : expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground">{e.incurred_on}</TableCell>
                <TableCell className="font-medium">{e.title}</TableCell>
                <TableCell className="text-muted-foreground">{e.category ?? "—"}</TableCell>
                <TableCell className="text-right">৳ {Number(e.amount).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => remove(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SyncMetaAdsButton() {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncAllMetaAccounts);
  const m = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.accounts} account(s), ${r.inserted} rows`);
      qc.invalidateQueries({ queryKey: ["ad-cost"] });
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      <RefreshCw className={cn("h-4 w-4", m.isPending && "animate-spin")} />
      {m.isPending ? "Syncing…" : "Sync Ads"}
    </Button>
  );
}

function WebsiteSalesCard({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const fetchFn = useServerFn(getWebsiteSalesBreakdown);
  const q = useQuery({
    queryKey: ["website-sales", fromIso, toIso],
    queryFn: () => fetchFn({ data: { from: fromIso, to: toIso } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const rows = q.data ?? [];
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Website-wise Sales</CardTitle>
        <CardDescription>Orders per WooCommerce site in the selected range</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Website</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No website orders in this range.</TableCell></TableRow>
            ) : (
              <>
                {rows.map((r) => (
                  <TableRow key={r.site_id ?? "__unknown__"}>
                    <TableCell className="font-medium">{r.site_name}</TableCell>
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="text-right">{r.delivered}</TableCell>
                    <TableCell className="text-right">{r.cancelled}</TableCell>
                    <TableCell className="text-right">{r.returned}</TableCell>
                    <TableCell className="text-right">৳ {Number(r.revenue).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">{totalOrders}</TableCell>
                  <TableCell className="text-right" colSpan={3}></TableCell>
                  <TableCell className="text-right font-semibold">৳ {totalRevenue.toFixed(2)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
