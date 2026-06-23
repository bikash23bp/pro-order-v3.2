import { createLazyFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { MemberBadge } from "@/components/MemberBadge";
import { useEffect, useMemo, useRef, useState, Fragment, lazy, Suspense } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Eye, Trash2, FileText, RefreshCw, Pencil, Printer, Send, Crown, Loader2, Truck, Download, Phone, Upload, StickyNote, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { downloadCsv, downloadXlsx } from "@/lib/export-utils";
import { presetRange, startOfDay, endOfDay, type DateRange, type PresetKey } from "@/components/dashboard/DateRangeFilter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { bulkSendToCourier, COURIER_PROVIDERS, type CourierProvider } from "@/lib/courier-bulk.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toAsciiDigits, normalizeBDPhone } from "@/lib/phone-paste";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { EditableOrder } from "@/components/orders/EditOrderDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DuplicateBadge } from "@/components/orders/DuplicateBadge";
import { listAllTagsByPhone, normalizePhoneKey, CUSTOMER_TAGS, TAG_LABEL, type CustomerTag } from "@/lib/tags.functions";
import { getDuplicatePhones } from "@/lib/duplicates.functions";
import { normalizePhoneClient } from "@/lib/duplicates.shared";
import { sendOrderStatusSms, sendBulkOrderSms } from "@/lib/sms.functions";
import { syncWooOrders } from "@/lib/woo-sync.functions";
import { exportOrdersPage, getOrderCountsPage, getOrderFilterOptions, getOrderListFlags, listOrdersPage } from "@/lib/orders-page.functions";
import { listIntegrationLabels } from "@/lib/integrations.functions";
import { importTelesalesCustomers } from "@/lib/telesales.functions";
import { syncAllCourierStatuses } from "@/lib/courier-sync.functions";
import { useOrderTemplate } from "@/hooks/use-order-template";
import { checkBlockedPhones, blockCustomer } from "@/lib/blocked-customers.functions";

const EditOrderDialog = lazy(() =>
  import("@/components/orders/EditOrderDialog").then((m) => ({ default: m.EditOrderDialog })),
);
const OrderDetailDialog = lazy(() =>
  import("@/components/orders/OrderDetailDialog").then((m) => ({ default: m.OrderDetailDialog })),
);
const CustomerProfileDialog = lazy(() =>
  import("@/components/customers/CustomerProfileDialog").then((m) => ({ default: m.CustomerProfileDialog })),
);
const ImportOrdersDialog = lazy(() =>
  import("@/components/orders/ImportOrdersDialog").then((m) => ({ default: m.ImportOrdersDialog })),
);
const BlockCustomerDialog = lazy(() =>
  import("@/components/customers/BlockCustomerDialog").then((m) => ({ default: m.BlockCustomerDialog })),
);
import { ShieldAlert, ShieldOff } from "lucide-react";

type OrderStatus =
  | "pending"
  | "pending_web"
  | "ready_order"
  | "processing"
  | "ready_to_ship"
  | "out_of_stock"
  | "shipped"
  | "completed"
  | "cancelled"
  | "cancel_request"
  | "returned"
  | "no_response"
  | "fraud"
  | "hold"
  | "incomplete";

type Order = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  status: OrderStatus;
  total_amount: number;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  advance_source_id: string | null;
  advance_txn_id: string | null;
  subtotal: number;
  created_at: string;
  consignment_id: string | null;
  tracking_url: string | null;
  invoice_note: string | null;
  internal_note: string | null;
  courier_id: string | null;
  order_source_id: string | null;
  source: string | null;
  preorder: boolean | null;
  preorder_date: string | null;
  customer_type?: string | null;
  created_by: string | null;
  updated_by: string | null;
  oms_sender_name?: string | null;
  oms_sender_order_no?: string | null;
  order_sources: { name: string } | null;
  site_name?: string | null;
  customer_flags?: {
    is_vip?: boolean;
    is_repeat?: boolean;
    is_duplicate?: boolean;
    returned_count?: number;
  } | null;
  creator: { full_name: string | null; email: string | null } | null;
  editor: { full_name: string | null; email: string | null } | null;
  order_items: Array<{
    quantity: number;
    unit_price: number;
    products: { name: string; image_url?: string | null } | null;
    product_variants?: { image_url: string | null; attributes: Record<string, string> | null } | null;
  }> | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  pending_web: "Web Pending",
  ready_order: "Ready Order",
  processing: "Processing",
  ready_to_ship: "Ready to Ship",
  out_of_stock: "Out of Stock",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
  returned: "Returned",
  no_response: "No Response",
  fraud: "Fraud",
  hold: "Hold",
  incomplete: "Incomplete",
  cancel_request: "Cancel Request",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  pending_web: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  processing: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  ready_order: "bg-amber-600/15 text-amber-500 border-amber-600/30",
  ready_to_ship: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  out_of_stock: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  shipped: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  returned: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  no_response: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  fraud: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  incomplete: "bg-amber-700/15 text-amber-200 border-amber-700/30",
  cancel_request: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

type TabDef = {
  key: string;
  label: string;
  color: string;
};

function TickingNumber({ priming, target, unavailable }: { priming: boolean; target: number; unavailable: boolean }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (unavailable) return;

    if (priming) {
      setN(0);
      let cur = 0;
      const id = window.setInterval(() => {
        cur += Math.floor(Math.random() * 4) + 1;
        setN(cur);
      }, 90 + Math.floor(Math.random() * 80));
      return () => window.clearInterval(id);
    }

    const id = window.setInterval(() => {
      setN((prev) => {
        const current = prev > target ? 0 : prev;
        const remaining = target - current;
        if (remaining <= 0) {
          window.clearInterval(id);
          return target;
        }
        const maxStep = Math.max(1, Math.ceil(remaining / 8));
        return current + Math.min(remaining, Math.floor(Math.random() * maxStep) + 1);
      });
    }, 55 + Math.floor(Math.random() * 45));

    return () => window.clearInterval(id);
  }, [priming, target, unavailable]);

  if (unavailable) return <>—</>;
  return <>{n.toLocaleString("en-IN")}</>;
}

const PRIMARY_TABS: TabDef[] = [
  { key: "processing",  label: "Processing",     color: "blue" },
  { key: "pending_web", label: "Web (Pending)", color: "orange" }, 
  { key: "facebook",    label: "Facebook",       color: "indigo" },
  { key: "partner",     label: "Partner Orders", color: "fuchsia" },
  { key: "incomplete",  label: "Incomplete Orders", color: "amber" },
  { key: "no_response", label: "No Response",    color: "orange" },
  { key: "preorder",    label: "Pre-Orders",     color: "violet" },
  { key: "hold",        label: "Hold",           color: "amber" },
  { key: "fraud",       label: "Fraud",          color: "red" },
  { key: "all",         label: "All",            color: "slate" },
];

const PIPELINE_TABS: TabDef[] = [
  { key: "pending",       label: "Pending",        color: "yellow" }, 
  { key: "ready_order",   label: "Ready Order",    color: "amber" },  // পেন্ডিং-এর ঠিক পরেই এটি রাখলাম
  { key: "ready_to_ship", label: "Ready to Ship",  color: "cyan" },
  { key: "out_of_stock",  label: "Out of Stock",   color: "purple" },
  { key: "shipped",       label: "Shipped",        color: "teal" },
  { key: "completed",     label: "Completed",      color: "green" },
  { key: "cancelled",     label: "Cancelled",      color: "zinc" },
  { key: "cancel_request", label: "Cancel Request", color: "rose" },
  { key: "returned",      label: "Returned",       color: "rose" },
];

const TAB_STATUSES: TabDef[] = [
  ...PRIMARY_TABS,
  ...PIPELINE_TABS,
];

// Aggressive client cache: switching between tabs/pages within this window
// reuses cached rows instantly with zero network round-trips. Mutations and
// realtime events still invalidate the cache, so freshness isn't sacrificed.
const ORDER_LIST_STALE_MS = 5 * 60_000;
const ORDER_LIST_GC_MS = 30 * 60_000;
const transientOrderLoadRetry = (failureCount: number, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/unauthorized|forbidden|invalid token/i.test(message)) return false;
  return failureCount < 3;
};

// High-contrast pill colors (solid bg + white text) so counts are clearly readable.
const TAB_COLOR_CLASSES: Record<string, {
  border: string; activeBg: string; activeText: string; pillBg: string; pillText: string; hover: string;
}> = {
  slate:  { border: "border-slate-500/50",  activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-slate-600",  pillText: "text-white", hover: "hover:bg-slate-500/15" },
  blue:   { border: "border-blue-500/60",   activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-blue-600",   pillText: "text-white", hover: "hover:bg-blue-500/15" },
  sky:    { border: "border-sky-500/60",    activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-sky-600",    pillText: "text-white", hover: "hover:bg-sky-500/15" },
  indigo: { border: "border-indigo-500/60", activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-indigo-600", pillText: "text-white", hover: "hover:bg-indigo-500/15" },
  amber:  { border: "border-amber-500/60",  activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-amber-500",  pillText: "text-black", hover: "hover:bg-amber-500/15" },
  orange: { border: "border-orange-500/60", activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-orange-600", pillText: "text-white", hover: "hover:bg-orange-500/15" },
  red:    { border: "border-red-500/60",    activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-red-600",    pillText: "text-white", hover: "hover:bg-red-500/15" },
  violet: { border: "border-violet-500/60", activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-violet-600", pillText: "text-white", hover: "hover:bg-violet-500/15" },
  yellow: { border: "border-yellow-500/70", activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-yellow-500", pillText: "text-black", hover: "hover:bg-yellow-500/15" },
  cyan:   { border: "border-cyan-500/70",   activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-cyan-600",   pillText: "text-white", hover: "hover:bg-cyan-500/15" },
  teal:   { border: "border-teal-500/70",   activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-teal-600",   pillText: "text-white", hover: "hover:bg-teal-500/15" },
  green:  { border: "border-green-500/70",  activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-green-600",  pillText: "text-white", hover: "hover:bg-green-500/15" },
  zinc:   { border: "border-zinc-500/50",   activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-zinc-600",   pillText: "text-white", hover: "hover:bg-zinc-500/15" },
  rose:   { border: "border-rose-500/60",   activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-rose-600",    pillText: "text-white", hover: "hover:bg-rose-500/15" },
  fuchsia:{ border: "border-fuchsia-500/60",activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-fuchsia-600", pillText: "text-white", hover: "hover:bg-fuchsia-500/15" },
  purple: { border: "border-purple-500/60", activeBg: "bg-[#00B795]",  activeText: "text-white",  pillBg: "bg-purple-600",  pillText: "text-white", hover: "hover:bg-purple-500/15" },
};

const PRESET_LABELS: Record<PresetKey, string> = {
  all: "All Time",
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  custom: "Custom",
};

export const Route = createLazyFileRoute("/_app/orders/")({
  component: OrdersPage,
});

function SyncWebOrdersButton({ onDone }: { onDone: () => void }) {
  const sync = useServerFn(syncWooOrders);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await sync({ data: {} });
      toast.success(`Synced ${r.created} new web order(s)${r.skipped ? ` (${r.skipped} already imported)` : ""}${r.failed ? ` — ${r.failed} failed` : ""}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {busy ? "Syncing web orders…" : "Sync Web Orders"}
    </Button>
  );
}

function SyncCourierStatusButton({ onDone }: { onDone: () => void }) {
  const sync = useServerFn(syncAllCourierStatuses);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await sync();
      const msg = `Checked ${r.checked}, updated ${r.updated} (${r.completed} completed, ${r.returned} returned)${r.failed ? ` — ${r.failed} failed` : ""}`;
      if (r.failed > 0 && r.updated === 0) toast.warning(msg);
      else toast.success(msg);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Courier sync failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
      {busy ? "Checking courier…" : "Sync Courier Status"}
    </Button>
  );
}

function OrdersPage() {
  const { isAdmin, session } = useAuth();
  const { desktopTemplate, mobileTemplate } = useOrderTemplate();
  const search = useSearch({ from: "/_app/orders/" });
  const navigate = useNavigate({ from: "/_app/orders/" });
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(search.dup ? "all" : (search.status ?? "all"));
  const [tabsOpen, setTabsOpen] = useState(false);
  const page = Math.max(1, search.page ?? 1);
  const limit = [10, 25, 50, 100].includes(search.limit ?? 10) ? (search.limit ?? 10) : 10;
  type CountBucket = { count: number; amount: number };
  type TabCountsData = {
    byStatus: Record<string, CountBucket>;
    all: CountBucket; web: CountBucket; facebook: CountBucket; preorder: CountBucket; partner?: CountBucket;
  };
  const [debouncedQ, setDebouncedQ] = useState("");
  const [viewing, setViewing] = useState<Order | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableOrder | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>(search.source ?? "all");
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>(search.site ?? "all");
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([]);
  const [courierFilter, setCourierFilter] = useState<string>(search.courier ?? "all");
  const [partners, setPartners] = useState<string[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string>((search as any).partner ?? "all");
  const [staffFilter, setStaffFilter] = useState<string>((search as any).staff ?? "all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [tagsByPhone, setTagsByPhone] = useState<Record<string, CustomerTag[]>>({});
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange("all"));
  const [datePreset, setDatePreset] = useState<PresetKey>("all");
  const [advanceOnly, setAdvanceOnly] = useState(Boolean(search.advanceOnly));
  const [customOpen, setCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(undefined);
  const [tempTo, setTempTo] = useState<Date | undefined>(undefined);
  const [hasManualStatusSelection, setHasManualStatusSelection] = useState(false);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkSmsMessage, setBulkSmsMessage] = useState(
    "Hi {{name}}, regarding your order #{{order_id}}: ",
  );
  const [bulkSmsBusy, setBulkSmsBusy] = useState(false);
  const [noteEditing, setNoteEditing] = useState<{ id: string; order_number: number; note: string } | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [assignTitle, setAssignTitle] = useState<string>("");
  const [assignDesc, setAssignDesc] = useState<string>("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; display_name: string }[]>([]);
  const [tsAssignOpen, setTsAssignOpen] = useState(false);
  const [tsAssignUserId, setTsAssignUserId] = useState<string>("");
  const [tsAssignBusy, setTsAssignBusy] = useState(false);
  const assignTelesales = useServerFn(importTelesalesCustomers);
  const listOrders = useServerFn(listOrdersPage);
  const getOrderCounts = useServerFn(getOrderCountsPage);
  const fetchOrderFlags = useServerFn(getOrderListFlags);
  const getFilterOptions = useServerFn(getOrderFilterOptions);
  const fetchSites = useServerFn(listIntegrationLabels);

  const fetchTagsMap = useServerFn(listAllTagsByPhone);
  const fetchDupes = useServerFn(getDuplicatePhones);
  const autoSms = useServerFn(sendOrderStatusSms);
  const bulkSms = useServerFn(sendBulkOrderSms);
  const sendToCourier = useServerFn(bulkSendToCourier);
  const [courierBusy, setCourierBusy] = useState<CourierProvider | null>(null);
  const [dupePhones, setDupePhones] = useState<Set<string>>(new Set());
  const [dupePhonesReady, setDupePhonesReady] = useState(!search.dup);
  const [blockedPhones, setBlockedPhones] = useState<Record<string, string>>({});
  const fetchBlockedPhones = useServerFn(checkBlockedPhones);
  const [blockingPhone, setBlockingPhone] = useState<string | null>(null);
  const [bulkBlockOpen, setBulkBlockOpen] = useState(false);
  const [bulkBlockReason, setBulkBlockReason] = useState("");
  const [bulkBlockBusy, setBulkBlockBusy] = useState(false);
  const blockOne = useServerFn(blockCustomer);

  useEffect(() => {
    if (!session) return;
    // Defer tag map fetch: only load when a tag filter is actually selected.
    (async () => {
      if (!search.dup) {
        setDupePhones(new Set());
        setDupePhonesReady(true);
        return;
      }
      setDupePhonesReady(false);
      try {
        const r = await fetchDupes();
        // Use normalized full phones so the orders query can use the phone_normalized index.
        setDupePhones(new Set(r.phonesNormalized?.length ? r.phonesNormalized : r.phones));
      } catch {/* ignore */}
      finally { setDupePhonesReady(true); }
    })();
    (async () => {
      try {
        const data = await getFilterOptions();
        setSources(data.sources as { id: string; name: string }[]);
        setCouriers(data.couriers as { id: string; name: string }[]);
        setAssignableUsers(((data.assignableUsers ?? []) as { id: string; display_name: string }[]).map((u) => ({ id: u.id, display_name: u.display_name })));
        setPartners(((data as any).partners ?? []) as string[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load order filters");
      }
    })();
    (async () => {
      try {
        const list = await fetchSites();
        setSites((list ?? []).map((s: any) => ({
          id: s.id as string,
          name: (s.name as string) || (s.site_url ? String(s.site_url).replace(/^https?:\/\//, "").replace(/\/+$/, "") : "Site"),
        })));
      } catch {/* ignore */}
    })();
  }, [session, search.dup, fetchDupes]);

  // Debounce search input — avoid refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch tag→phone map lazily, only when a tag filter is active (and once per tag).
  useEffect(() => {
    if (!session || tagFilter === "all") return;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchTagsMap({ data: { tag: tagFilter as CustomerTag } });
        if (!cancelled) setTagsByPhone(m);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [session, tagFilter, fetchTagsMap]);

  useEffect(() => {
    setStatusFilter(search.dup ? "all" : (search.status ?? "all"));
    setHasManualStatusSelection(false);
  }, [search.status, search.dup]);

  useEffect(() => {
    setSourceFilter(search.source ?? "all");
  }, [search.source]);

  useEffect(() => {
    setCourierFilter(search.courier ?? "all");
  }, [search.courier]);

  useEffect(() => {
    setSiteFilter(search.site ?? "all");
  }, [search.site]);

  useEffect(() => {
    setAdvanceOnly(Boolean(search.advanceOnly));
  }, [search.advanceOnly]);

  useEffect(() => {
    setPartnerFilter(((search as any).partner as string | undefined) ?? "all");
  }, [(search as any).partner]);

  useEffect(() => {
    setStaffFilter(((search as any).staff as string | undefined) ?? "all");
  }, [(search as any).staff]);

  // Compute normalized phones for active tag filter (mapped to orders.phone_normalized).
  // When the ?dup=1 search param is set, override the filter so only duplicate orders show.
  const tagPhoneFilter = useMemo<string[] | null>(() => {
    if (search.dup) return Array.from(dupePhones);
    if (tagFilter === "all") return null;
    return Object.entries(tagsByPhone)
      .filter(([, tags]) => tags.includes(tagFilter as CustomerTag))
      .map(([phone]) => phone);
  }, [tagFilter, tagsByPhone, search.dup, dupePhones]);

  const effectiveStatusFilter = useMemo(() => {
    if (!debouncedQ) return statusFilter;
    if (search.dup || search.status || hasManualStatusSelection) return statusFilter;
    return "all";
  }, [debouncedQ, hasManualStatusSelection, search.dup, search.status, statusFilter]);

  // Apply shared filters (source/courier/date/search/tag/advance) to any orders query builder.
  const applySharedFilters = (qb: ReturnType<typeof supabase.from> extends infer T ? any : any) => {
    if (sourceFilter !== "all") qb = qb.eq("order_source_id", sourceFilter);
    if (courierFilter !== "all") qb = qb.eq("courier_id", courierFilter);
    if (datePreset !== "all") {
      qb = qb.gte("created_at", dateRange.from.toISOString())
             .lte("created_at", dateRange.to.toISOString());
    }
    if (advanceOnly) qb = qb.gt("advance_amount", 0);
    const sRaw = debouncedQ;
    if (sRaw) {
      const s = toAsciiDigits(sRaw);
      const safe = s.replace(/[%,()]/g, "");
      const digits = s.replace(/\D/g, "");
      const normPhone = normalizeBDPhone(sRaw);
      const parts: string[] = [`customer_name.ilike.%${safe}%`];
      if (normPhone.length === 11 && normPhone.startsWith("01")) {
        const tail = normPhone.slice(-8);
        parts.push(`phone_normalized.eq.${normPhone}`);
        parts.push(`phone_normalized.ilike.%${tail}%`);
        parts.push(`customer_phone.ilike.%${tail}%`);
      } else if (digits.length >= 3) {
        const needle = digits.length >= 8 ? digits.slice(-8) : digits;
        parts.push(`customer_phone.ilike.%${needle}%`);
        parts.push(`phone_normalized.ilike.%${needle}%`);
        if (/^\d+$/.test(digits) && digits.length <= 9) {
          parts.push(`order_number.eq.${parseInt(digits, 10)}`);
        }
      } else {
        parts.push(`customer_phone.ilike.%${safe}%`);
      }
      qb = qb.or(parts.join(","));
    }
    if (tagPhoneFilter !== null) {
      if (tagPhoneFilter.length === 0) {
        qb = qb.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        qb = qb.in("phone_normalized", tagPhoneFilter);
      }
    }
    return qb;
  };

  const applyStatusFilter = (qb: any) => {
    if (effectiveStatusFilter === "web") return qb.eq("source", "woocommerce");
    if (effectiveStatusFilter === "web_pending" || effectiveStatusFilter === "pending_web") return qb.eq("status", "pending_web");
    if (effectiveStatusFilter === "facebook") return qb.eq("source", "facebook");
    if (effectiveStatusFilter === "preorder") return qb.eq("preorder", true);
    if (effectiveStatusFilter === "all") return qb;
    return qb.eq("status", effectiveStatusFilter);
  };

  // ============ Orders list query — always fetch the selected tab ============
  const fromIso = dateRange.from.toISOString();
  const toIso = dateRange.to.toISOString();
  const ordersQueryKey = useMemo(
    () => [
      "orders", "list",
      { status: effectiveStatusFilter, page, limit, source: sourceFilter, site: siteFilter, courier: courierFilter,
        partner: partnerFilter, staff: staffFilter,
        preset: datePreset, from: fromIso, to: toIso, q: debouncedQ, tagPhones: tagPhoneFilter,
        advanceOnly },
    ],
    [effectiveStatusFilter, page, limit, sourceFilter, siteFilter, courierFilter, partnerFilter, staffFilter, datePreset, fromIso, toIso, debouncedQ, tagPhoneFilter, advanceOnly],
  );

  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    enabled: !!session && (!search.dup || dupePhonesReady),
    staleTime: ORDER_LIST_STALE_MS,
    gcTime: ORDER_LIST_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
    retry: transientOrderLoadRetry,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    queryFn: async () => {
      return await listOrders({ data: {
        status: effectiveStatusFilter, page, limit,
        source: sourceFilter, site: siteFilter, courier: courierFilter,
        partner: partnerFilter, staff: staffFilter,
        from: datePreset === "all" ? null : fromIso,
        to: datePreset === "all" ? null : toIso,
        q: debouncedQ,
        tagPhones: tagPhoneFilter,
        advanceOnly,
      } });
    },
  });

  const selectOrderTab = (status: string) => {
    setStatusFilter(status);
    setHasManualStatusSelection(true);
    setTabsOpen(false);
    navigate({ to: "/orders", search: (prev: { status?: string; page?: number; limit?: number }) => ({ ...prev, status, page: 1 }) });
  };

  // Warm the cache for a tab on hover/mousedown so click feels instant.
  const prefetchOrderTab = (status: string) => {
    if (!session) return;
    const key = [
      "orders", "list",
      { status, page: 1, limit, source: sourceFilter, site: siteFilter, courier: courierFilter,
        partner: partnerFilter, staff: staffFilter,
        preset: datePreset, from: fromIso, to: toIso, q: debouncedQ, tagPhones: tagPhoneFilter,
        advanceOnly },
    ];
    queryClient.prefetchQuery({
      queryKey: key,
      staleTime: ORDER_LIST_STALE_MS,
      queryFn: async () => listOrders({ data: {
        status, page: 1, limit,
        source: sourceFilter, site: siteFilter, courier: courierFilter,
        partner: partnerFilter, staff: staffFilter,
        from: datePreset === "all" ? null : fromIso,
        to: datePreset === "all" ? null : toIso,
        q: debouncedQ,
        tagPhones: tagPhoneFilter,
        advanceOnly,
      } }),
    }).catch(() => {});
  };

  const rows: Order[] = ordersQuery.data?.rows ?? [];
  const totalCount = ordersQuery.data?.totalCount ?? 0;
  const serverPage = ordersQuery.data?.currentPage ?? page;
  const loading = ordersQuery.isPending;
  const refreshing = ordersQuery.isFetching && !ordersQuery.isPending;
  const listTimedOut = Boolean((ordersQuery.data as { timedOut?: boolean } | undefined)?.timedOut);
  const listLoadFailed = ordersQuery.isError && !ordersQuery.data;

  useEffect(() => {
    if (!session || loading) return;
    if (page !== serverPage) {
      navigate({
        to: "/orders",
        replace: true,
        search: (prev: { status?: string; page?: number; limit?: number }) => ({
          ...prev,
          page: serverPage,
        }),
      });
    }
  }, [session, loading, page, serverPage, navigate]);

  useEffect(() => {
    if (ordersQuery.error) toast.error((ordersQuery.error as Error).message);
  }, [ordersQuery.error]);

  // Background-warm the other primary tabs after the first paint so clicking
  // them feels instant. Runs once per filter-set; respects the same stale window.
  const warmedFiltersRef = useRef<string>("");
  useEffect(() => {
    if (!session || ordersQuery.isPending || !ordersQuery.data) return;
    const sig = JSON.stringify({ sourceFilter, siteFilter, courierFilter, partnerFilter, staffFilter, datePreset, fromIso, toIso, debouncedQ, tagPhoneFilter, advanceOnly });
    if (warmedFiltersRef.current === sig) return;
    warmedFiltersRef.current = sig;
    const idle = (cb: () => void) =>
      typeof (window as any).requestIdleCallback === "function"
        ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : window.setTimeout(cb, 250);
    const warmTimers: number[] = [];
    idle(() => {
      const warmKeys = ["pending", "ready_order", "processing", "ready_to_ship", "shipped", "no_response", "hold"]
        .filter((k) => k !== effectiveStatusFilter);
      warmKeys.forEach((k, index) => {
        warmTimers.push(window.setTimeout(() => prefetchOrderTab(k), 900 * (index + 1)));
      });
    });
    return () => warmTimers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ordersQuery.isPending, ordersQuery.data, sourceFilter, siteFilter, courierFilter, partnerFilter, staffFilter, datePreset, fromIso, toIso, debouncedQ, tagPhoneFilter, advanceOnly]);

  // Blocked phone lookup — only for visible page (~10 phones).
  // Key on a stable join of phones so realtime refreshes of the same page don't refetch.
  const visiblePhonesKey = useMemo(
    () => Array.from(new Set(rows.map((o) => o.customer_phone).filter(Boolean) as string[])).sort().join("|"),
    [rows],
  );
  useEffect(() => {
    if (!visiblePhonesKey) { setBlockedPhones({}); return; }
    const phones = visiblePhonesKey.split("|");
    let cancelled = false;
    (async () => {
      try {
        const bmap = await fetchBlockedPhones({ data: { phones } });
        if (cancelled) return;
        setBlockedPhones(bmap);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePhonesKey]);

  // Fetch customer flags (VIP/repeat/duplicate/returned) for the visible page in
  // a separate request so the main orders list renders instantly. Once flags
  // arrive, merge them into the cached rows so badges appear without a refetch.
  const visibleFlagKey = useMemo(() => {
    if (!rows.length) return "";
    return rows.map((r) => `${r.id}:${r.customer_phone ?? ""}:${r.customer_email ?? ""}:${r.status ?? ""}`).join("|");
  }, [rows]);
  useEffect(() => {
    if (!visibleFlagKey || !session) return;
    if (rows.every((r) => r.customer_flags)) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = rows.map((r) => ({
          id: r.id,
          phone: r.customer_phone ?? null,
          email: r.customer_email ?? null,
          status: r.status ?? null,
        }));
        const flagMap = await fetchOrderFlags({ data: { orders: payload } }) as Record<string, NonNullable<Order["customer_flags"]>>;
        if (cancelled) return;
        queryClient.setQueryData(ordersQueryKey, (prev: any) => {
          if (!prev || !Array.isArray(prev.rows)) return prev;
          return {
            ...prev,
            rows: prev.rows.map((r: Order) => ({
              ...r,
              customer_flags: flagMap[r.id] ?? r.customer_flags ?? { is_vip: false, is_repeat: false, is_duplicate: false, returned_count: 0 },
            })),
          };
        });
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFlagKey]);


  // ============ Tab counts query ============
  const countsQueryKey = useMemo(
    () => [
      "orders", "counts",
      { source: sourceFilter, site: siteFilter, courier: courierFilter, partner: partnerFilter, staff: staffFilter, preset: datePreset,
        from: fromIso, to: toIso, q: debouncedQ, tagPhones: tagPhoneFilter, advanceOnly },
    ],
    [sourceFilter, siteFilter, courierFilter, partnerFilter, staffFilter, datePreset, fromIso, toIso, debouncedQ, tagPhoneFilter, advanceOnly],
  );

  const countsQuery = useQuery({
    queryKey: countsQueryKey,
    enabled: !!session && (!search.dup || dupePhonesReady) && !ordersQuery.isPending,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: false,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    queryFn: async () => {
      return await getOrderCounts({ data: {
        source: sourceFilter, site: siteFilter, courier: courierFilter,
        partner: partnerFilter, staff: staffFilter,
        from: datePreset === "all" ? null : fromIso,
        to: datePreset === "all" ? null : toIso,
        q: debouncedQ,
        tagPhones: tagPhoneFilter,
        advanceOnly,
      } }) as { tabCountsData: TabCountsData | null; preorderDueCount: number; timedOut?: boolean; error?: string };
    },
  });

  const tabCountsData = countsQuery.data?.tabCountsData ?? null;
  const preorderDueCount = countsQuery.data?.preorderDueCount ?? 0;

  // Unified refetcher used by mutations + manual refresh buttons.
  const refetchAll = async (showToast = false) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["orders", "counts"] }),
    ]);
    // Notify topbar widgets (e.g. Duplicates badge) to refresh immediately.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("orders:changed"));
    }
    if (showToast) toast.success("Orders refreshed");
  };

  // Back-compat alias so existing call sites stay terse.
  const load = (showToast = false) => { void refetchAll(showToast); };

  // Clear selection when filters/page change to avoid cross-page partial bulks.
  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, page, sourceFilter, siteFilter, courierFilter, datePreset, debouncedQ, tagFilter, advanceOnly]);

  // Realtime — keep high-volume order imports from causing constant refetch loops.
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("orders-list-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const order = payload.new as { order_number?: number; source?: string };
          toast.success(
            order.source === "woocommerce"
              ? `WooCommerce order #${order.order_number ?? ""} synced`
              : `Order #${order.order_number ?? ""} created`,
          );
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void refetchAll(); }, 4000);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);


  const matchesTab = (r: Order, tab: string) => {
    if (tab === "all") return true;
    if (tab === "web") return r.source === "woocommerce";
    if (tab === "web_pending" || tab === "pending_web") return (r.status as string) === "pending_web";
    if (tab === "facebook") return r.source === "facebook";
    if (tab === "partner") return r.source === "oms";
    if (tab === "preorder") return !!r.preorder;
    return r.status === tab;
  };

  // Server-side pagination: rows already contain only the current page.
  const paginated = rows;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * limit;

  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(p, totalPages));
    navigate({ to: "/orders", search: (prev: { status?: string; page?: number; limit?: number }) => ({ ...prev, page: next }) });
  };
  const setPageSize = (val: number) => {
    navigate({ to: "/orders", search: (prev: { status?: string; page?: number; limit?: number }) => ({ ...prev, limit: val, page: 1 }) });
  };

  // Tab counts/amounts derived from server RPC.
  const tabCounts = useMemo(() => {
    const out: Record<string, number> = {};
    const bs = tabCountsData?.byStatus ?? {};
    for (const tab of TAB_STATUSES) {
      if (tab.key === "all") out[tab.key] = tabCountsData?.all?.count ?? 0;
      else if (tab.key === "web") out[tab.key] = tabCountsData?.web?.count ?? 0;
      else if (tab.key === "facebook") out[tab.key] = tabCountsData?.facebook?.count ?? 0;
      else if (tab.key === "partner") out[tab.key] = tabCountsData?.partner?.count ?? 0;
      else if (tab.key === "preorder") out[tab.key] = tabCountsData?.preorder?.count ?? 0;
      else out[tab.key] = bs[tab.key]?.count ?? 0;
    }
    return out;
  }, [tabCountsData]);

  const tabAmounts = useMemo(() => {
    const out: Record<string, number> = {};
    const bs = tabCountsData?.byStatus ?? {};
    for (const tab of TAB_STATUSES) {
      if (tab.key === "all") out[tab.key] = Number(tabCountsData?.all?.amount ?? 0);
      else if (tab.key === "web") out[tab.key] = Number(tabCountsData?.web?.amount ?? 0);
      else if (tab.key === "facebook") out[tab.key] = Number(tabCountsData?.facebook?.amount ?? 0);
      else if (tab.key === "partner") out[tab.key] = Number(tabCountsData?.partner?.amount ?? 0);
      else if (tab.key === "preorder") out[tab.key] = Number(tabCountsData?.preorder?.amount ?? 0);
      else out[tab.key] = Number(bs[tab.key]?.amount ?? 0);
    }
    return out;
  }, [tabCountsData]);

  const fmtAmount = (n: number) => {
    if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
    return Math.round(n).toLocaleString("en-IN");
  };
  const countsPriming = !tabCountsData && !countsQuery.isError && (ordersQuery.isPending || countsQuery.isPending || countsQuery.isFetching || !countsQuery.data);
  const countsUnavailable = countsQuery.isError || (!countsPriming && !tabCountsData);
  const fmtTabAmount = (key: string) => countsUnavailable ? "৳ —" : `৳ ${fmtAmount(tabAmounts[key] ?? 0)}`;

  const todayISO = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const updatePreorderDate = async (id: string, date: string | null) => {
    const { error } = await supabase.from("orders").update({ preorder_date: date } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(date ? "Pre-order date set" : "Pre-order date cleared");
    load();
  };

  const exportFn = useServerFn(exportOrdersPage);
  const exportRows = async (kind: "csv" | "xlsx") => {
    const useSelection = selected.size > 0;
    if (!useSelection && totalCount === 0) return toast.error("Nothing to export");
    let res: { rows: any[] };
    try {
      const payload = useSelection
        ? { ids: Array.from(selected), status: "all" as string }
        : {
            status: effectiveStatusFilter,
            source: sourceFilter, site: siteFilter, courier: courierFilter,
            from: datePreset === "all" ? null : fromIso,
            to: datePreset === "all" ? null : toIso,
            q: debouncedQ,
            tagPhones: tagPhoneFilter,
            advanceOnly,
          };
      res = await exportFn({ data: payload as any });
    } catch (e: any) {
      return toast.error(e?.message ?? "Export failed");
    }
    const out = (res.rows ?? []).map((r: any) => ({
      "Order #": r.order_number,
      Date: new Date(r.created_at).toLocaleString(),
      Source: r.order_sources?.name ?? "",
      "Customer Name": r.customer_name,
      Phone: r.customer_phone,
      Address: r.customer_address,
      Products: (r.order_items ?? [])
        .map((it: any) => {
          const pname = it?.products?.name ?? "";
          const vlabel = it?.product_variants?.attributes
            ? Object.values(it.product_variants.attributes).filter(Boolean).join(" / ")
            : "";
          const vname = vlabel ? ` (${vlabel})` : "";
          const qty = it?.quantity ? ` x${it.quantity}` : "";
          return `${pname}${vname}${qty}`.trim();
        })
        .filter(Boolean)
        .join(", "),
      Status: (STATUS_LABEL as Record<string, string>)[r.status] ?? r.status,
      Subtotal: Number(r.subtotal).toFixed(2),
      Delivery: Number(r.delivery_charge).toFixed(2),
      Discount: Number(r.discount_amount).toFixed(2),
      Total: Number(r.total_amount).toFixed(2),
      "Consignment ID": r.consignment_id ?? "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "csv") downloadCsv(`orders-${stamp}.csv`, out);
    else downloadXlsx(`orders-${stamp}.xlsx`, out);
    toast.success(`Exported ${out.length.toLocaleString()} row(s)`);
  };

  const updateStatus = async (id: string, status: OrderStatus | "__preorder", prev: OrderStatus) => {

    // Soft guard: confirm transitions out of terminal statuses or into cancelled/fraud.

    const TERMINAL: OrderStatus[] = ["completed", "cancelled", "returned", "fraud"];

    const DESTRUCTIVE: OrderStatus[] = ["cancelled", "fraud", "returned"];

    if (status !== "__preorder" && prev !== status) {

      if (TERMINAL.includes(prev) && !TERMINAL.includes(status as OrderStatus)) {

        if (!confirm(`This order is already ${STATUS_LABEL[prev]}. Move it back to ${STATUS_LABEL[status as OrderStatus]}? Stock will be re-deducted if applicable.`)) return;

      } else if (DESTRUCTIVE.includes(status as OrderStatus) && !TERMINAL.includes(prev)) {

        if (!confirm(`Mark this order as ${STATUS_LABEL[status as OrderStatus]}? Stock will be restored.`)) return;

      }

    } 


    const patch: { status?: OrderStatus; preorder?: boolean } =
      status === "__preorder"
        ? { preorder: true }
        : { status: status as OrderStatus, preorder: false };
    const { error } = await supabase.from("orders").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Order updated");
    if (status !== "__preorder" && prev !== status) {
      const kind = status === "completed" ? "confirmed" : status === "shipped" ? "shipped" : null;
      if (kind) {
        autoSms({ data: { order_id: id, kind } })
          .then((r) => { if (r?.ok) toast.success(`SMS sent (${kind})`); })
          .catch(() => { /* logged server-side */ });
      }
    }
    load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this order? This cannot be undone.")) return;
    // delete items first (no cascade configured)
    await supabase.from("order_items").delete().eq("order_id", id);
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Order deleted");
    load();
  };

  // Current-page IDs — select-all targets only visible rows (acceptable with server pagination).
  const filteredIds = useMemo<string[]>(() => rows.map((r) => r.id), [rows]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id: string) => selected.has(id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id: string) => next.delete(id));
      else filteredIds.forEach((id: string) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selected.size === 0) return;
    const DESTRUCTIVE: OrderStatus[] = ["cancelled", "fraud", "returned"];
    if (DESTRUCTIVE.includes(bulkStatus as OrderStatus)) {
      if (!confirm(`Mark ${selected.size} order(s) as ${STATUS_LABEL[bulkStatus as OrderStatus]}? Stock will be restored for active ones.`)) return;
    }
    setBulkBusy(true);
    const { error } = await supabase.rpc("bulk_update_order_status", {
      p_ids: Array.from(selected),
      p_status: bulkStatus as OrderStatus,
    });
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${selected.size} order(s) updated`);
    setSelected(new Set());
    setBulkStatus("");
    load();
  };

  const bulkPrint = (type: "invoice" | "sticker") => {
    if (selected.size === 0) return;
    const ids = Array.from(selected).join(",");
    window.open(`/orders/bulk-print?ids=${ids}&type=${type}`, "_blank");
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected order(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { error: itemsErr } = await supabase.from("order_items").delete().in("order_id", ids);
    if (itemsErr) { setBulkBusy(false); return toast.error(itemsErr.message); }
    const { error } = await supabase.from("orders").delete().in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} order(s) deleted`);
    setSelected(new Set());
    load();
  };

  const submitBulkBlock = async () => {
    const reason = bulkBlockReason.trim();
    if (!reason) return toast.error("Reason is required");
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const selectedOrders = rows.filter((r) => ids.includes(r.id));
    const phones = Array.from(
      new Set(
        selectedOrders
          .map((o) => o.customer_phone?.trim())
          .filter((p): p is string => !!p),
      ),
    );
    if (phones.length === 0) return toast.error("No phone numbers in selection");
    setBulkBlockBusy(true);
    let ok = 0;
    let failed = 0;
    for (const phone of phones) {
      try {
        await blockOne({ data: { phone, reason } });
        ok++;
      } catch {
        failed++;
      }
    }
    setBulkBlockBusy(false);
    setBulkBlockOpen(false);
    setBulkBlockReason("");
    if (ok > 0) toast.success(`Blocked ${ok} customer(s)${failed ? ` (${failed} failed)` : ""}`);
    else toast.error("Failed to block customers");
    // refresh blocked-phone map so the row badges appear immediately
    try {
      const allPhones = Array.from(new Set(rows.map((o) => o.customer_phone).filter(Boolean) as string[]));
      const map = await fetchBlockedPhones({ data: { phones: allPhones } });
      setBlockedPhones(map);
    } catch { /* non-fatal */ }
  };

  const submitBulkSms = async () => {
    if (selected.size === 0 || !bulkSmsMessage.trim()) return;
    setBulkSmsBusy(true);
    try {
      const r = await bulkSms({ data: { order_ids: Array.from(selected), message: bulkSmsMessage.trim() } });
      toast.success(`Sent ${r.sent} / ${r.total}${r.failed ? ` (${r.failed} failed)` : ""}`);
      setBulkSmsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBulkSmsBusy(false); }
  };

  const PROVIDER_LABEL: Record<CourierProvider, string> = {
    steadfast: "Steadfast",
    pathao: "Pathao",
    redx: "RedX",
  };

  const submitBulkCourier = async (provider: CourierProvider) => {
    if (selected.size === 0) return;
    setCourierBusy(provider);
    try {
      const r = await sendToCourier({ data: { order_ids: Array.from(selected), provider } });
      const msg = `${r.sent}/${r.total} sent via ${PROVIDER_LABEL[provider]}${r.failed ? ` (${r.failed} failed)` : ""}`;
      if (r.failed === 0) toast.success(msg);
      else toast.warning(msg);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send to courier");
    } finally {
      setCourierBusy(null);
    }
  };

  const submitAssignTasks = async () => {
    if (!assignUserId || selected.size === 0) return;
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes.user?.id;
    if (!me) return toast.error("Not signed in");
    setAssignBusy(true);
    const ids = Array.from(selected);
    const selectedOrders = rows.filter((r) => ids.includes(r.id));
    const baseDesc = assignDesc.trim();
    const customTitle = assignTitle.trim();
    const payload = selectedOrders.map((o) => ({
      assigned_to: assignUserId,
      assigned_by: me,
      title: customTitle || `Order #${o.order_number} — ${o.customer_name}`,
      description: [baseDesc, `Order: /orders?orderId=${o.id}`].filter(Boolean).join("\n\n"),
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      customer_source: "order" as const,
      status: "pending" as const,
    }));
    const { error } = await supabase.from("tasks").insert(payload);
    setAssignBusy(false);
    if (error) return toast.error(error.message);
    const userName = assignableUsers.find((u) => u.id === assignUserId)?.display_name ?? "user";
    toast.success(`Assigned ${payload.length} task(s) to ${userName}`);
    setAssignOpen(false);
    setAssignUserId("");
    setAssignTitle("");
    setAssignDesc("");
    setSelected(new Set());
  };

  const submitAssignTelesales = async () => {
    if (!tsAssignUserId || selected.size === 0) return;
    const ids = Array.from(selected);
    const selectedOrders = rows.filter((r) => ids.includes(r.id));
    const payloadRows = selectedOrders
      .filter((o) => !!o.customer_phone?.trim())
      .map((o) => ({
        name: o.customer_name || null,
        phone: o.customer_phone,
        address: o.customer_address || null,
      }));
    if (payloadRows.length === 0) {
      toast.error("No valid phone numbers in selection");
      return;
    }
    setTsAssignBusy(true);
    try {
      const res = await assignTelesales({ data: { rows: payloadRows, assignedTo: tsAssignUserId } });
      const userName = assignableUsers.find((u) => u.id === tsAssignUserId)?.display_name ?? "user";
      toast.success(
        `Telesales: ${res.assignmentsCreated} new, ${res.assignmentsUpdated} reassigned to ${userName}`,
      );
      setTsAssignOpen(false);
      setTsAssignUserId("");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign telesales");
    } finally {
      setTsAssignBusy(false);
    }
  };

  const saveNote = async () => {
    if (!noteEditing) return;
    setNoteBusy(true);
    const trimmed = noteEditing.note.trim();
    const { error } = await supabase
      .from("orders")
      .update({ internal_note: trimmed.length ? trimmed : null })
      .eq("id", noteEditing.id);
    setNoteBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Note saved");
    setNoteEditing(null);
    // Optimistically update cached row so UI reflects without waiting for realtime
    const noteVal = trimmed.length ? trimmed : null;
    queryClient.setQueriesData<{ rows: Order[]; totalCount: number }>(
      { queryKey: ["orders", "list"] },
      (prev) => prev ? { ...prev, rows: prev.rows.map((r) => r.id === noteEditing.id ? { ...r, internal_note: noteVal } : r) } : prev,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">Track and manage customer orders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncWebOrdersButton onDone={() => load(true)} />
          <SyncCourierStatusButton onDone={() => load(true)} />
          <Button variant="outline" onClick={() => load(true)} disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import Orders
          </Button>
          <Button asChild>
            <Link to="/orders/new">
              <Plus className="h-4 w-4" />
              New Order
            </Link>
          </Button>
        </div>
      </div>
      {importOpen && (
        <Suspense fallback={null}>
          <ImportOrdersDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => load(true)} />
        </Suspense>
      )}

      <Card>
        <CardHeader className="px-2 pb-3 space-y-3 sm:px-6">
          <div className="grid min-w-0 grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
            <div className="col-span-2 flex min-w-0 items-center gap-1 sm:flex-1 sm:min-w-[200px] sm:gap-1.5">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search name, phone, #…"
                aria-label="Search name, phone, order #, ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:max-w-sm sm:px-3 sm:text-sm"
              />
            </div>

            <Select value={sourceFilter} onValueChange={(value) => { setSourceFilter(value); goToPage(1); }}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-40 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {sites.length > 0 && (
              <Select value={siteFilter} onValueChange={(value) => { setSiteFilter(value); goToPage(1); }}>
                <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-40 sm:shrink-0 sm:px-3 sm:text-sm">
                  <SelectValue placeholder="Website" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All websites</SelectItem>
                  {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={courierFilter} onValueChange={(value) => { setCourierFilter(value); goToPage(1); }}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-36 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="Courier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All couriers</SelectItem>
                {couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={partnerFilter} onValueChange={(value) => { setPartnerFilter(value); goToPage(1); }}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-36 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="OMS Partner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                {partners.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={staffFilter} onValueChange={(value) => { setStaffFilter(value); goToPage(1); }}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-36 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={(value) => { setTagFilter(value); goToPage(1); }}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-36 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {CUSTOMER_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>{TAG_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label
              className={`flex items-center gap-1.5 h-8 px-2 rounded-md border text-[11px] cursor-pointer select-none sm:h-9 sm:px-3 sm:text-sm whitespace-nowrap transition-colors ${
                advanceOnly
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              <Checkbox
                checked={advanceOnly}
                onCheckedChange={(v) => { setAdvanceOnly(v === true); goToPage(1); }}
                className="h-3.5 w-3.5"
              />
              <span>💰 Advance only</span>
            </label>
            <Select
              value={datePreset}
              onValueChange={(val: string) => {
                if (val === "custom") {
                  setTempFrom(dateRange.from);
                  setTempTo(dateRange.to);
                  // Defer until Select's portal close + focus restore finishes,
                  // otherwise the Popover closes the moment it opens.
                  setTimeout(() => setCustomOpen(true), 80);
                } else {
                  setDateRange(presetRange(val as PresetKey));
                  setDatePreset(val as PresetKey);
                  goToPage(1);
                }
              }}
            >
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-40 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue placeholder="Select Date" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABELS) as PresetKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{PRESET_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={customOpen} onOpenChange={setCustomOpen} modal>
              <PopoverTrigger asChild>
                <span
                  aria-hidden
                  className="pointer-events-none fixed top-1/2 left-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 opacity-0"
                />
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
                    <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      disabled={!tempFrom || !tempTo}
                      onClick={() => {
                        if (!tempFrom || !tempTo) return;
                        const f = tempFrom <= tempTo ? tempFrom : tempTo;
                        const t = tempFrom <= tempTo ? tempTo : tempFrom;
                        setDateRange({ from: startOfDay(f), to: endOfDay(t) });
                        setDatePreset("custom");
                        goToPage(1);
                        setCustomOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Select value={String(limit)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 min-w-0 w-full px-2 text-[11px] sm:h-9 sm:w-24 sm:shrink-0 sm:px-3 sm:text-sm">
                <SelectValue>
                  <span className="sm:hidden">{limit}</span>
                  <span className="hidden sm:inline">{limit} / page</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 min-w-0 w-full gap-1 px-2 text-[11px] sm:h-9 sm:w-auto sm:shrink-0 sm:gap-2 sm:px-3 sm:text-sm">
                  <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{selected.size > 0 ? `Export selected (${selected.size.toLocaleString()})` : `Export filtered (${totalCount.toLocaleString()})`}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportRows("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRows("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-2">
            {/* Mobile collapsed bar — shows active tab + chevron toggle */}
            <div className="flex sm:hidden items-center justify-between gap-2">
              {(() => {
                const activeTab = [...PRIMARY_TABS, ...PIPELINE_TABS].find((t) => t.key === effectiveStatusFilter);
                const c = activeTab ? TAB_COLOR_CLASSES[activeTab.color] : null;
                return (
                  <div className={`flex-1 min-w-0 flex flex-col items-center rounded-md border-2 px-2 py-1 ${c?.border ?? "border-border"} ${c?.activeBg ?? ""} ${c?.activeText ?? ""}`}>
                    <span className="text-[10px] font-medium truncate w-full text-center">{activeTab?.label ?? "Select"}</span>
                    {activeTab && (
                      <>
                        <span className="text-sm font-bold tabular-nums leading-tight"><TickingNumber priming={countsPriming} target={tabCounts[activeTab.key] ?? 0} unavailable={countsUnavailable} /></span>
                        <span className="text-[10px] font-semibold tabular-nums leading-tight">{fmtTabAmount(activeTab.key)}</span>
                      </>
                    )}
                  </div>
                );
              })()}
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0"
                onClick={() => setTabsOpen((v) => !v)}
                aria-label={tabsOpen ? "Hide tabs" : "Show tabs"}
                aria-expanded={tabsOpen}
                aria-controls="order-tabs-panel"
              >
                {tabsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
            <div
              id="order-tabs-panel"
              role="group"
              aria-label="Order status tabs"
              onKeyDown={(e) => {
                const key = e.key;
                if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End" && key !== "Escape") return;
                if (key === "Escape") {
                  setTabsOpen(false);
                  e.currentTarget.querySelector<HTMLElement>("[data-tab-key]")?.blur();
                  return;
                }
                const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-tab-key]"));
                if (!tabs.length) return;
                const currentIdx = tabs.findIndex((el) => el === document.activeElement);
                let next = currentIdx;
                if (key === "ArrowRight") next = currentIdx < 0 ? 0 : (currentIdx + 1) % tabs.length;
                else if (key === "ArrowLeft") next = currentIdx < 0 ? tabs.length - 1 : (currentIdx - 1 + tabs.length) % tabs.length;
                else if (key === "Home") next = 0;
                else if (key === "End") next = tabs.length - 1;
                e.preventDefault();
                tabs[next]?.focus();
              }}
            >
            {/* Row 1 — triage / sources */}
            <div className={`${tabsOpen ? "grid" : "hidden"} sm:grid grid-cols-[repeat(auto-fit,minmax(78px,1fr))] gap-1.5`}>
              {PRIMARY_TABS.map((tab) => {
                const c = TAB_COLOR_CLASSES[tab.color];
                const active = effectiveStatusFilter === tab.key;
                const isPreorderAlert = tab.key === "preorder" && preorderDueCount > 0;
                const baseTile = "flex flex-col items-center justify-center rounded-md border-2 px-1.5 py-1 w-full min-w-0 transition-colors cursor-pointer select-none";
                const cls = isPreorderAlert
                  ? `${baseTile} border-red-500 hover:bg-red-500/15 ${active ? "bg-red-500/25 text-red-50" : "bg-red-500/10 text-red-100"} animate-pulse`
                  : `${baseTile} ${c.border} ${c.hover} ${active ? `${c.activeBg} ${c.activeText}` : ""}`;
                // Incomplete tab now filters inline (no separate route).
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectOrderTab(tab.key)}
                    onMouseEnter={() => prefetchOrderTab(tab.key)}
                    onTouchStart={() => prefetchOrderTab(tab.key)}
                    className={cls}
                    data-tab-key={tab.key}
                    aria-pressed={active}
                  >
                    <span className="text-[10px] font-medium truncate w-full text-center leading-tight">{tab.label}</span>
                    <span className="text-sm font-bold tabular-nums leading-tight"><TickingNumber priming={countsPriming} target={tabCounts[tab.key] ?? 0} unavailable={countsUnavailable} /></span>
                    <span className="text-[10px] font-semibold tabular-nums leading-tight">{fmtTabAmount(tab.key)}</span>
                  </button>
                );
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectOrderTab(tab.key)}
                    className={cls}
                    title={isPreorderAlert ? `${preorderDueCount} pre-order(s) due today or overdue` : undefined}
                    data-tab-key={tab.key}
                    aria-pressed={active}
                  >
                    <span className="text-[10px] font-medium truncate w-full text-center leading-tight">{tab.label}</span>
                    <span className="text-sm font-bold tabular-nums leading-tight"><TickingNumber priming={countsPriming} target={tabCounts[tab.key] ?? 0} unavailable={countsUnavailable} /></span>
                    <span className="text-[10px] font-semibold tabular-nums leading-tight">{fmtTabAmount(tab.key)}</span>
                  </button>
                );
              })}
            </div>
            {/* Row 2 — fulfillment pipeline (emphasized) */}
            <div className={`${tabsOpen ? "grid" : "hidden"} sm:grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-1.5 pt-1`}>
              {PIPELINE_TABS.map((tab) => {
                const c = TAB_COLOR_CLASSES[tab.color];
                const active = effectiveStatusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectOrderTab(tab.key)}
                    onMouseEnter={() => prefetchOrderTab(tab.key)}
                    onTouchStart={() => prefetchOrderTab(tab.key)}
                    className={`flex flex-col items-center justify-center rounded-md border-2 px-1.5 py-1 w-full min-w-0 shadow-sm transition-colors cursor-pointer select-none ${c.border} ${c.hover} ${active ? `${c.activeBg} ${c.activeText} shadow-md` : ""}`}
                    data-tab-key={tab.key}
                    aria-pressed={active}
                  >
                    <span className="text-[10px] font-semibold truncate w-full text-center leading-tight">{tab.label}</span>
                    <span className="text-sm font-bold tabular-nums leading-tight"><TickingNumber priming={countsPriming} target={tabCounts[tab.key] ?? 0} unavailable={countsUnavailable} /></span>
                    <span className="text-[10px] font-semibold tabular-nums leading-tight">{fmtTabAmount(tab.key)}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        </CardHeader>
        {selected.size > 0 && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 border-y bg-green-600 text-white shadow-sm animate-in slide-in-from-top-2 [&_button]:h-7 [&_button]:px-2 [&_button]:text-[11px] sm:[&_button]:h-8 sm:[&_button]:px-3 sm:[&_button]:text-xs">
            <span className="text-[11px] sm:text-sm font-medium">{selected.size} selected</span>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-32 sm:w-44 h-7 sm:h-8 text-[11px] sm:text-xs text-foreground"><SelectValue placeholder="Set status…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={applyBulkStatus} disabled={!bulkStatus || bulkBusy}>Apply</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-foreground">
                  <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Bulk Print</span><span className="sm:hidden">Print</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => bulkPrint("invoice")}>Bulk Print Invoices</DropdownMenuItem>
                <DropdownMenuItem onClick={() => bulkPrint("sticker")}>Bulk Print Stickers</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" className="text-foreground" onClick={() => setBulkSmsOpen(true)}>
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> SMS
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-foreground">
                  <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Assign to</span><span className="sm:hidden">Assign</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAssignOpen(true)}>Create Task(s)</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTsAssignOpen(true)}
                  disabled={!isAdmin}
                >
                  Assign to Telesales{!isAdmin ? " (admin only)" : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-foreground" disabled={!!courierBusy}>
                  {courierBusy ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  <span className="hidden sm:inline">Send to Courier</span><span className="sm:hidden">Courier</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Choose courier</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COURIER_PROVIDERS.map((p) => (
                  <DropdownMenuItem
                    key={p}
                    disabled={!!courierBusy}
                    onClick={() => submitBulkCourier(p)}
                  >
                    {PROVIDER_LABEL[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="destructive" onClick={() => setBulkBlockOpen(true)} disabled={bulkBlockBusy}>
              <ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Block</span><span className="sm:hidden">Block</span>
            </Button>
            {isAdmin && (
              <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={bulkBusy}>
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Bulk Delete</span><span className="sm:hidden">Del</span>
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-white hover:bg-green-700" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
        <CardContent className="p-0">
          <div className="flex items-center gap-3 px-4 py-2.5 border-t border-b bg-muted/30 text-xs">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </span>
            <span className="ml-auto text-muted-foreground hidden sm:inline">
              {loading ? "Loading orders…" : `${totalCount} order${totalCount === 1 ? "" : "s"}${refreshing ? " · refreshing" : ""}`}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : listTimedOut ? (
            <div className="p-12 text-center text-muted-foreground">This filter is taking too long. Try search/date filters or refresh.</div>
          ) : listLoadFailed ? (
            <div className="p-12 text-center text-muted-foreground">Orders could not load. Please refresh.</div>
          ) : totalCount === 0 && countsPriming ? (
            <div className="p-12 text-center text-muted-foreground">Loading orders…</div>
          ) : totalCount === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No orders found.</div>
          ) : (
            <div className="p-3 sm:p-4 space-y-3 bg-muted/20">
              {paginated.map((r) => {
                const norm = normalizePhoneClient(r.customer_phone || "");
                const sourceLabel = r.order_sources?.name ?? r.source ?? null;
                const srcKey = String(r.source ?? "").toLowerCase();
                const isOmsOrder = srcKey === "oms";
                const isWebOrder = srcKey === "woocommerce" || srcKey === "web" || srcKey === "facebook";
                const siteSuffix = r.site_name ? ` • ${r.site_name}` : "";
                const partnerSuffix = r.oms_sender_order_no ? ` #${r.oms_sender_order_no}` : "";
                const sourceBadgeLabel = isOmsOrder
                  ? `Partner • ${r.oms_sender_name ?? "Unknown"}${partnerSuffix}`
                  : r.site_name
                  ? `Website • ${r.site_name}`
                  : srcKey === "facebook"
                    ? "Facebook"
                    : srcKey === "woocommerce" || srcKey === "web"
                      ? "Website"
                      : sourceLabel ?? "Manual";
                const sourceBadgeTone = isOmsOrder
                  ? "bg-fuchsia-600 text-white border-fuchsia-500/40"
                  : "bg-primary text-primary-foreground border-primary/40";
                // Prefer the actual website name over a generic "woocommerce" label.
                const webSourceLabel = srcKey === "woocommerce" && r.site_name ? r.site_name : sourceLabel;
                const creatorLabel: string = isOmsOrder
                  ? `From ${r.oms_sender_name ?? "Partner OMS"}${partnerSuffix}`
                  : (r.creator?.full_name || r.creator?.email)
                  ? (r.creator?.full_name || r.creator?.email) as string
                  : (isWebOrder ? `Web Order${webSourceLabel ? ` (${webSourceLabel})` : ""}${srcKey !== "woocommerce" ? siteSuffix : ""}` : "—");
                const isDispatchStatus = r.status === "shipped" || r.status === "ready_to_ship";
                const courierFailed = isDispatchStatus && !r.consignment_id;
                const isDuplicate = Boolean(r.customer_flags?.is_duplicate);
                const editorLabel = !isWebOrder && r.updated_by && r.updated_by !== r.created_by
                  ? (r.editor?.full_name || r.editor?.email || null)
                  : null;
                const flags = {
                  isSelected: selected.has(r.id),
                  isAdmin,
                  isVip: Boolean(r.customer_flags?.is_vip),
                  isDuplicate,
                  isRepeat: Boolean(r.customer_flags?.is_repeat),
                  isDispatchStatus,
                  courierFailed,
                  creatorLabel,
                  editorLabel,
                };
                const actions = {
                  toggleOne,
                  onView: () => setViewing(r),
                  onEdit: () => setEditing({
                    id: r.id,
                    order_number: r.order_number,
                    customer_name: r.customer_name,
                    customer_phone: r.customer_phone,
                    customer_address: r.customer_address,
                    delivery_charge: r.delivery_charge,
                    discount_amount: r.discount_amount,
                    advance_amount: r.advance_amount,
                    advance_source_id: r.advance_source_id,
                    advance_txn_id: r.advance_txn_id,
                    invoice_note: r.invoice_note,
                    internal_note: r.internal_note,
                    status: r.status,
                    preorder: r.preorder,
                    preorder_date: r.preorder_date,
                    customer_type: r.customer_type ?? "retail",
                  }),
                  onSetProfilePhone: setProfilePhone,
                  onEditNote: setNoteEditing,
                  onDelete,
                  onUpdateStatus: (id: string, next: OrderStatus | "__preorder", prev: OrderStatus) => updateStatus(id, next, prev),
                };
                const props = { order: r, flags, actions };
                const blockReason = norm ? blockedPhones[norm] : undefined;
                const returnCount = !blockReason ? Number(r.customer_flags?.returned_count ?? 0) : 0;
                const isReturnCustomer = returnCount > 0 || r.status === "returned";
                const ringClass = blockReason || isReturnCustomer || isDuplicate
                  ? "rounded-md ring-2 ring-red-500/60"
                  : undefined;
                return (
                  <div key={r.id} className={ringClass}>
                    {blockReason && (
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-t-md bg-red-600/15 border border-red-600/40 text-red-700 dark:text-red-300 text-xs font-semibold"
                        title={blockReason}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>⛔ BLOCKED</span>
                        <span className="font-normal opacity-90 truncate">— {blockReason}</span>
                      </div>
                    )}
                    {!blockReason && isReturnCustomer && (
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-t-md bg-red-600/15 border border-red-600/40 text-red-700 dark:text-red-300 text-xs font-semibold"
                        title={`This customer has ${returnCount} previously returned order(s)`}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>↩ RETURN CUSTOMER</span>
                        <span className="font-normal opacity-90">— {returnCount} returned order{returnCount > 1 ? "s" : ""} in the past</span>
                      </div>
                    )}
                    {!blockReason && !isReturnCustomer && isDuplicate && (
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-t-md bg-red-600/15 border border-red-600/40 text-red-700 dark:text-red-300 text-xs font-semibold"
                        title="This customer has another active order in the system"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>⚠ DUPLICATE ORDER</span>
                      </div>
                    )}
                    <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-t-md border border-b-0 ${sourceBadgeTone}`}>
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        📦 {sourceBadgeLabel}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider opacity-90 truncate max-w-[50%]">
                        👤 {creatorLabel}
                      </span>
                    </div>
                    <div className="hidden md:block">{desktopTemplate.render(props)}</div>
                    <div className="md:hidden">{mobileTemplate.render(props)}</div>
                    {statusFilter === "preorder" && (
                      <PreorderDateInline
                        date={r.preorder_date}
                        todayISO={todayISO}
                        onChange={(d) => updatePreorderDate(r.id, d)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(startIndex + limit, totalCount)} of {totalCount} orders
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (totalPages <= 7) return true;
                    if (p === 1 || p === totalPages) return true;
                    if (p >= safePage - 1 && p <= safePage + 1) return true;
                    return false;
                  })
                  .map((p, idx, arr) => {
                    const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                    return (
                      <Fragment key={p}>
                        {showEllipsis && (
                          <span className="px-2 text-sm text-muted-foreground">…</span>
                        )}
                        <Button
                          variant={safePage === p ? "default" : "outline"}
                          size="sm"
                          className="min-w-[2.25rem]"
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </Button>
                      </Fragment>
                    );
                  })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {viewing && (
        <Suspense fallback={null}>
          <OrderDetailDialog order={viewing} onClose={() => setViewing(null)} onEdit={() => setEditing({
        id: viewing.id,
        order_number: viewing.order_number,
        customer_name: viewing.customer_name,
        customer_phone: viewing.customer_phone,
        customer_address: viewing.customer_address,
        delivery_charge: viewing.delivery_charge,
        discount_amount: viewing.discount_amount,
        advance_amount: viewing.advance_amount,
        advance_source_id: viewing.advance_source_id,
        advance_txn_id: viewing.advance_txn_id,
        invoice_note: viewing.invoice_note,
        internal_note: viewing.internal_note,
        status: viewing.status,
          })} />
        </Suspense>
      )}
      {editing && (
        <Suspense fallback={null}>
          <EditOrderDialog order={editing} onClose={() => setEditing(null)} onSaved={load} />
        </Suspense>
      )}
      {profilePhone && (
        <Suspense fallback={null}>
          <CustomerProfileDialog
            phone={profilePhone}
            open={!!profilePhone}
            onClose={() => setProfilePhone(null)}
            onUpdated={load}
          />
        </Suspense>
      )}

      <Dialog open={bulkSmsOpen} onOpenChange={setBulkSmsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk SMS to {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Use <code>{"{{name}}"}</code> and <code>{"{{order_id}}"}</code> as placeholders.
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea rows={4} value={bulkSmsMessage} onChange={(e) => setBulkSmsMessage(e.target.value)} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkSmsOpen(false)}>Cancel</Button>
            <Button onClick={submitBulkSms} disabled={bulkSmsBusy || !bulkSmsMessage.trim()}>
              {bulkSmsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selected.size} order(s) as task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Assign to user</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Choose user…" /></SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input
                value={assignTitle}
                onChange={(e) => setAssignTitle(e.target.value)}
                placeholder={selected.size > 1 ? `Follow up ${selected.size} orders` : "Order #… — customer name"}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">Leave blank to auto-generate per order.</p>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                rows={3}
                value={assignDesc}
                onChange={(e) => setAssignDesc(e.target.value)}
                placeholder="What should they do? (e.g. call customer and confirm)"
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={submitAssignTasks} disabled={assignBusy || !assignUserId}>
              {assignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create task(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tsAssignOpen} onOpenChange={setTsAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selected.size} order(s) to Telesales</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Assign to telesales user</Label>
              <Select value={tsAssignUserId} onValueChange={setTsAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Choose user…" /></SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Customers will be added to the telesales list (deduped by phone) and assigned to the chosen user.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTsAssignOpen(false)}>Cancel</Button>
            <Button onClick={submitAssignTelesales} disabled={tsAssignBusy || !tsAssignUserId}>
              {tsAssignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteEditing} onOpenChange={(o) => !o && setNoteEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteEditing ? `Note for Order #${noteEditing.order_number}` : "Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Internal note</Label>
            <Textarea
              rows={5}
              value={noteEditing?.note ?? ""}
              onChange={(e) => setNoteEditing((prev) => prev ? { ...prev, note: e.target.value } : prev)}
              placeholder="Add a private note about this order…"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground">Only visible to your team. Leave empty to remove.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteEditing(null)} disabled={noteBusy}>Cancel</Button>
            <Button onClick={saveNote} disabled={noteBusy}>
              {noteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {blockingPhone && (
        <Suspense fallback={null}>
          <BlockCustomerDialog
          open={!!blockingPhone}
          onOpenChange={(v) => { if (!v) setBlockingPhone(null); }}
          defaultPhone={blockingPhone}
          onBlocked={async () => {
            try {
              const allPhones = Array.from(new Set(rows.map((o) => o.customer_phone).filter(Boolean) as string[]));
              const map = await fetchBlockedPhones({ data: { phones: allPhones } });
              setBlockedPhones(map);
            } catch { /* non-fatal */ }
          }}
          />
        </Suspense>
      )}

      <Dialog open={bulkBlockOpen} onOpenChange={(v) => { if (!bulkBlockBusy) setBulkBlockOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" /> Block {(() => {
                const ids = Array.from(selected);
                const phones = Array.from(new Set(rows.filter((r) => ids.includes(r.id)).map((o) => o.customer_phone?.trim()).filter(Boolean) as string[]));
                return phones.length;
              })()} customer(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              All unique phone numbers from the {selected.size} selected order(s) will be blocked. The reason below is shown in red on every future order attempt by these customers.
            </p>
            <div>
              <Label htmlFor="bulk-block-reason" className="text-red-600">
                Reason for blocking <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="bulk-block-reason"
                value={bulkBlockReason}
                onChange={(e) => setBulkBlockReason(e.target.value)}
                placeholder="e.g. হয়রানি করিয়েছে, fake orders, abusive…"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkBlockOpen(false)} disabled={bulkBlockBusy}>Cancel</Button>
            <Button variant="destructive" onClick={submitBulkBlock} disabled={bulkBlockBusy || !bulkBlockReason.trim()}>
              {bulkBlockBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              {bulkBlockBusy ? "Blocking…" : "Block customers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreorderDateInline({
  date,
  todayISO,
  onChange,
}: {
  date: string | null;
  todayISO: string;
  onChange: (date: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const isOverdue = !!date && date < todayISO;
  const isDueToday = date === todayISO;
  const isUpcoming = !!date && date > todayISO;
  const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined;
  const badgeCls = isOverdue
    ? "border-red-500/60 bg-red-500/15 text-red-200"
    : isDueToday
    ? "border-amber-500/60 bg-amber-500/15 text-amber-100 animate-pulse"
    : isUpcoming
    ? "border-violet-500/60 bg-violet-500/15 text-violet-100"
    : "border-dashed border-muted-foreground/40 bg-muted/30 text-muted-foreground";
  const label = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString()
    : "Set due date";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 -mt-1 text-xs">
      <span className="text-muted-foreground">Pre-order due:</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={`h-7 px-2 text-xs ${badgeCls}`}>
            {label}
            {isOverdue && <span className="ml-1 font-semibold">(Overdue)</span>}
            {isDueToday && <span className="ml-1 font-semibold">(Today)</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${day}`);
              setOpen(false);
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {date && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

