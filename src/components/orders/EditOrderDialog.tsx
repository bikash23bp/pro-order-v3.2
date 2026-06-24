import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Crown, Link2, Loader2, Plus, ShieldAlert, User2, X } from "lucide-react";
import { parseUnmatchedFromNote, writeUnmatchedToNote, type WebUnmatchedItem } from "@/lib/web-unmatched";
import { MemberBadge } from "@/components/MemberBadge";
import { useMembershipPhones, useMembershipDiscount, invalidateMembershipPhones } from "@/hooks/use-membership-phones";
import { useBestTagDiscount } from "@/hooks/use-tag-discounts";
import { addMembershipCustomer } from "@/lib/membership.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteTemplatePicker } from "@/components/orders/NoteTemplatePicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProductPickerDialog } from "@/components/orders/ProductPickerDialog";
import { OrderLineItemRow } from "@/components/orders/OrderLineItemRow";
import { PhoneContactButtons } from "@/components/orders/PhoneContactButtons";
import { toAsciiDigits, extractBDPhone, normalizeBDPhone } from "@/lib/phone-paste";
import { CustomerTagPicker } from "@/components/customers/CustomerTagPicker";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { CustomerInsightsPanel } from "@/components/orders/CustomerInsightsPanel";


type Variant = { id: string; product_id: string; attributes: Record<string, string>; sku: string | null; price: number | null; stock_quantity: number; image_url: string | null };
type Product = { id: string; name: string; sku: string | null; price: number; stock_quantity: number; image_url: string | null; category_id: string | null; has_variants?: boolean; variants?: Variant[] };


type LineItem = { product_id: string; variant_id?: string | null; variant_label?: string | null; quantity: number; unit_price: number };

export type EditableOrder = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  advance_source_id?: string | null;
  advance_txn_id?: string | null;
  invoice_note: string | null;
  internal_note: string | null;
  status?: string;
  preorder?: boolean | null;
  preorder_date?: string | null;
  is_paid_marketing?: boolean | null;
  customer_type?: string | null;
};


type AdvanceSource = { id: string; name: string; requires_txn_id: boolean };

const ORDER_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "processing", label: "Processing" },         // প্রথম সেকশন
  { value: "pending_web", label: "Web Pending" },         // ওয়েবসাইট অর্ডারের জন্য
  { value: "pending", label: "Pending" },               // ম্যানুয়ালি বা বাল্ক সিলেক্ট করে পাঠানোর জন্য
  { value: "ready_order", label: "Ready Order" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "no_response", label: "No Response" },
  { value: "fraud", label: "Fraud" },
  { value: "incomplete", label: "Incomplete" },
  { value: "hold", label: "Hold" },
];
type OrderMeta = {
  source: string | null;
  status: string | null;
  customer_email: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_name: string | null;
  courier_id: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  web: "Web Order",
  woocommerce: "WooCommerce",
  facebook: "Facebook",
  instagram: "Instagram",
};

function sourceLabel(s: string | null | undefined) {
  if (!s) return "Manual";
  return SOURCE_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export function EditOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order: EditableOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [name, setName] = useState(order.customer_name);
  const [phone, setPhone] = useState(order.customer_phone);
  const [address, setAddress] = useState(order.customer_address);
  const [delivery, setDelivery] = useState(Number(order.delivery_charge));
  const [discount, setDiscount] = useState(Number(order.discount_amount));
  const [advance, setAdvance] = useState(Number(order.advance_amount));
  const [advanceSourceId, setAdvanceSourceId] = useState<string>(order.advance_source_id ?? "");
  const [advanceTxnId, setAdvanceTxnId] = useState<string>(order.advance_txn_id ?? "");
  const [advanceSources, setAdvanceSources] = useState<AdvanceSource[]>([]);
  const [invoiceNote, setInvoiceNote] = useState(order.invoice_note ?? "");
  const [internalNote, setInternalNote] = useState(order.internal_note ?? "");
  const [unmatched, setUnmatched] = useState<WebUnmatchedItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // null = "Add Item" picker; number = match this unmatched index
  const [matchTarget, setMatchTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [addToMembership, setAddToMembership] = useState(false);
  const { isMember } = useMembershipPhones();
  const { enabled: membershipDiscountEnabled, rate: membershipDiscountRate } = useMembershipDiscount();
  const bestTagDiscount = useBestTagDiscount(phone);
  const enrollMember = useServerFn(addMembershipCustomer);

  const [meta, setMeta] = useState<OrderMeta | null>(null);
  const [status, setStatus] = useState<string>(order.status ?? "processing");
  const [courierId, setCourierId] = useState<string>("");
  const [couriers, setCouriers] = useState<{ id: string; name: string }[]>([]);
  const [source, setSource] = useState<string>("");
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [preorder, setPreorder] = useState<boolean>(!!order.preorder);
  const [preorderDate, setPreorderDate] = useState<string>(order.preorder_date ?? "");
  const [isPaidMarketing, setIsPaidMarketing] = useState<boolean>(order.is_paid_marketing !== false);
  const [customerType, setCustomerType] = useState<"retail" | "wholesale">(
    order.customer_type === "wholesale" ? "wholesale" : "retail",
  );


  useEffect(() => {
    (async () => {
      try {
        const [{ data: prods }, { data: existing }, { data: ord }] = await Promise.all([
          supabase.from("products").select("id, name, sku, price, stock_quantity, image_url, category_id, has_variants, is_featured, product_variants(id, product_id, attributes, sku, price, stock_quantity, image_url, status)").eq("status", "active").order("name"),
          supabase.from("order_items").select("product_id, variant_id, quantity, unit_price, product_variants(attributes)").eq("order_id", order.id),
          supabase
            .from("orders")
            .select("source, status, customer_email, created_at, updated_at, created_by, courier_id")
            .eq("id", order.id)
            .maybeSingle(),
        ]);

        // Parse "[WEB_UNMATCHED]" / legacy "[Web items]" block out of internal note.
        const parsedUnmatched = parseUnmatchedFromNote(order.internal_note);
        setUnmatched(parsedUnmatched.items);
        setInternalNote(parsedUnmatched.noteWithoutBlock);

        const activeRows = ((prods ?? []) as unknown as Array<Product & { product_variants?: Variant[] }>).map((row) => ({
          ...row,
          variants: (row.product_variants ?? []).filter((v) => (v as { status?: string }).status !== "inactive"),
        })) as Product[];

        // Fetch any inactive products referenced by existing order items so name/image still show.
        const existingProductIds = Array.from(
          new Set(((existing ?? []) as Array<{ product_id: string }>).map((it) => it.product_id)),
        );
        const activeIds = new Set(activeRows.map((p) => p.id));
        const missingIds = existingProductIds.filter((id) => id && !activeIds.has(id));
        let inactiveRows: Product[] = [];
        if (missingIds.length > 0) {
          const { data: inactive } = await supabase
            .from("products")
            .select("id, name, sku, price, stock_quantity, image_url, category_id, has_variants, is_featured, product_variants(id, product_id, attributes, sku, price, stock_quantity, image_url, status)")
            .in("id", missingIds);
          inactiveRows = ((inactive ?? []) as unknown as Array<Product & { product_variants?: Variant[] }>).map((row) => ({
            ...row,
            name: `${row.name} (inactive)`,
            variants: (row.product_variants ?? []),
          })) as Product[];
        }
        setProducts([...activeRows, ...inactiveRows]);

        setItems(
          ((existing ?? []) as Array<{ product_id: string; variant_id: string | null; quantity: number; unit_price: number; product_variants: { attributes: Record<string, string> } | null }>).map((it) => ({
            product_id: it.product_id,
            variant_id: it.variant_id,
            variant_label: it.product_variants ? Object.values(it.product_variants.attributes ?? {}).join(" / ") : null,
            quantity: it.quantity,
            unit_price: Number(it.unit_price),
          })),
        );

        let createdByName: string | null = null;
        if (ord?.created_by) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", ord.created_by)
            .maybeSingle();
          createdByName = prof?.full_name ?? prof?.email ?? null;
        }
        setMeta({
          source: ord?.source ?? null,
          status: ord?.status ?? null,
          customer_email: ord?.customer_email ?? null,
          created_at: ord?.created_at ?? null,
          updated_at: ord?.updated_at ?? null,
          created_by_name: createdByName,
          courier_id: (ord as { courier_id?: string | null } | null)?.courier_id ?? null,
        });
        const existingCourier = (ord as { courier_id?: string | null } | null)?.courier_id ?? "";
        const { data: cours } = await supabase
          .from("couriers")
          .select("id, name, is_default")
          .eq("status", "active")
          .order("name");
        const courierRows = (cours ?? []) as { id: string; name: string; is_default?: boolean }[];
        setCouriers(courierRows.map((c) => ({ id: c.id, name: c.name })));
        if (existingCourier) {
          setCourierId(existingCourier);
        } else {
          const def = courierRows.find((c) => c.is_default);
          setCourierId(def ? def.id : "");
        }




        const currentSource = ord?.source ?? "";
        setSource(currentSource);
        const [{ data: srcs }, { data: advSrcs }] = await Promise.all([
          supabase.from("order_sources").select("name").eq("visible", true).order("name"),
          supabase.from("advance_payment_sources").select("id, name, requires_txn_id").eq("visible", true).order("sort_order").order("name"),
        ]);
        const srcNames = ((srcs ?? []) as { name: string }[]).map((s) => s.name);
        // Always include current source so it's selectable even if hidden/legacy.
        const merged = Array.from(new Set([...(currentSource ? [currentSource] : []), ...srcNames]));
        setSourceOptions(merged);
        setAdvanceSources((advSrcs ?? []) as AdvanceSource[]);
      } catch (e) {
        console.error("[EditOrderDialog] load failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [order.id, order.internal_note]);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0),
    [items],
  );
  const total = useMemo(
    () => subtotal + Number(delivery || 0) - Number(discount || 0),
    [subtotal, delivery, discount],
  );

  const addItem = () => setItems((s) => [...s, { product_id: "", quantity: 1, unit_price: 0 }]);
  const addProductFromPicker = (
    p: { id: string; name: string; price: number },
    v?: { id: string; price: number | null; attributes: Record<string, string> },
  ) => {
    // If we're matching an unmatched web item, take its qty + unit_price from the web payload.
    const target = matchTarget !== null ? unmatched[matchTarget] : null;
    const qty = target ? target.quantity : 1;
    const price = target ? target.unit_price : Number(v?.price ?? p.price);
    setItems((s) => {
      const idx = s.findIndex((it) => it.product_id === p.id && (it.variant_id ?? null) === (v?.id ?? null));
      if (idx >= 0) {
        return s.map((it, i) =>
          i === idx ? { ...it, quantity: it.quantity + qty } : it,
        );
      }
      return [
        ...s,
        {
          product_id: p.id,
          variant_id: v?.id ?? null,
          variant_label: v ? Object.values(v.attributes ?? {}).join(" / ") : null,
          quantity: qty,
          unit_price: price,
        },
      ];
    });
    if (matchTarget !== null) {
      setUnmatched((u) => u.filter((_, i) => i !== matchTarget));
      setMatchTarget(null);
      setPickerOpen(false);
    }
  };
  const discardUnmatched = (i: number) =>
    setUnmatched((u) => u.filter((_, idx) => idx !== i));
  const openMatchPicker = (i: number) => {
    setMatchTarget(i);
    setPickerOpen(true);
  };
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const onProductSelect = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateItem(i, {
      product_id: productId,
      variant_id: null,
      variant_label: null,
      unit_price: p ? Number(p.price) : 0,
    });
  };

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast.error("Customer name, phone, and address are required");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.product_id || it.quantity < 1)) {
      toast.error("Add at least one valid item");
      return;
    }
    const advNum = Number(advance || 0);
    const selectedAdvSrc = advanceSources.find((s) => s.id === advanceSourceId);
    if (advNum > 0 && !advanceSourceId) {
      toast.error("Advance payment method নির্বাচন করুন");
      return;
    }
    if (advNum > 0 && selectedAdvSrc?.requires_txn_id && !advanceTxnId.trim()) {
      toast.error(`${selectedAdvSrc.name}-এর জন্য Transaction ID বাধ্যতামূলক`);
      return;
    }
    setSaving(true);
    const isMembershipOrder = isMember(phone) || addToMembership;
    const manualDiscount = Number(discount || 0);
    const membershipDiscount = isMembershipOrder && membershipDiscountEnabled ? +(subtotal * membershipDiscountRate).toFixed(2) : 0;
    const tagDiscount = bestTagDiscount.rate > 0 ? +(subtotal * (bestTagDiscount.rate / 100)).toFixed(2) : 0;
    const totalDiscount = +(manualDiscount + membershipDiscount + tagDiscount).toFixed(2);
    const { error } = await supabase.rpc("update_order_with_items", {
      p_order_id: order.id,
      p_customer_name: name,
      p_customer_phone: phone,
      p_customer_address: address,
      p_delivery_charge: Number(delivery || 0),
      p_discount_amount: totalDiscount,
      p_advance_amount: Number(advance || 0),
      p_invoice_note: invoiceNote,
      p_internal_note: writeUnmatchedToNote(internalNote, unmatched) ?? "",
      p_items: items,
    });
    if (error) { setSaving(false); return toast.error(error.message); }
    const statusChanged = !!(status && status !== (order.status ?? meta?.status));
    const preorderChanged = preorder !== !!order.preorder;
    const preorderDateChanged = (preorderDate || null) !== (order.preorder_date ?? null);
    const currentCourier = meta?.courier_id ?? null;
    const nextCourier = courierId || null;
    const courierChanged = nextCourier !== currentCourier;
    const sourceChanged = (source || "") !== (meta?.source ?? "");
    const advSrcChanged = (advanceSourceId || null) !== (order.advance_source_id ?? null);
    const advTxnChanged = (advanceTxnId || "") !== (order.advance_txn_id ?? "");
    const paidMarketingChanged = isPaidMarketing !== (order.is_paid_marketing !== false);
    const customerTypeChanged = customerType !== (order.customer_type === "wholesale" ? "wholesale" : "retail");
    if (statusChanged || preorderChanged || preorderDateChanged || courierChanged || sourceChanged || advSrcChanged || advTxnChanged || paidMarketingChanged || customerTypeChanged) {
      const patch: { status?: string; preorder?: boolean; preorder_date?: string | null; courier_id?: string | null; source?: string | null; advance_source_id?: string | null; advance_txn_id?: string | null; is_paid_marketing?: boolean; customer_type?: string } = {};
      if (statusChanged) patch.status = status;
      if (preorderChanged) patch.preorder = preorder;
      if (preorderDateChanged || (preorderChanged && !preorder)) {
        patch.preorder_date = preorder ? (preorderDate || null) : null;
      }
      if (courierChanged) patch.courier_id = nextCourier;
      if (sourceChanged) patch.source = source || null;
      if (advNum > 0) {
        if (advSrcChanged) patch.advance_source_id = advanceSourceId || null;
        if (advTxnChanged) patch.advance_txn_id = advanceTxnId.trim() || null;
      } else {
        patch.advance_source_id = null;
        patch.advance_txn_id = null;
      }
      if (paidMarketingChanged) patch.is_paid_marketing = isPaidMarketing;
      if (customerTypeChanged) patch.customer_type = customerType;
      const { error: stErr } = await supabase.from("orders").update(patch as never).eq("id", order.id);
      if (stErr) {
        setSaving(false);
        return toast.error(`Status update failed: ${stErr.message}`);
      }
    }

    setSaving(false);
    if (addToMembership && phone.trim()) {
      try {
        await enrollMember({
          data: {
            name: name.trim() || null,
            phone: phone.trim(),
            address: address.trim() || null,
          },
        });
        invalidateMembershipPhones();
        toast.success("Customer added to Membership");
      } catch (e) {
        console.error("Add to membership failed", e);
      }
    }
    toast.success(`Order #${order.order_number} updated`);
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Edit Order #{order.order_number}
            {meta?.source && (
              <Badge variant="outline" className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[10px]">
                Source: {sourceLabel(meta.source)}
              </Badge>
            )}
            {meta?.created_by_name && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <User2 className="h-3 w-3" /> {meta.created_by_name}
              </Badge>
            )}
            {meta?.updated_at && (
              <span className="text-xs text-muted-foreground font-normal">
                Updated {new Date(meta.updated_at).toLocaleString()}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <BlockCustomerDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          defaultPhone={phone}
        />
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* MAIN FORM */}
            <div className="lg:col-span-2 space-y-4">
            {/* Unified action toolbar — all icon buttons on one line, equal sized */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5">
              {isMember(phone) ? (
                <MemberBadge phone={phone} />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddToMembership((v) => !v)}
                  title="Add this customer to Membership (10% auto discount on future orders)"
                  className={
                    "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors " +
                    (addToMembership
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-500"
                      : "border-border text-muted-foreground hover:text-amber-500 hover:border-amber-400/60")
                  }
                >
                  <Crown className="h-3.5 w-3.5" />
                  {addToMembership ? "Will be Member" : "Add to Membership"}
                </button>
              )}
              {phone.trim() && (
                <CustomerTagPicker phone={phone.trim()} buttonSize="xs" buttonLabel="Tags" />
              )}
              <PhoneContactButtons
                phone={phone}
                customerName={name}
                orderId={order.id}
                orderNumber={order.order_number}
              />
              <div className="ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setBlockOpen(true)}
                  disabled={!phone.trim()}
                  title="Block this customer"
                >
                  <ShieldAlert className="h-3.5 w-3.5" /> Block
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Customer Type:</Label>
              <div className="inline-flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCustomerType("retail")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${customerType === "retail" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                >
                  Retail
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerType("wholesale")}
                  className={`px-3 py-1 text-xs font-medium transition-colors border-l ${customerType === "wholesale" ? "bg-amber-500 text-white" : "bg-background hover:bg-muted"}`}
                >
                  Wholesale
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(toAsciiDigits(e.target.value))}
                  onBlur={() => {
                    const n = normalizeBDPhone(phone);
                    if (n && n !== phone) setPhone(n);
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (!text) return;
                    const { phone: extracted, rest } = extractBDPhone(text);
                    if (extracted) {
                      e.preventDefault();
                      setPhone(extracted);
                      if (rest) {
                        setAddress((prev: string) => (prev?.trim() ? `${prev}\n${rest}` : rest));
                      }
                    } else {
                      const ascii = toAsciiDigits(text);
                      if (ascii !== text) {
                        e.preventDefault();
                        setPhone(ascii);
                      }
                    }
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Shipping Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Invoice Note</Label>
                  <NoteTemplatePicker kind="invoice" onPick={(t) => setInvoiceNote((v) => (v ? `${v}\n${t}` : t))} />
                </div>
                <Textarea rows={2} value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Internal Note</Label>
                  <NoteTemplatePicker kind="internal" onPick={(t) => setInternalNote((v) => (v ? `${v}\n${t}` : t))} />
                </div>
                <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => { setMatchTarget(null); setPickerOpen(true); }}>
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </div>
              {unmatched.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-amber-300">Unmatched web items ({unmatched.length})</div>
                      <div className="text-xs text-amber-200/80">এগুলো ওয়েবসাইট থেকে এসেছে কিন্তু আপনার OMS প্রডাক্টের সাথে মেলেনি। Match করুন বা বাদ দিন।</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {unmatched.map((u, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border bg-background/60 px-2.5 py-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {u.sku && <span className="font-mono mr-2">SKU: {u.sku}</span>}
                            × {u.quantity} @ ৳{u.unit_price.toFixed(2)} = ৳{(u.quantity * u.unit_price).toFixed(2)}
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="default" className="h-7 gap-1" onClick={() => openMatchPicker(i)}>
                          <Link2 className="h-3 w-3" /> Match
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => discardUnmatched(i)} title="Discard">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">

                {items.map((it, i) => (
                  <OrderLineItemRow
                    key={i}
                    index={i}
                    line={it}
                    product={products.find((x) => x.id === it.product_id)}
                    products={products}
                    variantLabel={it.variant_label ?? null}
                    onProductChange={(idx, pid) => onProductSelect(idx, pid)}
                    onQuantityChange={(idx, qty) => updateItem(idx, { quantity: qty })}
                    onPriceChange={(idx, price) => updateItem(idx, { unit_price: price })}
                    onVariantChange={(idx, v) => {
                      const prod = products.find((x) => x.id === it.product_id);
                      updateItem(idx, {
                        variant_id: v?.id ?? null,
                        variant_label: v ? Object.values(v.attributes ?? {}).join(" / ") : null,
                        unit_price: v ? Number(v.price ?? prod?.price ?? it.unit_price) : Number(prod?.price ?? it.unit_price),
                      });
                    }}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Delivery</Label>
                <Input type="number" step="0.01" value={delivery} onChange={(e) => setDelivery(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Discount</Label>
                <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Advance</Label>
                <Input type="number" step="0.01" value={advance} onChange={(e) => setAdvance(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            {advance > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Method <span className="text-rose-400">*</span></Label>
                  <Select value={advanceSourceId || "__none__"} onValueChange={(v) => setAdvanceSourceId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select —</SelectItem>
                      {advanceSources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Transaction ID
                    {advanceSources.find((s) => s.id === advanceSourceId)?.requires_txn_id && (
                      <span className="text-rose-400"> *</span>
                    )}
                  </Label>
                  <Input value={advanceTxnId} onChange={(e) => setAdvanceTxnId(e.target.value)} placeholder="Optional reference" />
                </div>
              </div>
            )}




            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Paid Marketing Sale</Label>
                <p className="text-xs text-muted-foreground">
                  Facebook/Google ad থেকে এসেছে? Off করলে Organic হিসেবে count হবে।
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPaidMarketing}
                onClick={() => setIsPaidMarketing((v) => !v)}
                className={
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors " +
                  (isPaidMarketing ? "bg-emerald-500" : "bg-muted-foreground/30")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform " +
                    (isPaidMarketing ? "translate-x-5" : "translate-x-0.5")
                  }
                />
              </button>
            </div>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>৳ {subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-base"><span>Total</span><span>৳ {total.toFixed(2)}</span></div>
            </div>
            </div>


            {/* SIDEBAR */}
            <aside className="space-y-3">
              <CustomerInsightsPanel phone={phone} orderId={order.id} />
              {meta?.customer_email && (
                <div className="rounded-md border p-3 text-[11px] text-muted-foreground truncate bg-muted/30">
                  {meta.customer_email}
                </div>
              )}
            </aside>
          </div>
        )}

        {!loading && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Label className="text-xs font-semibold shrink-0">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 flex-1 max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs font-semibold shrink-0">Courier</Label>
            <Select value={courierId || "__none__"} onValueChange={(v) => setCourierId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No courier</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs font-semibold shrink-0">Source</Label>
            <Select value={source || "__none__"} onValueChange={(v) => setSource(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>
                ))}
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
            {preorder && (
              <div className="inline-flex items-center gap-1.5">
                <Label className="text-[11px] text-muted-foreground shrink-0">Due date</Label>
                <Input
                  type="date"
                  value={preorderDate}
                  onChange={(e) => setPreorderDate(e.target.value)}
                  className="h-8 w-[150px] text-xs"
                />
                {preorderDate && (
                  <button type="button" onClick={() => setPreorderDate("")} className="text-[10px] text-muted-foreground hover:text-foreground underline">clear</button>
                )}
              </div>
            )}
            {(status !== (order.status ?? meta?.status) || preorder !== !!order.preorder || (preorderDate || null) !== (order.preorder_date ?? null) || (courierId || null) !== (meta?.courier_id ?? null) || (source || "") !== (meta?.source ?? "")) && (
              <span className="text-[10px] text-amber-500 font-medium">Will be updated</span>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
      <ProductPickerDialog
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setMatchTarget(null); }}
        selectedIds={new Set(items.filter((it) => it.product_id).map((it) => it.variant_id ? `${it.product_id}:${it.variant_id}` : it.product_id))}
        onAdd={addProductFromPicker}
      />
    </Dialog>

  );
}
