import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Package, ShoppingCart, Clock, Truck, CheckCircle2, XCircle, AlertCircle,
  PhoneOff, ShieldAlert, CalendarClock, BarChart3, CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";

import { getDashboardMinimal, type MinBucket } from "@/lib/dashboard-minimal.functions";
import { type StatusKey } from "@/lib/dashboard.functions";
import { listOrdersPage, getOrderCountsPage } from "@/lib/orders-page.functions";
import { presetRange, startOfDay, endOfDay, type DateRange, type PresetKey } from "@/components/dashboard/DateRangeFilter";
import { BusinessHeader } from "@/components/dashboard/BusinessHeader";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — OMS" }] }),
  component: Dashboard,
});

// "All Time" বাদ — full-table scan এড়াতে
const PRESET_LABELS: Record<Exclude<PresetKey, "all">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  last365: "Last 1 Year",
  custom: "Custom",
};

const STATUS_CARDS: { key: StatusKey; label: string; icon: typeof Package; color: string; to: string }[] = [
  { key: "all", label: "Total Orders", icon: ShoppingCart, color: "text-blue-500", to: "/orders" },
  { key: "pending_web", label: "Pending Orders", icon: AlertCircle, color: "text-amber-500", to: "/orders?status=pending_web" },
  { key: "processing", label: "Processing", icon: Clock, color: "text-yellow-500", to: "/orders?status=processing" },
  { key: "ready_to_ship", label: "Ready to Ship", icon: Package, color: "text-blue-400", to: "/orders?status=ready_to_ship" },
  { key: "shipped", label: "Shipped", icon: Truck, color: "text-indigo-500", to: "/orders?status=shipped" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-emerald-500", to: "/orders?status=completed" },
  { key: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-500", to: "/orders?status=cancelled" },
  { key: "no_response", label: "No Response", icon: PhoneOff, color: "text-orange-500", to: "/orders?status=no_response" },
  { key: "fraud", label: "Fraud", icon: ShieldAlert, color: "text-rose-500", to: "/orders?status=fraud" },
  { key: "preorder", label: "Pre-Orders", icon: CalendarClock, color: "text-violet-500", to: "/orders?status=preorder" },
];

function Dashboard() {
  const qc = useQueryClient();
  const fetchMinimal = useServerFn(getDashboardMinimal);
  const prefetchOrdersList = useServerFn(listOrdersPage);
  const prefetchOrderCounts = useServerFn(getOrderCountsPage);
  const { permissions, role } = useAuth();
  const isAdmin = role === "admin" || role === "business_owner";
  const canViewAmounts = isAdmin || !!permissions?.can_view_profit;
  const canViewMonth = isAdmin || !!permissions?.can_view_reports;

  const [preset, setPreset] = useState<Exclude<PresetKey, "all">>("month");
  const [range, setRange] = useState<DateRange>(presetRange("month"));
  const [customOpen, setCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(range.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(range.to);

  const { todayRange, thisMonthRange } = useMemo(() => {
    const now = new Date();
    return {
      todayRange: { from: startOfDay(now), to: endOfDay(now) },
      thisMonthRange: {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      },
    };
  }, []);

  const args = useMemo(() => ({
    main: { from: range.from.toISOString(), to: range.to.toISOString() },
    today: { from: todayRange.from.toISOString(), to: todayRange.to.toISOString() },
    thisMonth: { from: thisMonthRange.from.toISOString(), to: thisMonthRange.to.toISOString() },
  }), [range, todayRange, thisMonthRange]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-minimal", args],
    queryFn: () => fetchMinimal({ data: args }),
    staleTime: 30_000,
  });

  const EMPTY: MinBucket = { count: 0, qty: 0, value: 0 };
  const STATUS_KEYS: StatusKey[] = ["all","pending_web","processing","ready_to_ship","shipped","completed","cancelled","no_response","fraud","preorder"];

  const byStatus = useMemo(() => {
    const out = Object.fromEntries(STATUS_KEYS.map((k) => [k, { ...EMPTY }])) as Record<StatusKey, MinBucket>;
    if (!data) return out;
    for (const [k, v] of Object.entries(data.byStatus ?? {})) {
      if (k in out && k !== "all" && k !== "preorder") out[k as StatusKey] = v as MinBucket;
    }
    if (data.all) out.all = data.all;
    if (data.preorder) out.preorder = data.preorder;
    return out;
  }, [data]);

  const todaySent = data?.todaySent;
  const thisMonthData = data?.thisMonth;

  // Realtime: orders table change হলে 5 second debounce-এ refetch।
  // আগে প্রতি change-এ পুরো RPC re-fetch হতো → bulk update-এ ১০০+ call।
  useEffect(() => {
    const timer: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["dashboard-minimal"] });
        }, 5000);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Warm the Orders page cache once after login so /orders feels instant.
  // Matches the default query keys used by orders.index.lazy.tsx (status=pending,
  // page=1, limit=10, all filters "all", date preset last365).
  useEffect(() => {
    const r = presetRange("last365");
    const fromIso = r.from.toISOString();
    const toIso = r.to.toISOString();
    const baseFilters = {
      source: "all", site: "all", courier: "all", partner: "all", staff: "all",
      preset: "last365" as const, from: fromIso, to: toIso, q: "",
      tagPhones: null as string[] | null, advanceOnly: false,
    };
    // Must match the orders route's default search (status: "all" per ordersSearch Zod schema).
    const listKey = ["orders", "list", { status: "all", page: 1, limit: 10, ...baseFilters }];
    const countsKey = ["orders", "counts", { ...baseFilters }];
    qc.prefetchQuery({
      queryKey: listKey,
      staleTime: 60_000,
      queryFn: () => prefetchOrdersList({ data: {
        status: "all", page: 1, limit: 10,
        source: "all", site: "all", courier: "all", partner: "all", staff: "all",
        from: fromIso, to: toIso, q: "", tagPhones: null, advanceOnly: false,
      } }),
    }).catch(() => {});
    qc.prefetchQuery({
      queryKey: countsKey,
      staleTime: 2 * 60_000,
      queryFn: () => prefetchOrderCounts({ data: {
        source: "all", site: "all", courier: "all", partner: "all", staff: "all",
        from: fromIso, to: toIso, q: "", tagPhones: null, advanceOnly: false,
      } }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n: number) => `৳ ${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Business header — আলাদা query, staleTime: Infinity, memoized */}
      <BusinessHeader />

      {/* Today's send + sale */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground px-1">Today</div>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Today's Send</p>
                  <p className="mt-1 text-2xl font-bold">
                    {isLoading ? "…" : (todaySent?.count ?? 0)}
                    {canViewAmounts && (
                      <span className="text-sm font-normal text-muted-foreground ml-1">({fmt(todaySent?.value ?? 0)})</span>
                    )}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-2"><BarChart3 className="h-4 w-4" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Today's Sale (Qty)</p>
                  <p className="mt-1 text-2xl font-bold">
                    {isLoading ? "…" : (todaySent?.qty ?? 0)}
                    {canViewAmounts && (
                      <span className="text-sm font-normal text-muted-foreground ml-1">({fmt(todaySent?.value ?? 0)})</span>
                    )}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-2"><ShoppingCart className="h-4 w-4" /></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* This Month summary — শুধু reports permission থাকলে */}
      {canViewMonth && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">This Month</div>
            <div className="space-y-2 text-sm">
              {([
                ...(canViewAmounts ? [["Sales", isLoading ? "…" : fmt(thisMonthData?.sales ?? 0)] as [string, string]] : []),
                ["Orders", isLoading ? "…" : String(thisMonthData?.orders ?? 0)],
                ["Quantity", isLoading ? "…" : String(thisMonthData?.quantity ?? 0)],
                ["Customer", isLoading ? "…" : String(thisMonthData?.customers ?? 0)],
                ["Return", isLoading ? "…" : String(thisMonthData?.returns ?? 0)],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  {k === "Sales" ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{v}</span>
                  ) : (
                    <span className="font-medium">{v}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Overview (status cards) with date filter */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Orders Overview</h2>
          <p className="text-xs text-muted-foreground">Status breakdown for the selected period</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={preset}
            onValueChange={(val: string) => {
              if (val === "custom") {
                setTempFrom(range.from);
                setTempTo(range.to);
                setCustomOpen(true);
              } else {
                const k = val as Exclude<PresetKey, "all" | "custom">;
                setRange(presetRange(k));
                setPreset(k);
              }
            }}
          >
            <SelectTrigger className="w-40">
              <CalendarIcon className="h-4 w-4 mr-2 opacity-70" />
              <SelectValue placeholder="Select Date" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as Array<keyof typeof PRESET_LABELS>).map((k) => (
                <SelectItem key={k} value={k}>
                  {k === "custom" && preset === "custom"
                    ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
                    : PRESET_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild><span className="hidden" /></PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="mb-1 text-muted-foreground">From</div>
                    <Calendar mode="single" selected={tempFrom} onSelect={setTempFrom} className="p-0 pointer-events-auto" />
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground">To</div>
                    <Calendar mode="single" selected={tempTo} onSelect={setTempTo} className="p-0 pointer-events-auto" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!tempFrom || !tempTo}
                    onClick={() => {
                      if (!tempFrom || !tempTo) return;
                      const f = tempFrom <= tempTo ? tempFrom : tempTo;
                      const t = tempFrom <= tempTo ? tempTo : tempFrom;
                      setRange({ from: startOfDay(f), to: endOfDay(t) });
                      setPreset("custom");
                      setCustomOpen(false);
                    }}
                  >Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {STATUS_CARDS.map((c) => {
          const bucket = byStatus[c.key];
          return (
            <Link key={c.key} to={c.to} className="block">
              <Card className="relative overflow-hidden h-full hover:border-primary/40 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  <c.icon className={`h-4 w-4 ${c.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isLoading ? "…" : (bucket?.count ?? 0)}</div>
                  {canViewAmounts && (
                    <div className="text-xs text-muted-foreground mt-1">{isLoading ? "" : fmt(bucket?.value ?? 0)}</div>
                  )}
                </CardContent>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/40 to-accent/40" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
