import { useEffect, useState } from "react";
import { MemberBadge } from "@/components/MemberBadge";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crown, Send, Loader2, ChevronDown, ChevronUp, ShieldAlert, History, Pencil, FileText, StickyNote, PlusCircle, Edit3 } from "lucide-react";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCustomerInsight, type CustomerStat } from "@/lib/customers.functions";
import { checkDuplicatePhone } from "@/lib/duplicates.functions";
import { isActiveStatus } from "@/lib/duplicates.shared";
import { DuplicateBadge } from "@/components/orders/DuplicateBadge";
import { sendCustomSms } from "@/lib/sms.functions";
import { getOrderHistory, updateOrderStatusOnly, type OrderHistoryEntry } from "@/lib/order-history.functions";
import { getOrderCustomFields } from "@/lib/orders-import.functions";
import { CopyInvoiceImageButton } from "@/components/orders/CopyInvoiceImageButton";
import { ForwardOrderDialog } from "@/components/orders/ForwardOrderDialog";
import { useAuth } from "@/hooks/use-auth";

type OrderStatus =
  | "pending" | "pending_web" | "ready_order" | "processing" | "ready_to_ship" | "out_of_stock" | "shipped"
  | "completed" | "cancelled" | "cancel_request" | "returned" | "no_response" | "fraud" | "hold" | "incomplete";

export type DetailOrder = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  status: OrderStatus;
  total_amount: number;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  advance_source_id?: string | null;
  advance_txn_id?: string | null;
  subtotal: number;
  consignment_id: string | null;
  invoice_note: string | null;
  internal_note: string | null;
  is_paid_marketing?: boolean | null;
  oms_sender_name?: string | null;
  oms_sender_order_no?: string | null;
};


type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
  products: { name: string; sku: string | null } | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  pending_web: "Web Pending",
  ready_order: "Ready Order",
  processing: "Processing", ready_to_ship: "Ready to Ship", out_of_stock: "Out of Stock", shipped: "Shipped",
  completed: "Completed", cancelled: "Cancelled", cancel_request: "Cancel Request",
  returned: "Returned",
  no_response: "No Response", fraud: "Fraud", hold: "Hold", incomplete: "Incomplete",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  pending_web: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  ready_order: "bg-amber-600/15 text-amber-500 border-amber-600/30",
  processing: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  ready_to_ship: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  out_of_stock: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  shipped: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  cancel_request: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  returned: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  no_response: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  fraud: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  incomplete: "bg-amber-700/15 text-amber-200 border-amber-700/30",
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>৳ {Number(value).toFixed(2)}</span>
    </div>
  );
}

export function OrderDetailDialog({ order, onClose, onEdit }: { order: DetailOrder; onClose: () => void; onEdit?: () => void }) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<CustomerStat | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateOrders, setDuplicateOrders] = useState<Array<{ id: string; order_number: number; status: string; created_at: string; matched_by: ("phone" | "email")[] }>>([]);
  const [dupExpanded, setDupExpanded] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [nextStatus, setNextStatus] = useState<OrderStatus>(order.status);
  const [saving, setSaving] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [advanceSourceName, setAdvanceSourceName] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string | null }>>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const { permissions, role } = useAuth();
  const canForward = role === "admin" || role === "business_owner" || role === "manager" || !!permissions?.can_forward_orders;

  const fetchInsight = useServerFn(getCustomerInsight);
  const fetchDup = useServerFn(checkDuplicatePhone);
  const sendSms = useServerFn(sendCustomSms);
  const fetchHistory = useServerFn(getOrderHistory);
  const saveStatus = useServerFn(updateOrderStatusOnly);
  const fetchCustomFields = useServerFn(getOrderCustomFields);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchHistory({ data: { orderId: order.id } });
      setHistory(rows);
    } catch (e) {
      console.warn("history load failed", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, product_id, products(name, sku)")
        .eq("order_id", order.id);
      if (error) toast.error(error.message);
      setItems((data ?? []) as unknown as OrderItem[]);
      setLoading(false);
    })();
    (async () => {
      if (!order.advance_source_id) { setAdvanceSourceName(null); return; }
      const { data } = await supabase
        .from("advance_payment_sources")
        .select("name")
        .eq("id", order.advance_source_id)
        .maybeSingle();
      setAdvanceSourceName((data as { name?: string } | null)?.name ?? null);
    })();
    (async () => {
      try {
        if (order.customer_phone) {
          const r = await fetchInsight({ data: { phone: order.customer_phone.trim() } });
          setInsight(r);
        }
      } catch {/* non-fatal */}
    })();
    (async () => {
      try {
        if (order.customer_phone || order.customer_email) {
          const r = await fetchDup({ data: {
            phone: order.customer_phone?.trim() ?? "",
            email: order.customer_email?.trim() ?? null,
            excludeId: order.id,
          } });
          setDuplicateCount(r.count);
          setDuplicateOrders(r.orders ?? []);
        }
      } catch {/* non-fatal */}
    })();
    (async () => {
      try {
        const rows = await fetchCustomFields({ data: { order_id: order.id } });
        setCustomFields(rows);
      } catch {/* non-fatal */}
    })();
    loadHistory();
  }, [order.id]);

  const submitSms = async () => {
    if (!smsMessage.trim()) return;
    setSending(true);
    try {
      await sendSms({ data: {
        phone: order.customer_phone.trim(),
        message: smsMessage.trim(),
        order_id: order.id,
      } });
      toast.success("SMS sent");
      setSmsOpen(false); setSmsMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSending(false); }
  };

  const handleSave = async () => {
    if (nextStatus === order.status) return;
    setSaving(true);
    try {
      await saveStatus({ data: { orderId: order.id, status: nextStatus } });
      toast.success("Status updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const eventMeta = (ev: string) => {
    switch (ev) {
      case "created": return { icon: PlusCircle, label: "Order created", tone: "text-emerald-500" };
      case "status_changed": return { icon: History, label: "Status changed", tone: "text-blue-500" };
      case "invoice_note_changed": return { icon: FileText, label: "Invoice note", tone: "text-amber-500" };
      case "internal_note_changed": return { icon: StickyNote, label: "Internal note", tone: "text-amber-500" };
      case "edited": return { icon: Pencil, label: "Order edited", tone: "text-purple-500" };
      default: return { icon: History, label: ev, tone: "text-muted-foreground" };
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Order #{order.order_number}
              {insight?.is_vip && (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                  <Crown className="h-3 w-3" /> VIP
                </Badge>
              )}
              {order.is_paid_marketing === false && (
                <Badge variant="outline" className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[10px]">
                  Organic
                </Badge>
              )}
              {duplicateCount > 0 && isActiveStatus(order.status) && <DuplicateBadge />}
            </DialogTitle>

            <div className="flex items-center gap-2">
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => { onEdit(); onClose(); }}>
                  <Edit3 className="h-4 w-4" /> Edit
                </Button>
              )}
              <CopyInvoiceImageButton orderId={order.id} />
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {duplicateCount > 0 && isActiveStatus(order.status) && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300">
              <button
                type="button"
                onClick={() => setDupExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-red-500/15 rounded-md"
                aria-expanded={dupExpanded}
              >
                <span>
                  ⚠️ Duplicate order detected — {duplicateCount} other order{duplicateCount === 1 ? "" : "s"} share this phone or email.
                </span>
                {dupExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>
              {dupExpanded && (
                <div className="border-t border-red-500/30 px-3 py-2 space-y-1">
                  {duplicateOrders.length === 0 ? (
                    <div className="text-xs text-red-300/70">Loading…</div>
                  ) : (
                    duplicateOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-red-200">#{o.order_number}</span>
                        <Badge variant="outline" className="bg-red-500/10 text-red-200 border-red-500/30 text-[10px]">
                          {STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                        </Badge>
                        <span className="text-[10px] text-red-300/70">
                          {o.matched_by.join(" + ")}
                        </span>
                        <span className="text-[10px] text-red-300/60 ml-auto">
                          {new Date(o.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <section className="space-y-1 text-sm">
            <div className="font-medium flex items-center gap-1.5">
              {order.customer_name}
              <MemberBadge phone={order.customer_phone} />
            </div>
            <div className="text-muted-foreground">{order.customer_phone}</div>
            <div className="text-muted-foreground whitespace-pre-line">{order.customer_address}</div>
          </section>

          {insight && (
            <section className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Customer Insight</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Total Orders</div>
                  <div className="font-semibold">{insight.total_orders}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Lifetime Value</div>
                  <div className="font-semibold">৳ {Number(insight.total_spent).toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Returns/Cancel</div>
                  <div className="font-semibold">{insight.cancelled_orders}</div>
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Items</div>
            <div className="border rounded-md divide-y">
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading…</div>
              ) : items.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No items.</div>
              ) : (
                items.map((it) => (
                  <div key={it.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{it.products?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.quantity} × ৳ {Number(it.unit_price).toFixed(2)}
                      </div>
                    </div>
                    <div className="font-medium">
                      ৳ {(it.quantity * Number(it.unit_price)).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="text-sm space-y-1">
            <Row label="Subtotal" value={order.subtotal} />
            <Row label="Delivery" value={order.delivery_charge} />
            <Row label="Discount" value={-order.discount_amount} />
            <Row label="Advance" value={-order.advance_amount} />
            {Number(order.advance_amount) > 0 && (advanceSourceName || order.advance_txn_id) && (
              <div className="flex justify-end text-xs text-muted-foreground -mt-1">
                via {advanceSourceName ?? "—"}
                {order.advance_txn_id ? ` · TXN: ${order.advance_txn_id}` : ""}
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-semibold">
              <span>Total Due</span>
              <span>৳ {(Number(order.total_amount) - Number(order.advance_amount)).toFixed(2)}</span>
            </div>
          </section>

          {(order.invoice_note || order.internal_note) && (
            <section className="space-y-2 text-xs">
              {order.invoice_note && (
                <div>
                  <span className="font-semibold">Invoice note:</span>{" "}
                  <span className="text-muted-foreground">{order.invoice_note}</span>
                </div>
              )}
              {order.internal_note && (
                <div>
                  <span className="font-semibold">Internal note:</span>{" "}
                  <span className="text-muted-foreground">{order.internal_note}</span>
                </div>
              )}
            </section>
          )}

          {customFields.length > 0 && (
            <section className="space-y-2 border-t pt-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Extra info</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {customFields.map((cf) => (
                  <div key={cf.key} className="flex justify-between gap-2 border-b border-dashed border-muted/40 py-1">
                    <span className="text-muted-foreground truncate">{cf.key}</span>
                    <span className="font-medium text-right break-words">{cf.value || "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2 border-t pt-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Change status</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={STATUS_TONE[order.status]} variant="outline">
                Current: {STATUS_LABEL[order.status]}
              </Badge>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {order.consignment_id && (
                <span className="text-xs text-muted-foreground">Consignment: {order.consignment_id}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setBlockOpen(true)} className="text-red-600 hover:text-red-700">
                <ShieldAlert className="h-4 w-4" /> Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSmsOpen(true)}>
                <Send className="h-4 w-4" /> Send SMS
              </Button>
            </div>
          </section>

          <section className="border-t pt-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Activity & History
            </div>
            {historyLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity recorded yet.</div>
            ) : (
              <ol className="space-y-2">
                {history.map((h) => {
                  const meta = eventMeta(h.event_type);
                  const Icon = meta.icon;
                  const isNote = h.event_type === "invoice_note_changed" || h.event_type === "internal_note_changed";
                  const isStatus = h.event_type === "status_changed";
                  const expanded = expandedNote === h.id;
                  return (
                    <li key={h.id} className="flex gap-2 text-sm border rounded-md p-2 bg-muted/20">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.tone}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">{meta.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </div>
                        {isStatus && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span className="line-through">{STATUS_LABEL[h.from_value as OrderStatus] ?? h.from_value}</span>
                            {" → "}
                            <span className="font-medium text-foreground">{STATUS_LABEL[h.to_value as OrderStatus] ?? h.to_value}</span>
                          </div>
                        )}
                        {isNote && (
                          <div className="mt-1">
                            <button
                              type="button"
                              className="text-[11px] text-primary hover:underline"
                              onClick={() => setExpandedNote(expanded ? null : h.id)}
                            >
                              {expanded ? "Hide" : "Show"} note change
                            </button>
                            {expanded && (
                              <div className="mt-1 space-y-1 text-xs">
                                <div className="rounded bg-red-500/10 border border-red-500/20 p-1.5">
                                  <div className="text-[10px] text-red-400 font-semibold">Before</div>
                                  <div className="text-muted-foreground whitespace-pre-wrap">{h.from_value || "(empty)"}</div>
                                </div>
                                <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-1.5">
                                  <div className="text-[10px] text-emerald-400 font-semibold">After</div>
                                  <div className="text-muted-foreground whitespace-pre-wrap">{h.to_value || "(empty)"}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          by {h.changed_by_name ?? "System"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {order.oms_sender_name ? (
            <Badge variant="secondary" className="mr-auto">
              From: {order.oms_sender_name}{order.oms_sender_order_no ? ` #${order.oms_sender_order_no}` : ""}
            </Badge>
          ) : null}
          {canForward && (
            <Button variant="outline" onClick={() => setForwardOpen(true)}>
              <Send className="h-4 w-4" />Forward to OMS
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={handleSave} disabled={saving || nextStatus === order.status}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>

        <ForwardOrderDialog
          open={forwardOpen}
          onOpenChange={setForwardOpen}
          orderId={order.id}
          orderNumber={order.order_number}
        />


        <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send SMS to {order.customer_name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea rows={4} value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} maxLength={1000} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSmsOpen(false)}>Cancel</Button>
              <Button onClick={submitSms} disabled={sending || !smsMessage.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <BlockCustomerDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          defaultPhone={order.customer_phone}
          allowEdit={false}
        />
      </DialogContent>
    </Dialog>
  );
}
