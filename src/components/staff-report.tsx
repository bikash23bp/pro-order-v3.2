import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Loader2, Download, FileText } from "lucide-react";
import { exportCSV, exportPDF } from "@/lib/export-utils";
import {
  getStaffReport, getStaffDrilldown,
  type StaffReportRow,
} from "@/lib/staff-report.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DateRangeFilter, getPresetRange,
  type PresetKey, type DateRange,
} from "@/components/date-range-filter";
import { cn } from "@/lib/utils";

type Metric = "total" | "manual" | "web" | "web_confirmed" | "facebook" | "other" | "telesales";

const METRIC_LABEL: Record<Metric, string> = {
  total: "Total Orders",
  manual: "Manual",
  web: "Web",
  web_confirmed: "Web (Confirmed)",
  facebook: "Facebook",
  other: "Other",
  telesales: "Telesales",
};

function NumBtn({ value, onClick }: { value: number; onClick?: () => void }) {
  if (!onClick || value === 0) return <span className="tabular-nums">{value}</span>;
  return (
    <button
      onClick={onClick}
      className="tabular-nums underline-offset-2 hover:underline text-primary font-medium"
    >{value}</button>
  );
}

export function StaffReport() {
  const [preset, setPreset] = useState<PresetKey>("last7");
  const [range, setRange] = useState<DateRange>(() => getPresetRange("last7"));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ userId: string; name: string; metric: Metric } | null>(null);

  const reportFn = useServerFn(getStaffReport);
  const drillFn = useServerFn(getStaffDrilldown);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const reportQ = useQuery({
    queryKey: ["staff-report", fromIso, toIso],
    queryFn: () => reportFn({ data: { from: fromIso, to: toIso } }),
  });

  const drillQ = useQuery({
    queryKey: ["staff-report-drill", fromIso, toIso, drill?.userId, drill?.metric],
    queryFn: () => drillFn({ data: {
      from: fromIso, to: toIso,
      userId: drill!.userId, metric: drill!.metric,
    } }),
    enabled: !!drill,
  });

  const rows = reportQ.data?.rows ?? [];

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => ({
      total_orders: acc.total_orders + r.total_orders,
      total_amount: acc.total_amount + r.total_amount,
      manual: acc.manual + r.manual_count,
      web: acc.web + r.web_count,
      web_confirmed: acc.web_confirmed + r.web_confirmed_count,
      facebook: acc.facebook + r.facebook_count,
      other: acc.other + r.other_count,
      telesales: acc.telesales + r.telesales_count,
    }), {
      total_orders: 0, total_amount: 0, manual: 0, web: 0,
      web_confirmed: 0, facebook: 0, other: 0, telesales: 0,
    });
  }, [rows]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const openDrill = (r: StaffReportRow, metric: Metric) => {
    setDrill({ userId: r.user_id, name: r.name, metric });
  };

  const rangeLabel = `${format(range.from, "yyyy-MM-dd")} → ${format(range.to, "yyyy-MM-dd")}`;

  const buildStaffRows = () =>
    rows.map((r) => ({
      Staff: r.name,
      Total: r.total_orders,
      Manual: r.manual_count,
      Web: r.web_count,
      "Web Confirmed": r.web_confirmed_count,
      Facebook: r.facebook_count,
      Telesales: r.telesales_count,
      Other: r.other_count,
      "Total Amount": r.total_amount,
    }));

  const handleExportCSV = () => {
    const data = buildStaffRows();
    data.push({
      Staff: "TOTAL",
      Total: totals.total_orders,
      Manual: totals.manual,
      Web: totals.web,
      "Web Confirmed": totals.web_confirmed,
      Facebook: totals.facebook,
      Telesales: totals.telesales,
      Other: totals.other,
      "Total Amount": totals.total_amount,
    });
    exportCSV(`staff-report-${format(range.from, "yyyyMMdd")}-${format(range.to, "yyyyMMdd")}`, data);
  };

  const handleExportPDF = () => {
    const headers = ["Staff", "Total", "Manual", "Web", "Web Confirmed", "Facebook", "Telesales", "Other", "Total ৳"];
    const body: (string | number)[][] = rows.map((r) => [
      r.name, r.total_orders, r.manual_count, r.web_count, r.web_confirmed_count,
      r.facebook_count, r.telesales_count, r.other_count, `৳ ${r.total_amount.toFixed(0)}`,
    ]);
    body.push([
      "TOTAL", totals.total_orders, totals.manual, totals.web, totals.web_confirmed,
      totals.facebook, totals.telesales, totals.other, `৳ ${totals.total_amount.toFixed(0)}`,
    ]);
    exportPDF({ title: "Staff Report", meta: `Range: ${rangeLabel}`, headers, rows: body });
  };

  const handleDrillExportCSV = () => {
    if (!drill || !drillQ.data) return;
    const data: Record<string, unknown>[] = drillQ.data.items.flatMap((o) => {
      const base = {
        "Order #": o.order_number,
        Invoice: o.invoice_number ?? "",
        Customer: o.customer_name,
        Phone: o.customer_phone,
        Status: o.status,
        Source: o.source,
        Subtotal: o.subtotal,
        Discount: o.discount_amount,
        Delivery: o.delivery_charge,
        Advance: o.advance_amount,
        Total: o.total_amount,
      };
      if (!o.items.length) return [{ ...base, Product: "", SKU: "", Qty: "" as number | string, Price: "" as number | string }];
      return o.items.map((it) => ({
        ...base, Product: it.product_name, SKU: it.sku ?? "",
        Qty: it.quantity as number | string, Price: it.unit_price as number | string,
      }));
    });
    exportCSV(`${drill.name}-${drill.metric}-${format(range.from, "yyyyMMdd")}`, data);
  };

  const handleDrillExportPDF = () => {
    if (!drill || !drillQ.data) return;
    const headers = ["Order #", "Invoice", "Customer", "Products", "Sub", "Disc", "Del", "Adv", "Total"];
    const body: (string | number)[][] = drillQ.data.items.map((o) => [
      `#${o.order_number}`,
      o.invoice_number ?? "—",
      `${o.customer_name}\n${o.customer_phone}`,
      o.items.map((it) => `${it.product_name}${it.sku ? ` [${it.sku}]` : ""} ×${it.quantity} @৳${it.unit_price.toFixed(0)}`).join("\n") || "—",
      `৳ ${o.subtotal.toFixed(0)}`,
      `৳ ${o.discount_amount.toFixed(0)}`,
      `৳ ${o.delivery_charge.toFixed(0)}`,
      `৳ ${o.advance_amount.toFixed(0)}`,
      `৳ ${o.total_amount.toFixed(0)}`,
    ]);
    exportPDF({
      title: `${drill.name} — ${METRIC_LABEL[drill.metric]}`,
      meta: `Range: ${rangeLabel} · ${drillQ.data.items.length} orders`,
      headers, rows: body,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <DateRangeFilter
          value={range}
          preset={preset}
          onChange={(r, p) => { setRange(r); setPreset(p); }}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={rows.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SumCard label="Total Orders" value={totals.total_orders} />
        <SumCard label="Total Revenue" value={`৳ ${totals.total_amount.toFixed(0)}`} tone="text-emerald-500" />
        <SumCard label="Manual" value={totals.manual} />
        <SumCard label="Web (Confirmed)" value={totals.web_confirmed} />
        <SumCard label="Telesales" value={totals.telesales} />
        <SumCard label="Active Staff" value={rows.filter((r) => r.total_orders > 0).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Report</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Manual</TableHead>
                <TableHead className="text-right">Web</TableHead>
                <TableHead className="text-right">Web Confirmed</TableHead>
                <TableHead className="text-right">Facebook</TableHead>
                <TableHead className="text-right">Telesales</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Total ৳</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportQ.isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No data in this range.</TableCell></TableRow>
              ) : rows.map((r) => {
                const isOpen = expanded.has(r.user_id);
                return (
                  <Fragment key={r.user_id}>
                    <TableRow>
                      <TableCell>
                        <button onClick={() => toggle(r.user_id)} className="text-muted-foreground hover:text-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right"><NumBtn value={r.total_orders} onClick={() => openDrill(r, "total")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.manual_count} onClick={() => openDrill(r, "manual")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.web_count} onClick={() => openDrill(r, "web")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.web_confirmed_count} onClick={() => openDrill(r, "web_confirmed")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.facebook_count} onClick={() => openDrill(r, "facebook")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.telesales_count} onClick={() => openDrill(r, "telesales")} /></TableCell>
                      <TableCell className="text-right"><NumBtn value={r.other_count} onClick={() => openDrill(r, "other")} /></TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">৳ {r.total_amount.toFixed(0)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={r.user_id + "-exp"}>
                        <TableCell colSpan={10} className="bg-muted/30 p-3">
                          {r.by_source.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No source breakdown.</div>
                          ) : (
                            <div className="text-xs space-y-1">
                              <div className="font-medium mb-1 text-muted-foreground">By Source</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {r.by_source.map((s, i) => (
                                  <div key={i} className="flex justify-between border rounded px-2 py-1">
                                    <span className="capitalize">{s.source_name}</span>
                                    <span className="tabular-nums text-muted-foreground">
                                      {s.count} · ৳ {s.amount.toFixed(0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
            {rows.length > 0 && (
              <tfoot>
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell />
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.total_orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.manual}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.web}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.web_confirmed}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.facebook}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.telesales}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.other}</TableCell>
                  <TableCell className="text-right tabular-nums">৳ {totals.total_amount.toFixed(0)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drill && `${drill.name} — ${METRIC_LABEL[drill.metric]}`}</SheetTitle>
            <SheetDescription>
              {drillQ.data?.items.length ?? 0} orders in selected range
            </SheetDescription>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleDrillExportCSV} disabled={!drillQ.data?.items.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleDrillExportPDF} disabled={!drillQ.data?.items.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {drillQ.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (drillQ.data?.items ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-6 text-sm">No orders.</div>
            ) : (
              (drillQ.data?.items ?? []).map((o) => (
                <Card key={o.id} className="overflow-hidden">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="font-semibold">#{o.order_number}
                          {o.invoice_number && <span className="ml-2 text-xs font-normal text-muted-foreground">Invoice: {o.invoice_number}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{o.customer_name} · {o.customer_phone}</div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs capitalize px-2 py-0.5 rounded bg-muted">{o.status}</span>
                        <span className="text-xs capitalize text-muted-foreground">{o.source}</span>
                      </div>
                    </div>

                    {o.items.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8">Product</TableHead>
                            <TableHead className="h-8">SKU</TableHead>
                            <TableHead className="h-8 text-right">Qty</TableHead>
                            <TableHead className="h-8 text-right">Price</TableHead>
                            <TableHead className="h-8 text-right">Line</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {o.items.map((it, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="py-1 text-xs">{it.product_name}</TableCell>
                              <TableCell className="py-1 text-xs font-mono">{it.sku ?? "—"}</TableCell>
                              <TableCell className="py-1 text-xs text-right tabular-nums">{it.quantity}</TableCell>
                              <TableCell className="py-1 text-xs text-right tabular-nums">৳ {it.unit_price.toFixed(0)}</TableCell>
                              <TableCell className="py-1 text-xs text-right tabular-nums">৳ {(it.quantity * it.unit_price).toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1 border-t">
                      <Stat label="Subtotal" value={o.subtotal} />
                      <Stat label="Discount" value={o.discount_amount} tone="text-rose-500" />
                      <Stat label="Delivery" value={o.delivery_charge} />
                      <Stat label="Advance" value={o.advance_amount} tone="text-amber-500" />
                      <Stat label="Total" value={o.total_amount} tone="text-emerald-500 font-bold" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", tone)}>৳ {value.toFixed(0)}</div>
    </div>
  );
}

function SumCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-xl font-bold mt-1", tone)}>{value}</div>
      </CardContent>
    </Card>
  );
}
