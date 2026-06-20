import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, RefreshCw, Wallet, Package, Truck, RotateCcw,
  CreditCard, MapPin, CheckCircle2, XCircle, Clock, PauseCircle, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DateRangeFilter, getPresetRange, type DateRange, type PresetKey } from "@/components/date-range-filter";
import { EmptyCapability } from "@/components/couriers/EmptyCapability";
import { CourierStatCard } from "@/components/couriers/CourierStatCard";
import {
  getCourierOverview, getCourierCod, getCourierReturns,
  getCourierPayments, trackByConsignment,
} from "@/lib/courier-reports.functions";

export const Route = createFileRoute("/_app/couriers/$courierId")({
  component: CourierDetailPage,
});

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `৳${Number(v).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

function CourierDetailPage() {
  const { courierId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<PresetKey>("last7");
  const [range, setRange] = useState<DateRange>(getPresetRange("last7"));

  const rangePayload = {
    courierId,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };

  const overviewFn = useServerFn(getCourierOverview);
  const codFn = useServerFn(getCourierCod);
  const returnsFn = useServerFn(getCourierReturns);
  const paymentsFn = useServerFn(getCourierPayments);
  const trackFn = useServerFn(trackByConsignment);

  const overview = useQuery({
    queryKey: ["courier", courierId, "overview", rangePayload.from, rangePayload.to],
    queryFn: () => overviewFn({ data: rangePayload }),
  });

  const cod = useQuery({
    queryKey: ["courier", courierId, "cod", rangePayload.from, rangePayload.to],
    queryFn: () => codFn({ data: rangePayload }),
  });
  const returns = useQuery({
    queryKey: ["courier", courierId, "returns", rangePayload.from, rangePayload.to],
    queryFn: () => returnsFn({ data: rangePayload }),
  });
  const payments = useQuery({
    queryKey: ["courier", courierId, "payments", rangePayload.from, rangePayload.to],
    queryFn: () => paymentsFn({ data: rangePayload }),
  });

  const [cid, setCid] = useState("");
  const [trackResult, setTrackResult] = useState<any>(null);
  const [tracking, setTracking] = useState(false);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["courier", courierId] });
  };

  const courier = overview.data?.courier;
  const balance = overview.data?.balance as any;
  const analytics = overview.data?.analytics;

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!courier) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/couriers"><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>
        <EmptyCapability message="এই কুরিয়ার পাওয়া যায়নি" />
      </div>
    );
  }

  const codSupported = cod.data?.supported === true;
  const codData = codSupported ? (cod.data as any) : null;
  const returnsSupported = returns.data?.supported === true;
  const returnsData = returnsSupported ? (returns.data as any) : null;
  const paymentsSupported = payments.data?.supported === true;
  const paymentsData = paymentsSupported ? (payments.data as any) : null;
  const balanceSupported = balance?.supported === true;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              {courier.name}
              <Badge variant={courier.status === "active" ? "default" : "secondary"}>{courier.status}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Adapter: {courier.adapter}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={overview.isFetching}>
          <RefreshCw className={`h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Date range */}
      <Card>
        <CardContent className="p-3">
          <DateRangeFilter
            value={range}
            preset={preset}
            onChange={(r, p) => { setRange(r); setPreset(p); }}
          />
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CourierStatCard
          label="Current Balance"
          icon={Wallet}
          value={balanceSupported ? fmtMoney(balance?.current) : "—"}
          hint={balanceSupported ? (balance?.error ? balance.error : "Live from API") : "Not supported"}
        />
        <CourierStatCard
          label="Total Parcels"
          icon={Package}
          value={analytics?.total ?? 0}
          hint="In selected range"
        />
        <CourierStatCard
          label="Delivered"
          icon={CheckCircle2}
          value={analytics?.delivered ?? 0}
        />
        <CourierStatCard
          label="In Transit"
          icon={Truck}
          value={analytics?.in_transit ?? 0}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cod">COD</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CourierStatCard label="Available Balance" icon={Wallet}
              value={balanceSupported ? fmtMoney(balance?.available) : "—"} />
            <CourierStatCard label="Pending Amount" icon={Clock}
              value={balanceSupported ? fmtMoney(balance?.pending) : "—"} />
            <CourierStatCard label="Cancelled" icon={XCircle} value={analytics?.cancelled ?? 0} />
            <CourierStatCard label="Hold" icon={PauseCircle} value={analytics?.hold ?? 0} />
            <CourierStatCard label="Partial Delivered" icon={AlertTriangle} value={analytics?.partial ?? 0} />
            <CourierStatCard label="Returned" icon={RotateCcw} value={analytics?.returned ?? 0} />
          </div>
        </TabsContent>

        {/* COD */}
        <TabsContent value="cod">
          <Card>
            <CardHeader><CardTitle className="text-base">COD Report</CardTitle></CardHeader>
            <CardContent>
              {cod.isLoading ? <Skeleton className="h-24" /> :
                !codSupported ? <EmptyCapability /> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <CourierStatCard label="Total COD" icon={Wallet} value={fmtMoney(codData?.total)} />
                    <CourierStatCard label="Pending COD" icon={Clock} value={fmtMoney(codData?.pending)} />
                    <CourierStatCard label="Paid COD" icon={CheckCircle2} value={fmtMoney(codData?.paid)} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2">COD History</h3>
                    {!codData?.history?.length ? <EmptyCapability message="COD history পাওয়া যায়নি" /> : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Date</TableHead><TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead><TableHead>Transfer Date</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {codData.history.map((h: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{h.date}</TableCell>
                              <TableCell>{fmtMoney(h.amount)}</TableCell>
                              <TableCell><Badge variant="secondary">{h.status}</Badge></TableCell>
                              <TableCell>{h.transferDate ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Returns */}
        <TabsContent value="returns">
          <Card>
            <CardHeader><CardTitle className="text-base">Return Request</CardTitle></CardHeader>
            <CardContent>
              {returns.isLoading ? <Skeleton className="h-24" /> :
                !returnsSupported ? <EmptyCapability /> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <CourierStatCard label="Return Pending" icon={Clock} value={returnsData?.pending ?? 0} />
                    <CourierStatCard label="Returned Parcels" icon={RotateCcw} value={returnsData?.returned ?? 0} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2">Return History</h3>
                    {!returnsData?.items?.length ? <EmptyCapability message="কোনো return history পাওয়া যায়নি" /> : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Consignment</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {returnsData.items.map((it: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{it.consignmentId}</TableCell>
                              <TableCell>{it.invoice ?? "—"}</TableCell>
                              <TableCell>{it.reason ?? "—"}</TableCell>
                              <TableCell><Badge variant="secondary">{it.status ?? "—"}</Badge></TableCell>
                              <TableCell>{it.date ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base">Payment History</CardTitle></CardHeader>
            <CardContent>
              {payments.isLoading ? <Skeleton className="h-24" /> :
                !paymentsSupported ? <EmptyCapability /> :
                !paymentsData?.items?.length ? <EmptyCapability message="কোনো payment record নেই" /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Amount</TableHead>
                    <TableHead>Transaction ID</TableHead><TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {paymentsData.items.map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{p.date}</TableCell>
                        <TableCell>{fmtMoney(p.amount)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.transactionId ?? "—"}</TableCell>
                        <TableCell>{p.method ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{p.status ?? "—"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tracking */}
        <TabsContent value="tracking">
          <Card>
            <CardHeader><CardTitle className="text-base">Tracking &amp; Shipment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Consignment ID দিন"
                  value={cid}
                  onChange={(e) => setCid(e.target.value)}
                  className="sm:max-w-sm"
                />
                <Button
                  onClick={async () => {
                    if (!cid.trim()) return;
                    setTracking(true);
                    try {
                      const r = await trackFn({ data: { courierId, consignmentId: cid.trim() } });
                      setTrackResult(r);
                    } catch (e) {
                      setTrackResult({ supported: true, error: e instanceof Error ? e.message : "Failed" });
                    } finally {
                      setTracking(false);
                    }
                  }}
                  disabled={tracking || !cid.trim()}
                >
                  {tracking ? "Tracking…" : "Track"}
                </Button>
              </div>

              {!trackResult ? (
                <p className="text-sm text-muted-foreground">Consignment ID দিয়ে status দেখুন।</p>
              ) : trackResult.supported === false ? (
                <EmptyCapability />
              ) : (
                <div className="space-y-3">
                  {trackResult.error && (
                    <p className="text-xs text-destructive">{trackResult.error}</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <CourierStatCard label="Delivery Status" icon={Truck}
                      value={trackResult.status ?? "—"} />
                    <CourierStatCard label="Consignment ID" icon={Package}
                      value={<span className="text-base font-mono">{trackResult.consignmentId ?? "—"}</span>} />
                    <CourierStatCard label="Tracking Code" icon={Package}
                      value={<span className="text-base font-mono">{trackResult.trackingCode ?? "—"}</span>} />
                    <CourierStatCard label="Current Location" icon={MapPin}
                      value={trackResult.location ?? "—"} />
                  </div>
                  {Array.isArray(trackResult.timeline) && trackResult.timeline.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Delivery Timeline</h3>
                      <ol className="space-y-2 border-l pl-4">
                        {trackResult.timeline.map((t: any, i: number) => (
                          <li key={i} className="text-sm">
                            <div className="font-medium">{t.status}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.at ?? ""}{t.location ? ` · ${t.location}` : ""}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <EmptyCapability message="Delivery timeline পাওয়া যায়নি" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics">
          <Card>
            <CardHeader><CardTitle className="text-base">Order Analytics</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <CourierStatCard label="Total Parcels" icon={Package} value={analytics?.total ?? 0} />
                <CourierStatCard label="Delivered" icon={CheckCircle2} value={analytics?.delivered ?? 0} />
                <CourierStatCard label="In Transit" icon={Truck} value={analytics?.in_transit ?? 0} />
                <CourierStatCard label="Cancelled" icon={XCircle} value={analytics?.cancelled ?? 0} />
                <CourierStatCard label="Hold" icon={PauseCircle} value={analytics?.hold ?? 0} />
                <CourierStatCard label="Partial Delivered" icon={AlertTriangle} value={analytics?.partial ?? 0} />
                <CourierStatCard label="Returned" icon={RotateCcw} value={analytics?.returned ?? 0} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Local orders database থেকে গণনা — নির্বাচিত date range অনুযায়ী।
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
