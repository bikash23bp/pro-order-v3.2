import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ArrowLeft, Loader2, AlertTriangle, Phone, MessageCircle, Crown, ShieldAlert, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CustomerInsightsPanel } from "@/components/orders/CustomerInsightsPanel";
import { MemberBadge } from "@/components/MemberBadge";
import { CustomerTagPicker } from "@/components/customers/CustomerTagPicker";
import { useMembershipPhones, useMembershipDiscount, invalidateMembershipPhones } from "@/hooks/use-membership-phones";
import { useBestTagDiscount } from "@/hooks/use-tag-discounts";
import { TAG_LABEL } from "@/lib/tags.functions";
import { ProductPickerDialog } from "@/components/orders/ProductPickerDialog";
import { OrderLineItemRow } from "@/components/orders/OrderLineItemRow";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { checkBlocked, unblockCustomer, getMyIp } from "@/lib/blocked-customers.functions";
import { toAsciiDigits, extractBDPhone, normalizeBDPhone } from "@/lib/phone-paste";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NoteTemplatePicker } from "@/components/orders/NoteTemplatePicker";


type Variant = { id: string; product_id: string; attributes: Record<string, string>; sku: string | null; price: number | null; stock_quantity: number; image_url: string | null };
type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  category_id: string | null;
  has_variants?: boolean;
  variants?: Variant[];
};
type Courier = { id: string; name: string };
type Source = { id: string; name: string };
type AdvanceSource = { id: string; name: string; requires_txn_id: boolean };

type Line = { product_id: string; unit_price: number; quantity: number; variant_id?: string | null; variant_label?: string | null };

// টাইপে নতুন স্ট্যাটাস যুক্ত করুন
type StatusOption = "processing" | "pending" | "pending_web" | "ready_order" | "incomplete" | "hold" | "ready_to_ship" | "out_of_stock" | "shipped" | "completed" | "cancelled";

// অপশন লিস্টে সিরিয়াল ঠিক করে সাজান
const STATUS_OPTIONS: { value: StatusOption; label: string }[] = [
  { value: "processing",  label: "Processing" },
  { value: "pending",     label: "Pending" },
  { value: "pending_web", label: "Web Pending" },
  { value: "ready_order", label: "Ready Order" }, // ওয়েব অর্ডারের ঠিক পরেই রেডি অর্ডার
  { value: "incomplete",  label: "Incomplete" },
  { value: "hold",        label: "Hold" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "shipped",     label: "Shipped" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

const DELIVERY_METHODS = ["Home Delivery", "Point Pickup", "Office Pickup", "In Person"];

const newOrderSearchSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  source: z.string().optional(),
  assignmentId: z.string().optional(),
}).partial();

export const Route = createFileRoute("/_app/orders/new")({
  head: () => ({ meta: [{ title: "New Order — OMS" }] }),
  validateSearch: newOrderSearchSchema,
  component: NewOrderPage,
});

function NewOrderPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/orders/new" });
  const [products, setProducts] = useState<Product[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [dupCount, setDupCount] = useState(0);
  const [dupStatuses, setDupStatuses] = useState<string[]>([]);
  const [dupOpen, setDupOpen] = useState(false);

  // customer
  const [customerName, setCustomerName] = useState(search.name ?? "");
  const [customerPhone, setCustomerPhone] = useState(search.phone ?? "");
  const [customerAddress, setCustomerAddress] = useState(search.address ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS[0]);
  const [shippingNote, setShippingNote] = useState("");
  // settings
  const [status, setStatus] = useState<StatusOption>("processing");
  const [courierId, setCourierId] = useState<string>("none");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [advance, setAdvance] = useState("0");
  const [advanceSourceId, setAdvanceSourceId] = useState<string>("");
  const [advanceTxnId, setAdvanceTxnId] = useState<string>("");
  const [advanceSources, setAdvanceSources] = useState<AdvanceSource[]>([]);
  const [invoiceNote, setInvoiceNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  // extras
  const [preorder, setPreorder] = useState(false);
  const [crossSale, setCrossSale] = useState(false);
  const [addToMembership, setAddToMembership] = useState(false);
  const [isPaidMarketing, setIsPaidMarketing] = useState(true);
  const [customerType, setCustomerType] = useState<"retail" | "wholesale">("retail");
  const [customerTypeLocked, setCustomerTypeLocked] = useState(false);

  // items
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // last order lookup
  const [lastOrder, setLastOrder] = useState<{ customer_name: string; customer_address: string; created_at: string } | null>(null);
  // Block status
  const [blockInfo, setBlockInfo] = useState<{ reason: string; blocked_by_name: string | null; blocked_at: string } | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const checkBlockedFn = useServerFn(checkBlocked);
  const unblockFn = useServerFn(unblockCustomer);
  const fetchMyIp = useServerFn(getMyIp);
  const [myIp, setMyIp] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchMyIp();
        setMyIp(r.ip ?? null);
      } catch { setMyIp(null); }
    })();
  }, [fetchMyIp]);

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 6) { setLastOrder(null); return; }
    const norm = digits.slice(-11);
    let cancelled = false;
    const t = setTimeout(async () => {
      const [{ data }, { data: wsRow }] = await Promise.all([
        supabase
          .from("orders")
          .select("customer_name, customer_address, created_at")
          .eq("phone_normalized", norm)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id")
          .eq("phone_normalized", norm)
          .eq("customer_type" as never, "wholesale" as never)
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setLastOrder(data ?? null);
      if (wsRow && !customerTypeLocked) setCustomerType("wholesale");
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerPhone, customerTypeLocked]);

  // Blocked-customer check (phone AND/OR current IP)
  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, "");
    const phoneReady = digits.length >= 11;
    if (!phoneReady && !myIp) { setBlockInfo(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await checkBlockedFn({ data: {
          phone: phoneReady ? customerPhone : undefined,
          ip: myIp ?? undefined,
        } });
        if (cancelled) return;
        if (r.blocked) {
          setBlockInfo({ reason: r.reason, blocked_by_name: r.blocked_by_name, blocked_at: r.blocked_at });
        } else {
          setBlockInfo(null);
        }
      } catch {
        if (!cancelled) setBlockInfo(null);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerPhone, myIp, checkBlockedFn]);

  const handleUnblock = async () => {
    const digits = customerPhone.replace(/\D/g, "").slice(-11);
    if (!digits) return;
    if (!confirm("Unblock this customer?")) return;
    try {
      const { data: row } = await supabase
        .from("blocked_customers")
        .select("id")
        .eq("phone_normalized", digits)
        .maybeSingle();
      if (!row?.id) { setBlockInfo(null); return; }
      await unblockFn({ data: { id: row.id } });
      setBlockInfo(null);
      toast.success("Customer unblocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock");
    }
  };

  const applyLastOrder = () => {
    if (!lastOrder) return;
    setCustomerName(lastOrder.customer_name);
    setCustomerAddress(lastOrder.customer_address);
    toast.success("Filled from last order");
  };

  useEffect(() => {
    (async () => {
      const [{ data: p, error: pe }, { data: c, error: ce }, { data: s, error: se }, { data: aps, error: apsErr }] = await Promise.all([
        supabase.from("products").select("id,name,sku,price,stock_quantity,image_url,category_id,has_variants,is_featured,product_variants(id,product_id,attributes,sku,price,stock_quantity,image_url,status)").eq("status", "active").order("name"),
        supabase.from("couriers").select("id,name,is_default").eq("status", "active").order("name"),
        supabase.from("order_sources").select("id,name").eq("visible", true).order("name"),
        supabase.from("advance_payment_sources").select("id,name,requires_txn_id").eq("visible", true).order("sort_order").order("name"),
      ]);
      if (pe) toast.error(pe.message);
      if (ce) toast.error(ce.message);
      if (se) toast.error(se.message);
      if (apsErr) toast.error(apsErr.message);
      setAdvanceSources((aps ?? []) as AdvanceSource[]);
      setProducts(((p ?? []) as unknown as Array<Product & { product_variants?: Variant[] }>).map((row) => ({
        ...row,
        variants: (row.product_variants ?? []).filter((v) => (v as { status?: string }).status !== "inactive"),
      })) as Product[]);
      const courierRows = (c ?? []) as Array<Courier & { is_default?: boolean }>;
      setCouriers(courierRows as Courier[]);
      const def = courierRows.find((x) => x.is_default);
      if (def) setCourierId(def.id);
      const srcs = (s ?? []) as Source[];
      setSources(srcs);
      const preferName = search.source === "telesales" ? "TeleSales" : "Unknown";
      const preferred = srcs.find((x) => x.name.toLowerCase() === preferName.toLowerCase());
      if (preferred) setSourceId(preferred.id);
      else if (srcs[0]) setSourceId(srcs[0].id);
    })();
  }, [search.source]);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const addProduct = (
    p: { id: string; name: string; price: number },
    v?: { id: string; price: number | null; attributes: Record<string, string> },
  ) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id && (l.variant_id ?? null) === (v?.id ?? null));
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          variant_id: v?.id ?? null,
          variant_label: v ? Object.values(v.attributes ?? {}).join(" / ") : null,
          unit_price: Number(v?.price ?? p.price),
          quantity: 1,
        },
      ];
    });
  };
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const { isMember } = useMembershipPhones();
  const { enabled: membershipDiscountEnabled, rate: membershipDiscountRate } = useMembershipDiscount();
  const isMembershipOrder = isMember(customerPhone) || addToMembership;
  const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  const subtotal = round2(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0));
  const manualDiscount = round2(Number(discount || 0));
  const membershipDiscount = isMembershipOrder && membershipDiscountEnabled ? round2(subtotal * membershipDiscountRate) : 0;
  const bestTagDiscount = useBestTagDiscount(customerPhone);
  const tagDiscount = bestTagDiscount.rate > 0 ? round2(subtotal * (bestTagDiscount.rate / 100)) : 0;
  const totalDiscount = round2(manualDiscount + membershipDiscount + tagDiscount);
  const total = Math.max(0, round2(subtotal + Number(deliveryCharge || 0) - totalDiscount));
  const due = Math.max(0, round2(total - Number(advance || 0)));

  const phoneDigits = customerPhone.replace(/\D/g, "");
  const waNumber = phoneDigits.length >= 10 ? (phoneDigits.startsWith("88") ? phoneDigits : `88${phoneDigits}`) : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockInfo) return toast.error("⛔ This customer is blocked. Unblock them first.");
    if (!customerName.trim()) return toast.error("Missing field: Customer name");
    if (!customerPhone.trim()) return toast.error("Missing field: Phone number");
    if (!customerAddress.trim()) return toast.error("Missing field: Address");
    if (lines.length === 0) return toast.error("Add at least one product.");
    if (!sourceId) return toast.error("Select an order source");

    const advNum = Number(advance) || 0;
    const selectedAdvSrc = advanceSources.find((s) => s.id === advanceSourceId);
    if (advNum > 0 && !advanceSourceId) return toast.error("Advance payment method নির্বাচন করুন");
    if (advNum > 0 && selectedAdvSrc?.requires_txn_id && !advanceTxnId.trim()) {
      return toast.error(`${selectedAdvSrc.name}-এর জন্য Transaction ID দিন`);
    }

    // Duplicate check: any running order (not shipped/completed/cancelled) with same phone
    try {
      const normPhone = normalizeBDPhone(customerPhone) || customerPhone.trim();
      const ACTIVE = ["pending", "processing", "pending_web", "ready_order", "incomplete", "hold", "ready_to_ship"] as const;
      const { data: dupRows } = await supabase
        .from("orders")
        .select("status")
        .eq("customer_phone", normPhone)
        .in("status", ACTIVE);
      const rows = (dupRows ?? []) as Array<{ status: string }>;
      if (rows.length > 0) {
        setDupCount(rows.length);
        setDupStatuses(rows.map((r) => r.status));
        setDupOpen(true);
        return;
      }
    } catch (dupErr) {
      console.warn("Duplicate check failed", dupErr);
    }

    await doSubmit();
  };

  const doSubmit = async () => {
    const advNum = Number(advance) || 0;

    for (const [i, l] of lines.entries()) {
      const p = productMap[l.product_id];
      if (!p) return toast.error(`Item ${i + 1}: select a valid product`);
      if (l.quantity <= 0) return toast.error(`Item ${i + 1} (${p.name}): quantity must be at least 1`);
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_order_with_items", {
        p_customer_name: customerName.trim(),
        p_customer_phone: normalizeBDPhone(customerPhone) || customerPhone.trim(),
        p_customer_email: "",
        p_customer_address: customerAddress.trim(),
        p_courier_id: courierId === "none" ? null : courierId,
        p_delivery_charge: Number(deliveryCharge) || 0,
        p_discount_amount: totalDiscount,
        p_advance_amount: Number(advance) || 0,
        p_subtotal: subtotal,
        p_total_amount: total,
        p_invoice_note: [shippingNote.trim(), invoiceNote.trim()].filter(Boolean).join("\n"),
        p_internal_note: internalNote.trim(),
        p_items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id ?? null, quantity: l.quantity, unit_price: l.unit_price })),
      } as never);

      if (error) throw new Error(error.message);
      const created = data as { id?: string; order_number?: number } | null;

      // Patch with extras (status / preorder / cross_sale / delivery_method / advance source / paid marketing)
      if (created?.id) {
        const selectedSource = sources.find((s) => s.id === sourceId);
        const patch: {
          preorder: boolean;
          cross_sale: boolean;
          delivery_method: string;
          order_source_id: string;
          source?: string;
          status?: StatusOption;
          advance_source_id?: string | null;
          advance_txn_id?: string | null;
          is_paid_marketing: boolean;
          customer_type: "retail" | "wholesale";
        } = {
          preorder,
          cross_sale: crossSale,
          delivery_method: deliveryMethod,
          order_source_id: sourceId,
          is_paid_marketing: isPaidMarketing,
          customer_type: customerType,
          ...(selectedSource ? { source: selectedSource.name } : {}),
          ...(status !== "processing" ? { status } : {}),
        };
        if (advNum > 0) {
          patch.advance_source_id = advanceSourceId || null;
          patch.advance_txn_id = advanceTxnId.trim() || null;
        }
        const { error: upErr } = await supabase.from("orders").update(patch as never).eq("id", created.id);
        if (upErr) console.error("Order extras update failed", upErr);
      }


      if (addToMembership && customerPhone.trim()) {
        try {
          const { addMembershipCustomer } = await import("@/lib/membership.functions");
          await addMembershipCustomer({
            data: {
              name: customerName.trim() || null,
              phone: customerPhone.trim(),
              address: customerAddress.trim() || null,
              email: null,
              date_of_birth: null,
              tier: "standard",
              notes: null,
            },
          });
          invalidateMembershipPhones();
        } catch (memErr) {
          console.error("Add to membership failed", memErr);
        }
      }

      if (created?.id && search.assignmentId) {
        try {
          const { markTelesalesOrderTaken } = await import("@/lib/telesales.functions");
          await markTelesalesOrderTaken({ data: { assignmentId: search.assignmentId, orderId: created.id } });
        } catch (markErr) {
          console.error("markTelesalesOrderTaken failed", markErr);
        }
      }

      // Auto-forward to OMS destinations that are configured for auto-forward
      if (created?.id) {
        try {
          const { autoForwardNewOrder } = await import("@/lib/oms-forward.functions");
          autoForwardNewOrder({ data: { orderId: created.id } }).catch((e) => console.warn("auto-forward failed", e));
        } catch (e) {
          console.warn("auto-forward import failed", e);
        }
      }

      toast.success(`Order #${created?.order_number ?? ""} created`);
      navigate({ to: "/orders" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/orders" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Order</h1>
          <p className="text-sm text-muted-foreground">Stock will auto-adjust on save.</p>
        </div>
      </div>

      {blockInfo && (
        <div className="rounded-md border-2 border-red-600 bg-red-600/10 text-red-700 dark:text-red-300 p-3 flex items-start gap-3 animate-pulse">
          <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base">⛔ BLOCKED CUSTOMER</div>
            <div className="text-sm mt-0.5"><span className="font-semibold">Reason:</span> {blockInfo.reason}</div>
            <div className="text-xs opacity-80 mt-0.5">
              Blocked {blockInfo.blocked_by_name ? `by ${blockInfo.blocked_by_name} ` : ""}on {new Date(blockInfo.blocked_at).toLocaleString()}
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={handleUnblock} className="shrink-0">
            <ShieldOff className="h-4 w-4" /> Unblock
          </Button>
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="space-y-2 md:col-span-3">
                  <Label>Mobile Number *</Label>
                  <div className="flex gap-1">
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(toAsciiDigits(e.target.value))}
                      onBlur={() => {
                        const n = normalizeBDPhone(customerPhone);
                        if (n && n !== customerPhone) setCustomerPhone(n);
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        if (!text) return;
                        const { phone, rest } = extractBDPhone(text);
                        if (phone) {
                          e.preventDefault();
                          setCustomerPhone(phone);
                          if (rest) {
                            setCustomerAddress((prev: string) => (prev?.trim() ? `${prev}\n${rest}` : rest));
                          }
                        } else {
                          const ascii = toAsciiDigits(text);
                          if (ascii !== text) {
                            e.preventDefault();
                            setCustomerPhone(ascii);
                          }
                        }
                      }}
                      placeholder="01XXXXXXXXX"
                      required
                    />
                    <Button
                      type="button" size="icon" variant="outline"
                      disabled={!phoneDigits}
                      onClick={() => phoneDigits && window.open(`tel:${phoneDigits}`)}
                      title="Call"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button" size="icon" variant="outline"
                      disabled={!waNumber}
                      onClick={() => waNumber && window.open(`https://wa.me/${waNumber}`, "_blank")}
                      title="WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <CustomerTagPicker phone={customerPhone.trim()} buttonSize="icon" buttonLabel="" showBadgesInline={false} />
                    <Button
                      type="button" size="icon" variant="outline"
                      disabled={!phoneDigits || !!blockInfo}
                      onClick={() => setBlockDialogOpen(true)}
                      title="Block this customer"
                      className="text-red-600 hover:text-red-700"
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </Button>
                  </div>
                  {customerPhone.trim() && (
                    <CustomerTagPicker phone={customerPhone.trim()} buttonSize="xs" buttonLabel="Tags" />
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="flex items-center gap-2 flex-wrap">
                    Name *
                    {isMember(customerPhone) ? (
                      <MemberBadge phone={customerPhone} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddToMembership((v) => !v)}
                        title="Add this customer to Membership (10% auto discount)"
                        className={
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0 text-[10px] font-semibold transition-colors " +
                          (addToMembership
                            ? "border-amber-400/60 bg-amber-400/15 text-amber-500"
                            : "border-border text-muted-foreground hover:text-amber-500 hover:border-amber-400/60")
                        }
                      >
                        <Crown className="h-3 w-3" />
                        {addToMembership ? "Will be Member" : "Add to Membership"}
                      </button>
                    )}
                  </Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label>Delivery Method</Label>
                  <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DELIVERY_METHODS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Customer Type:</Label>
                <div className="inline-flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setCustomerType("retail"); setCustomerTypeLocked(true); }}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${customerType === "retail" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Retail
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCustomerType("wholesale"); setCustomerTypeLocked(true); }}
                    className={`px-3 py-1 text-xs font-medium transition-colors border-l ${customerType === "wholesale" ? "bg-amber-500 text-white" : "bg-background hover:bg-muted"}`}
                  >
                    Wholesale
                  </button>
                </div>
                {customerType === "wholesale" && !customerTypeLocked && (
                  <span className="text-[11px] text-amber-500">Auto-detected from history</span>
                )}
              </div>
              {lastOrder && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                  <span className="text-muted-foreground">
                    Returning customer — last order {new Date(lastOrder.created_at).toLocaleDateString()} ({lastOrder.customer_name})
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={applyLastOrder}>
                    Use last order details
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Address *</Label>
                  <Textarea value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} rows={2} required />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Shipping Note</Label>
                    <NoteTemplatePicker kind="shipping" onPick={(t) => setShippingNote((v) => (v ? `${v}\n${t}` : t))} />
                  </div>
                  <Textarea value={shippingNote} onChange={(e) => setShippingNote(e.target.value)} rows={2} placeholder="Leave at door, call before delivery, etc." />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {lines.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No items added yet.</p>
              )}
              {lines.map((l, i) => (
                <OrderLineItemRow
                  key={i}
                  index={i}
                  line={l}
                  product={productMap[l.product_id]}
                  products={products}
                  variantLabel={l.variant_label ?? null}
                  onProductChange={(idx, pid) => {
                    const prod = productMap[pid];
                    updateLine(idx, { product_id: pid, variant_id: null, variant_label: null, unit_price: prod ? Number(prod.price) : l.unit_price });
                  }}
                  onQuantityChange={(idx, qty) => updateLine(idx, { quantity: qty })}
                  onPriceChange={(idx, price) => updateLine(idx, { unit_price: price })}
                  onVariantChange={(idx, v) => {
                    const prod = productMap[l.product_id];
                    updateLine(idx, {
                      variant_id: v?.id ?? null,
                      variant_label: v ? Object.values(v.attributes ?? {}).join(" / ") : null,
                      unit_price: v ? Number(v.price ?? prod?.price ?? l.unit_price) : Number(prod?.price ?? l.unit_price),
                    });
                  }}
                  onRemove={removeLine}
                />
              ))}
            </CardContent>
          </Card>

          <Accordion type="single" collapsible>
            <AccordionItem value="extras">
              <AccordionTrigger className="px-4 border rounded-md">Extra Options</AccordionTrigger>
              <AccordionContent className="border border-t-0 rounded-b-md p-4 space-y-3">
                <div className="flex items-center justify-between rounded-md border p-3 bg-emerald-500/5">
                  <div>
                    <Label>Paid Marketing Sale</Label>
                    <p className="text-xs text-muted-foreground">
                      Facebook/Google ad থেকে এসেছে? Off করলে Organic হিসেবে গণনা হবে এবং ROAS এ count হবে না।
                    </p>
                  </div>
                  <Switch checked={isPaidMarketing} onCheckedChange={setIsPaidMarketing} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Cross Sale</Label>
                    <p className="text-xs text-muted-foreground">Tag this as a cross-sell / up-sell order.</p>
                  </div>
                  <Switch checked={crossSale} onCheckedChange={setCrossSale} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Add to Membership Customer</Label>
                    <p className="text-xs text-muted-foreground">Enroll this customer in the membership program.</p>
                  </div>
                  <Switch checked={addToMembership} onCheckedChange={setAddToMembership} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Invoice note</Label>
                      <NoteTemplatePicker kind="invoice" onPick={(t) => setInvoiceNote((v) => (v ? `${v}\n${t}` : t))} />
                    </div>
                    <Textarea value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Internal note</Label>
                      <NoteTemplatePicker kind="internal" onPick={(t) => setInternalNote((v) => (v ? `${v}\n${t}` : t))} />
                    </div>
                    <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="space-y-4">
          <CustomerInsightsPanel phone={customerPhone} />

          <Card>
            <CardHeader><CardTitle className="text-base">Order Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Source *</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Courier</Label>
                <Select value={courierId} onValueChange={setCourierId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Delivery</Label>
                  <Input type="number" step="0.01" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Discount</Label>
                  <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Advance</Label>
                  <Input type="number" step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} />
                </div>
              </div>
              {Number(advance) > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Advance Payment Method *</Label>
                    <Select value={advanceSourceId || "__none__"} onValueChange={(v) => setAdvanceSourceId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Select —</SelectItem>
                        {advanceSources.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}{s.requires_txn_id ? " *" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Transaction ID
                      {advanceSources.find((s) => s.id === advanceSourceId)?.requires_txn_id && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Input value={advanceTxnId} onChange={(e) => setAdvanceTxnId(e.target.value)} placeholder="Optional reference" className="h-8" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SumRow label="Subtotal" value={subtotal} />
              <SumRow label="Delivery" value={Number(deliveryCharge) || 0} />
              <SumRow label="Discount" value={-manualDiscount} />
              {membershipDiscount > 0 && (
                <div className="flex justify-between text-amber-500">
                  <span className="inline-flex items-center gap-1">
                    <MemberBadge phone={customerPhone} force />
                    Member discount (10%)
                  </span>
                  <span>− ৳ {membershipDiscount.toFixed(2)}</span>
                </div>
              )}
              {tagDiscount > 0 && bestTagDiscount.tag && (
                <div className="flex justify-between text-emerald-500">
                  <span>Tag discount ({TAG_LABEL[bestTagDiscount.tag]} · {bestTagDiscount.rate}%)</span>
                  <span>− ৳ {tagDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span><span>৳ {total.toFixed(2)}</span>
              </div>
              <SumRow label="Advance" value={-(Number(advance) || 0)} />
              <div className="flex justify-between font-semibold text-primary">
                <span>Due</span><span>৳ {due.toFixed(2)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 mt-3">
                <Label className="text-xs font-semibold shrink-0">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusOption)}>
                  <SelectTrigger className="h-8 flex-1 min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setPreorder((v) => !v)}
                  className={
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors " +
                    (preorder
                      ? "border-violet-400/60 bg-violet-400/15 text-violet-500"
                      : "border-border text-muted-foreground hover:text-violet-500 hover:border-violet-400/60")
                  }
                >
                  {preorder ? "Pre-Order ✓" : "Mark as Pre-Order"}
                </button>
              </div>
              <Button type="submit" className="w-full mt-3" disabled={saving || !!blockInfo}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {blockInfo ? "Blocked customer" : saving ? "Creating…" : "Create Order"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
      <ProductPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIds={new Set(lines.filter((l) => l.product_id).map((l) => l.variant_id ? `${l.product_id}:${l.variant_id}` : l.product_id))}
        onAdd={addProduct}
      />
      <BlockCustomerDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        defaultPhone={customerPhone}
        onBlocked={async () => {
          const r = await checkBlockedFn({ data: { phone: customerPhone } });
          if (r.blocked) setBlockInfo({ reason: r.reason, blocked_by_name: r.blocked_by_name, blocked_at: r.blocked_at });
        }}
      />
      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ডুপ্লিকেট অর্ডার সতর্কতা</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const labels: Record<string, string> = {
                  pending: "Pending",
                  pending_web: "Web Pending",
                  ready_order: "Ready Order",
                  processing: "Processing",
                  ready_to_ship: "Ready to Ship",
                  incomplete: "Incomplete",
                  hold: "Hold",
                };
                const counts = dupStatuses.reduce<Record<string, number>>((acc, s) => {
                  acc[s] = (acc[s] ?? 0) + 1;
                  return acc;
                }, {});
                const parts = Object.entries(counts).map(
                  ([s, n]) => `${n} টি ${labels[s] ?? s}`,
                );
                return `এই ফোন নম্বরে অলরেডি ${dupCount} টি অর্ডার আছে (${parts.join(", ")})। তবুও কনফার্ম করতে আগ্রহী?`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setDupOpen(false);
                await doSubmit();
              }}
            >
              Yes, Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span>৳ {value.toFixed(2)}</span>
    </div>
  );
}
