import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import {
  getTelesalesStaffReport,
  getTelesalesDrilldown,
  type TeleStaffReportRow,
  type TeleDrilldownItem,
} from "@/lib/telesales.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const METRIC_LABEL: Record<string, string> = {
  assigned: "Assigned",
  pending: "Pending",
  complete: "Complete",
  hold: "Hold",
  phone_off: "Phone Off",
  not_received: "Not Received",
  will_take_later: "Will Take Later",
  fraud: "Fraud",
  call_back_later: "Call Back Later",
  orders: "Attributed Orders",
  revenue: "Revenue",
};

type Metric = keyof typeof METRIC_LABEL;

type PresetKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "custom";

interface DateRange { from: Date; to: Date }

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "lastYear", label: "Last Year" },
];

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7": {
      const s = subDays(now, 6);
      return { from: startOfDay(s), to: endOfDay(now) };
    }
    case "thisMonth": {
      return { from: startOfMonth(now), to: endOfDay(now) };
    }
    case "lastMonth": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "thisYear": {
      return { from: startOfYear(now), to: endOfDay(now) };
    }
    case "lastYear": {
      const ly = new Date(now.getFullYear() - 1, 0, 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    }
    case "custom":
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

function DateRangeFilter({
  value,
  preset,
  onChange,
}: {
  value: DateRange;
  preset: PresetKey;
  onChange: (range: DateRange, preset: PresetKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(value.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(value.to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={preset === p.key ? "default" : "outline"}
          onClick={() => onChange(getPresetRange(p.key), p.key)}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            className={cn("gap-2", preset !== "custom" && "text-muted-foreground")}
          >
            <CalendarIcon className="h-4 w-4" />
            {preset === "custom"
              ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="mb-1 text-muted-foreground">From</div>
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={setTempFrom}
                  className="p-0 pointer-events-auto"
                />
              </div>
              <div>
                <div className="mb-1 text-muted-foreground">To</div>
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={setTempTo}
                  className="p-0 pointer-events-auto"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!tempFrom || !tempTo}
                onClick={() => {
                  if (!tempFrom || !tempTo) return;
                  const f = tempFrom <= tempTo ? tempFrom : tempTo;
                  const t = tempFrom <= tempTo ? tempTo : tempFrom;
                  onChange({ from: startOfDay(f), to: endOfDay(t) }, "custom");
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NumCell({
  value,
  onClick,
  tone,
}: {
  value: number | string;
  onClick?: () => void;
  tone?: string;
}) {
  if (!onClick) return <span className={tone}>{value}</span>;
  return (
    <button
      onClick={onClick}
      className={cn(
        "hover:underline underline-offset-2 font-medium tabular-nums",
        tone ?? "text-foreground",
      )}
    >
      {value}
    </button>
  );
}

export function TelesalesReport() {
  const today = new Date();
  const last7 = getPresetRange("last7");
  const [range, setRange] = useState<DateRange>(last7);
  const [preset, setPreset] = useState<PresetKey>("last7");
  const [drill, setDrill] = useState<{ staffId: string | null; staffName: string; metric: Metric } | null>(null);

  const fromStr = format(range.from, "yyyy-MM-dd");
  const toStr = format(range.to, "yyyy-MM-dd");

  const reportFn = useServerFn(getTelesalesStaffReport);
  const drillFn = useServerFn(getTelesalesDrilldown);

  const reportQ = useQuery({
    queryKey: ["tele-report", fromStr, toStr],
    queryFn: () => reportFn({ data: { from: fromStr, to: toStr } }),
  });

  const drillQ = useQuery({
    queryKey: ["tele-drill", drill?.staffId, drill?.metric, fromStr, toStr],
    queryFn: () =>
      drill
        ? drillFn({
            data: {
              staffId: drill.staffId,
              metric: drill.metric,
              from: fromStr,
              to: toStr,
            },
          })
        : Promise.resolve<TeleDrilldownItem[]>([]),
    enabled: !!drill,
  });

  const rows = reportQ.data ?? [];

  const totals = useMemo(() => {
    const t: TeleStaffReportRow = {
      staff_id: null, staff_name: "Total",
      assigned: 0, pending: 0, complete: 0, hold: 0,
      phone_off: 0, not_received: 0, will_take_later: 0, fraud: 0, call_back_later: 0,
      orders: 0, revenue: 0, completion_pct: 0,
    };
    for (const r of rows) {
      t.assigned += r.assigned; t.pending += r.pending; t.complete += r.complete; t.hold += r.hold;
      t.phone_off += r.phone_off; t.not_received += r.not_received;
      t.will_take_later += r.will_take_later; t.fraud += r.fraud;
      t.call_back_later += r.call_back_later;
      t.orders += r.orders; t.revenue += r.revenue;
    }
    t.completion_pct = t.assigned > 0 ? Math.round((t.complete / t.assigned) * 100) : 0;
    return t;
  }, [rows]);

  const openDrill = (row: TeleStaffReportRow, metric: Metric) => {
    setDrill({ staffId: row.staff_id, staffName: row.staff_name, metric });
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <DateRangeFilter
            value={range}
            preset={preset}
            onChange={(r, p) => { setRange(r); setPreset(p); }}
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {rows.length} staff shown
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="All Activity" value={totals.pending + totals.complete + totals.hold + totals.phone_off + totals.not_received + totals.will_take_later + totals.fraud + totals.call_back_later} tone="text-foreground" />
        <StatCard label="Total Assigned" value={totals.assigned} tone="text-blue-500" />
        <StatCard label="Complete" value={totals.complete} tone="text-emerald-500" />
        <StatCard label="Pending" value={totals.pending} tone="text-amber-500" />
        <StatCard label="Hold" value={totals.hold} tone="text-muted-foreground" />
        <StatCard label="Attributed Orders" value={totals.orders} tone="text-violet-500" />
        <StatCard label="Revenue" value={`৳ ${totals.revenue.toFixed(0)}`} tone="text-emerald-500" />
        <StatCard label="Completion" value={`${totals.completion_pct}%`} tone="text-emerald-500" />
      </div>

      {/* Staff table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Staff Performance</CardTitle>
          <CardDescription className="text-xs">
            এই রিপোর্টে সব সংখ্যা selected date range অনুযায়ী দেখায়; Attributed Orders মানে staff-এর নামে credited order.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {reportQ.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              এই রেঞ্জে কোনো ডাটা নেই।
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">All</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Complete</TableHead>
                  <TableHead className="text-right">Hold</TableHead>
                  <TableHead className="text-right">Phone Off</TableHead>
                  <TableHead className="text-right">Not Recv.</TableHead>
                  <TableHead className="text-right">Take Later</TableHead>
                  <TableHead className="text-right">Fraud</TableHead>
                  <TableHead className="text-right">Call Back</TableHead>
                  <TableHead className="text-right">Attributed Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="min-w-[140px]">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const all = r.pending + r.complete + r.hold + r.phone_off + r.not_received + r.will_take_later + r.fraud + r.call_back_later;
                  return (
                  <TableRow key={r.staff_id ?? "unassigned"}>
                    <TableCell className="font-medium">{r.staff_name}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{all}</TableCell>
                    <TableCell className="text-right"><NumCell value={r.assigned} onClick={() => openDrill(r, "assigned")} tone="text-blue-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.pending} onClick={r.pending ? () => openDrill(r, "pending") : undefined} tone="text-amber-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.complete} onClick={r.complete ? () => openDrill(r, "complete") : undefined} tone="text-emerald-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.hold} onClick={r.hold ? () => openDrill(r, "hold") : undefined} tone="text-muted-foreground" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.phone_off} onClick={r.phone_off ? () => openDrill(r, "phone_off") : undefined} tone="text-muted-foreground" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.not_received} onClick={r.not_received ? () => openDrill(r, "not_received") : undefined} tone="text-amber-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.will_take_later} onClick={r.will_take_later ? () => openDrill(r, "will_take_later") : undefined} tone="text-blue-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.fraud} onClick={r.fraud ? () => openDrill(r, "fraud") : undefined} tone="text-destructive" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.call_back_later} onClick={r.call_back_later ? () => openDrill(r, "call_back_later") : undefined} tone="text-emerald-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={r.orders} onClick={r.orders ? () => openDrill(r, "orders") : undefined} tone="text-violet-500" /></TableCell>
                    <TableCell className="text-right"><NumCell value={`৳ ${r.revenue.toFixed(0)}`} onClick={r.revenue ? () => openDrill(r, "revenue") : undefined} tone="text-emerald-500" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={r.completion_pct} className="h-2 w-20" />
                        <span className="text-xs tabular-nums w-9 text-right">{r.completion_pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totals.pending + totals.complete + totals.hold + totals.phone_off + totals.not_received + totals.will_take_later + totals.fraud + totals.call_back_later}</TableCell>
                  <TableCell className="text-right">{totals.assigned}</TableCell>
                  <TableCell className="text-right">{totals.pending}</TableCell>
                  <TableCell className="text-right">{totals.complete}</TableCell>
                  <TableCell className="text-right">{totals.hold}</TableCell>
                  <TableCell className="text-right">{totals.phone_off}</TableCell>
                  <TableCell className="text-right">{totals.not_received}</TableCell>
                  <TableCell className="text-right">{totals.will_take_later}</TableCell>
                  <TableCell className="text-right">{totals.fraud}</TableCell>
                  <TableCell className="text-right">{totals.call_back_later}</TableCell>
                  <TableCell className="text-right">{totals.orders}</TableCell>
                  <TableCell className="text-right">৳ {totals.revenue.toFixed(0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={totals.completion_pct} className="h-2 w-20" />
                      <span className="text-xs tabular-nums w-9 text-right">{totals.completion_pct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drilldown sheet */}
      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {drill ? `${drill.staffName} — ${METRIC_LABEL[drill.metric]}` : ""}
            </SheetTitle>
            <SheetDescription>
              {fromStr} → {toStr} • {(drillQ.data ?? []).length} item(s)
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drillQ.isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : (drillQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {(drillQ.data ?? [])[0]?.kind === "order" ? (
                      <>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Updated</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(drillQ.data ?? []).map((it) =>
                    it.kind === "order" ? (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-xs">{it.invoice_number ?? "—"}</TableCell>
                        <TableCell>{it.customer_name}</TableCell>
                        <TableCell className="font-mono text-xs">{it.customer_phone}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{it.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(it.created_at), "MMM d")}</TableCell>
                        <TableCell className="text-right tabular-nums">৳ {it.total_amount.toFixed(0)}</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{it.phone}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{it.address ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{it.status}</Badge></TableCell>
                        <TableCell className="text-xs">{it.last_action ? METRIC_LABEL[it.last_action] ?? it.last_action : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(it.updated_at), "MMM d")}</TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-semibold tabular-nums mt-0.5", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}
