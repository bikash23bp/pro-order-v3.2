import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Shield, ShieldAlert, Loader2, Tags, MessageSquareWarning, AlertTriangle, CheckCircle2, Star } from "lucide-react";
import pathaoLogo from "@/assets/couriers/pathao.png";
import redxLogo from "@/assets/couriers/redx.png";
import steadfastLogo from "@/assets/couriers/steadfast.png";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCustomerHistoryByPhone } from "@/lib/customer-history.functions";
import { checkPhoneFraud, type CourierStat, type FraudReport } from "@/lib/fraud-check.functions";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_TAGS, TAG_LABEL, TAG_TONE, type CustomerTag } from "@/lib/tags.functions";
import { countOpenComplaintsByPhone } from "@/lib/complaints.functions";
import { ComplaintDialog } from "@/components/complaints/ComplaintDialog";
import { ReviewDialog } from "@/components/reviews/ReviewDialog";
import { reviewSummaryByPhone } from "@/lib/reviews.functions";
import { OrderDetailDialog, type DetailOrder } from "@/components/orders/OrderDetailDialog";

type HistoryData = Awaited<ReturnType<typeof getCustomerHistoryByPhone>>;

// Module-level per-phone cache. Survives across panel mounts (e.g. opening/closing
// the new-order dialog or switching between create/edit) so the user does not pay
// the network cost twice for the same phone.
type CacheEntry = {
  history?: { value: HistoryData; ts: number };
  fast?: { tags: CustomerTag[]; openComplaints: number; ts: number };
  fraud?: { value: FraudReport; ts: number };
};
const cache = new Map<string, CacheEntry>();
const FAST_TTL = 60_000;   // 1 min for history/tags/complaints
const FRAUD_TTL = 30 * 60_000; // 30 min for slow external fraud API

// Persistent fraud cache (survives reloads). Key: phone, value: { value, ts }
const FRAUD_LS_KEY = "fraudCache.v2";
function loadFraudLS(phone: string): { value: FraudReport; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FRAUD_LS_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, { value: FraudReport; ts: number }>;
    const entry = all[phone];
    if (!entry) return null;
    if (Date.now() - entry.ts >= FRAUD_TTL) return null;
    return entry;
  } catch { return null; }
}
function saveFraudLS(phone: string, value: FraudReport) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(FRAUD_LS_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, { value: FraudReport; ts: number }>;
    all[phone] = { value, ts: Date.now() };
    // Trim to last 50 phones to bound storage
    const keys = Object.keys(all);
    if (keys.length > 50) {
      const sorted = keys.sort((a, b) => all[a].ts - all[b].ts);
      for (const k of sorted.slice(0, keys.length - 50)) delete all[k];
    }
    window.localStorage.setItem(FRAUD_LS_KEY, JSON.stringify(all));
  } catch { /* ignore quota errors */ }
}

export function CustomerInsightsPanel({ phone, orderId }: { phone: string; orderId?: string | null }) {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [fraud, setFraud] = useState<FraudReport | null>(null);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [openComplaints, setOpenComplaints] = useState(0);
  const [showComplaints, setShowComplaints] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<{ count: number; avg: number }>({ count: 0, avg: 0 });
  const [loading, setLoading] = useState(false);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [viewOrder, setViewOrder] = useState<DetailOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const fetchHistory = useServerFn(getCustomerHistoryByPhone);
  const fetchFraud = useServerFn(checkPhoneFraud);
  const countComplaints = useServerFn(countOpenComplaintsByPhone);
  const fetchReviewSummary = useServerFn(reviewSummaryByPhone);

  const openOrder = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { data: o, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, consignment_id, invoice_note, internal_note, is_paid_marketing")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!o) { toast.error("Order not found"); return; }
      setViewOrder(o as unknown as DetailOrder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoadingOrderId(null);
    }
  };

  const trimmedPhone = phone.trim();

  const loadReviewSummary = async () => {
    if (trimmedPhone.replace(/\D/g, "").length < 6) return;
    try { setReviewSummary(await fetchReviewSummary({ data: { phone: trimmedPhone } })); }
    catch { /* ignore */ }
  };

  useEffect(() => { loadReviewSummary(); }, [trimmedPhone]);

  useEffect(() => {
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, "").length < 6) {
      setHistory(null);
      setFraud(null);
      setTags([]);
      setOpenComplaints(0);
      return;
    }

    // Hydrate from cache immediately (no spinner flash for repeat lookups).
    const cached = cache.get(trimmed);
    const now = Date.now();
    if (cached?.history && now - cached.history.ts < FAST_TTL) setHistory(cached.history.value);
    if (cached?.fast && now - cached.fast.ts < FAST_TTL) {
      setTags(cached.fast.tags);
      setOpenComplaints(cached.fast.openComplaints);
    }
    if (cached?.fraud && now - cached.fraud.ts < FRAUD_TTL) {
      setFraud(cached.fraud.value);
    } else {
      const ls = loadFraudLS(trimmed);
      if (ls) {
        setFraud(ls.value);
        const e2 = cache.get(trimmed) ?? {};
        e2.fraud = ls;
        cache.set(trimmed, e2);
      }
    }

    let cancelled = false;
    const t = setTimeout(() => {
      const entry: CacheEntry = cache.get(trimmed) ?? {};

      // FAST group — history + tags + complaints. Runs in parallel and
      // does NOT wait for the slow external fraud API.
      const needFast = !entry.history || now - entry.history.ts >= FAST_TTL
        || !entry.fast || now - entry.fast.ts >= FAST_TTL;
      if (needFast) {
        setLoading(true);
        Promise.all([
          fetchHistory({ data: { phone: trimmed } }),
          supabase.from("customer_tags").select("tag").eq("phone", trimmed),
          countComplaints({ data: { phone: trimmed } }),
        ]).then(([h, tagRes, cRes]) => {
          if (cancelled) return;
          const arr = ((tagRes.data ?? []) as Array<{ tag: CustomerTag }>)
            .map((r) => r.tag)
            .filter((t): t is CustomerTag => (CUSTOMER_TAGS as readonly string[]).includes(t));
          const uniqTags = Array.from(new Set(arr));
          setHistory(h);
          setTags(uniqTags);
          setOpenComplaints(cRes.count);
          const e2 = cache.get(trimmed) ?? {};
          e2.history = { value: h, ts: Date.now() };
          e2.fast = { tags: uniqTags, openComplaints: cRes.count, ts: Date.now() };
          cache.set(trimmed, e2);
        }).catch(() => {/* silent */}).finally(() => {
          if (!cancelled) setLoading(false);
        });
      }

      // SLOW group — fraud check via external BDCourier API.
      // Runs independently so it never blocks the fast UI.
      const needFraud = !entry.fraud || now - entry.fraud.ts >= FRAUD_TTL;
      if (needFraud) {
        setFraudLoading(true);
        fetchFraud({ data: { phone: trimmed } }).then((f) => {
          if (cancelled) return;
          setFraud(f);
          const e2 = cache.get(trimmed) ?? {};
          e2.fraud = { value: f, ts: Date.now() };
          cache.set(trimmed, e2);
          saveFraudLS(trimmed, f);
        }).catch(() => {/* silent */}).finally(() => {
          if (!cancelled) setFraudLoading(false);
        });
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [phone, fetchHistory, fetchFraud, countComplaints]);

  return (
    <div className="space-y-4">
      {openComplaints > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-700 bg-red-600 p-3 text-sm text-white">
          <MessageSquareWarning className="h-4 w-4 shrink-0 text-white" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white">{openComplaints} unresolved complaint{openComplaints > 1 ? "s" : ""}</p>
            <p className="text-xs text-white/90">Previous complaint not resolved — review before contacting.</p>
          </div>
          <Button size="sm" variant="outline" className="border-white/60 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => setShowComplaints(true)}>View</Button>
        </div>
      )}
      {openComplaints === 0 && trimmedPhone.replace(/\D/g, "").length >= 6 && (
        <Button size="sm" variant="ghost" className="w-full justify-start text-xs"
          onClick={() => setShowComplaints(true)}>
          <MessageSquareWarning className="h-3.5 w-3.5 mr-1" /> Add / view complaints
        </Button>
      )}
      {showComplaints && (
        <ComplaintDialog
          open={showComplaints}
          onOpenChange={async (v) => {
            setShowComplaints(v);
            if (!v) {
              const r = await countComplaints({ data: { phone: trimmedPhone } });
              setOpenComplaints(r.count);
            }
          }}
          phone={trimmedPhone}
          customerName={null}
        />
      )}
      {trimmedPhone.replace(/\D/g, "").length >= 6 && (
        <Button size="sm" variant="ghost" className="w-full justify-start text-xs"
          onClick={() => setShowReviews(true)}>
          <Star className="h-3.5 w-3.5 mr-1 text-amber-400 fill-amber-400" />
          {reviewSummary.count > 0
            ? `${reviewSummary.avg.toFixed(1)} ★ • ${reviewSummary.count} review${reviewSummary.count > 1 ? "s" : ""}`
            : "Add / view reviews"}
        </Button>
      )}
      {showReviews && (
        <ReviewDialog
          open={showReviews}
          onOpenChange={async (v) => { setShowReviews(v); if (!v) await loadReviewSummary(); }}
          phone={trimmedPhone}
          customerName={null}
          orderId={orderId ?? null}
        />
      )}
      {tags.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
          <Tags className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${TAG_TONE[t]}`}>
                {TAG_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
      )}

      {fraud?.warning && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-gradient-to-r from-destructive/15 to-destructive/5 p-3 text-sm text-destructive shadow-sm">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Fraud Alert</p>
            <p className="text-xs opacity-90">{fraud.warning}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />Customer History
            {loading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!history ? (
            <p className="text-xs text-muted-foreground">Enter phone to load history.</p>
          ) : history.totalOrders === 0 ? (
            <p className="text-xs text-muted-foreground">New customer — no previous orders.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Total" value={history.totalOrders} />
                <Stat label="Successful" value={history.successful} tone="green" />
                <Stat label="Running" value={history.running} tone="amber" />
                <Stat label="Cancelled" value={history.cancelled} tone="red" />
              </div>
              {history.recentOrders.length > 0 && (
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-[10px] uppercase text-muted-foreground">Recent</p>
                  {history.recentOrders.map((o) => {
                    const s = o.status;
                    const rowTone =
                      s === "completed"
                        ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                        : s === "cancelled" || s === "returned" || s === "cancel_request" || s === "return_request"
                          ? "bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300"
                          : "bg-red-600/20 hover:bg-red-600/30 text-red-700 dark:text-red-300";
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => openOrder(o.id)}
                        disabled={loadingOrderId === o.id}
                        className={`w-full grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 text-xs rounded px-1.5 py-1 transition-colors disabled:opacity-60 text-left ${rowTone}`}
                      >
                        <span className="font-mono">#{o.order_number}</span>
                        <span className="text-[10px] opacity-80 tabular-nums">
                          {new Date(o.created_at).toLocaleDateString()}
                        </span>
                        <Badge variant="secondary" className="text-[10px] justify-self-start">{o.status}</Badge>
                        <span className="opacity-90 justify-self-end">
                          {loadingOrderId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : `৳${o.total_amount.toFixed(0)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border/70 bg-gradient-to-r from-fraud-soft to-background pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {fraud && fraud.overall && fraud.overall.successRate < 50 ? (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            ) : (
              <Shield className="h-4 w-4 text-fraud-success" />
            )}
            <span className="font-semibold tracking-tight">Courier Fraud Check</span>
            {fraudLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          {(() => {
            const derivedOurRecord: CourierStat | null = history
              ? {
                  total: history.totalOrders,
                  success: history.successful,
                  cancelled: history.cancelled,
                  successRate: history.totalOrders > 0
                    ? Math.round((history.successful / history.totalOrders) * 100)
                    : 0,
                }
              : null;
            const ourRecord = fraud?.ourRecord ?? derivedOurRecord;
            const courierRows = [
              { label: "Pathao", stat: fraud?.pathao, logo: pathaoLogo },
              { label: "Steadfast", stat: fraud?.steadfast, logo: steadfastLogo },
              { label: "ParcelDex", stat: fraud?.parceldex, wordmark: "parceldex" },
              { label: "RedX", stat: fraud?.redx, logo: redxLogo },
              { label: "Paperfly", stat: fraud?.paperfly, wordmark: "PAPERFLY" },
              { label: "CarryBee", stat: fraud?.carrybee, wordmark: "carrybee" },
            ] as const;
            const overall = fraud?.overall ?? aggregateCourierStats(courierRows.map((row) => normalizeCourierStat(row.stat)));
            const summaryStat = overall.total > 0 ? overall : ourRecord;
            const showSkeletonCouriers = fraudLoading && !fraud;
            if (!ourRecord && !fraud) {
              return <p className="text-xs text-muted-foreground">Enter phone to check.</p>;
            }
            return (
              <>
                {summaryStat && (
                  <FraudSummaryCard stat={summaryStat} ourRecord={ourRecord} />
                )}
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                  <div className="grid grid-cols-[minmax(96px,1.2fr)_0.85fr_0.85fr_0.95fr] items-center gap-3 bg-fraud-accent px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fraud-accent-foreground">
                    <span>Courier</span>
                    <span className="text-center">Total</span>
                    <span className="text-center">Success</span>
                    <span className="text-center">Cancel</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {showSkeletonCouriers ? (
                      Array.from({ length: 6 }).map((_, index) => (
                        <CourierTableSkeletonRow key={index} />
                      ))
                    ) : (
                      courierRows.map((row) => (
                        <CourierTableRow
                          key={row.label}
                          label={row.label}
                          logo={"logo" in row ? row.logo : undefined}
                          wordmark={"wordmark" in row ? row.wordmark : undefined}
                          stat={normalizeCourierStat(row.stat)}
                        />
                      ))
                    )}
                    <CourierTotalRow stat={overall} />
                  </div>
                </div>
                {fraud?.detectedCouriers && fraud.detectedCouriers.length > 0 && !showSkeletonCouriers && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">BDCourier data:</span>
                    {fraud.detectedCouriers.map((name) => (
                      <span key={name} className="rounded-full border border-border/70 bg-background px-2 py-0.5 font-medium text-foreground capitalize">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
                {!fraud?.hasApiKey && !showSkeletonCouriers && (
                  <p className="text-[11px] text-muted-foreground">
                    Add a BDCourier API key in Settings to enable per-courier checks.
                  </p>
                )}
                <FraudStatusBanner stat={summaryStat ?? normalizeCourierStat(null)} />
                {fraud?.apiError && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                    <p className="font-semibold mb-0.5">BDCourier API problem</p>
                    <p className="break-words opacity-90">{fraud.apiError}</p>
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      {viewOrder && (
        <OrderDetailDialog order={viewOrder} onClose={() => setViewOrder(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : tone === "red" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function normalizeCourierStat(stat: CourierStat | null | undefined): CourierStat {
  if (!stat) return { total: 0, success: 0, cancelled: 0, successRate: 0 };
  return stat;
}

function aggregateCourierStats(stats: CourierStat[]): CourierStat {
  const total = stats.reduce((sum, item) => sum + item.total, 0);
  const success = stats.reduce((sum, item) => sum + item.success, 0);
  const cancelled = stats.reduce((sum, item) => sum + item.cancelled, 0);
  return {
    total,
    success,
    cancelled,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
  };
}

function successTone(rate: number) {
  if (rate >= 80) return { text: "text-fraud-success", fill: "bg-fraud-success", badge: "Low Risk", soft: "bg-fraud-success-soft", border: "border-fraud-success/30" };
  if (rate >= 50) return { text: "text-amber-600 dark:text-amber-400", fill: "bg-amber-500", badge: "Medium Risk", soft: "bg-amber-500/12", border: "border-amber-500/30" };
  return { text: "text-fraud-danger", fill: "bg-fraud-danger", badge: "High Risk", soft: "bg-fraud-danger/12", border: "border-fraud-danger/30" };
}

function FraudSummaryCard({ stat, ourRecord }: { stat: CourierStat; ourRecord: CourierStat | null }) {
  const tone = successTone(stat.successRate);
  return (
    <div className={`rounded-xl border bg-background px-4 py-3 ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Success Rate</p>
          <div className="mt-1 flex items-end gap-2">
            <span className={`text-4xl font-black leading-none tabular-nums ${tone.text}`}>{stat.successRate}%</span>
            <span className="pb-1 text-xs text-muted-foreground">{stat.success}/{stat.total} delivered · {stat.cancelled} cancel</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${tone.soft} ${tone.text}`}>
          {stat.successRate >= 80 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {tone.badge}
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${stat.successRate}%` }} />
      </div>
      {ourRecord && ourRecord.total > 0 && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Our Record</span>
          <span className="font-semibold tabular-nums text-foreground">{ourRecord.success}/{ourRecord.total}</span>
        </div>
      )}
    </div>
  );
}

function CourierBrandPill({ label, logo, wordmark }: { label: string; logo?: string; wordmark?: string }) {
  return (
    <span className="inline-flex h-10 w-[108px] items-center justify-center rounded-xl border border-border/80 bg-background px-3">
      {logo ? (
        <img src={logo} alt={label} loading="lazy" decoding="async" className="max-h-7 w-full object-contain" />
      ) : (
        <span className="text-[15px] font-semibold italic tracking-tight text-foreground">{wordmark ?? label}</span>
      )}
    </span>
  );
}

function CourierTableRow({ label, stat, logo, wordmark }: { label: string; stat: CourierStat; logo?: string; wordmark?: string }) {
  return (
    <div className="grid grid-cols-[minmax(96px,1.2fr)_0.85fr_0.85fr_0.95fr] items-center gap-3 px-4 py-2.5 text-sm">
      <CourierBrandPill label={label} logo={logo} wordmark={wordmark} />
      <span className="text-center font-semibold tabular-nums text-foreground">{stat.total}</span>
      <span className="text-center font-semibold tabular-nums text-fraud-success">{stat.success}</span>
      <span className="text-center font-semibold tabular-nums text-fraud-danger">{stat.cancelled}</span>
    </div>
  );
}

function CourierTableSkeletonRow() {
  return (
    <div className="grid grid-cols-[minmax(96px,1.2fr)_0.85fr_0.85fr_0.95fr] items-center gap-3 px-4 py-2.5 text-sm">
      <span className="h-10 w-[108px] rounded-xl border border-border/80 bg-muted animate-pulse" />
      <span className="mx-auto h-4 w-8 rounded bg-muted animate-pulse" />
      <span className="mx-auto h-4 w-8 rounded bg-muted animate-pulse" />
      <span className="mx-auto h-4 w-8 rounded bg-muted animate-pulse" />
    </div>
  );
}

function CourierTotalRow({ stat }: { stat: CourierStat }) {
  return (
    <div className="grid grid-cols-[minmax(96px,1.2fr)_0.85fr_0.85fr_0.95fr] items-center gap-3 bg-muted/45 px-4 py-3 text-sm font-semibold">
      <span className="text-base font-bold text-foreground">Total</span>
      <span className="text-center tabular-nums text-foreground">{stat.total}</span>
      <span className="text-center tabular-nums text-fraud-success">{stat.success}</span>
      <span className="text-center tabular-nums text-fraud-danger">{stat.cancelled}</span>
    </div>
  );
}

function FraudStatusBanner({ stat }: { stat: CourierStat }) {
  const safe = stat.successRate >= 80;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${safe ? "border-fraud-success/35 bg-fraud-success-soft" : "border-fraud-danger/35 bg-fraud-danger/10"}`}>
      {safe ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-fraud-success shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-fraud-danger shrink-0" />}
      <div>
        <p className={`text-base font-bold ${safe ? "text-fraud-success" : "text-fraud-danger"}`}>
          {safe ? `High Success Rate: ${stat.successRate.toFixed(1)}%` : `Warning: ${stat.successRate.toFixed(1)}% success rate`}
        </p>
        <p className="text-sm text-muted-foreground">
          {safe ? "This customer appears safe based on previous records." : "Previous courier records need manual review before confirming."}
        </p>
      </div>
    </div>
  );
}
