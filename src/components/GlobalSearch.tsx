import { useEffect, useRef, useState } from "react";
import { MemberBadge } from "@/components/MemberBadge";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OrderDetailDialog, type DetailOrder } from "@/components/orders/OrderDetailDialog";
import { toAsciiDigits, normalizeBDPhone } from "@/lib/phone-paste";

type HitItem = { quantity: number; products: { name: string } | null };
type Hit = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  order_sources: { name: string } | null;
  order_items: HitItem[] | null;
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [viewOrder, setViewOrder] = useState<DetailOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const termRaw = q.trim();
    if (!termRaw) { setHits([]); setOpen(false); return; }
    const term = toAsciiDigits(termRaw);
    setLoading(true);
    const myReqId = ++reqIdRef.current;
    const t = setTimeout(async () => {
      const digits = term.replace(/\D/g, "");
      const normPhone = normalizeBDPhone(termRaw);
      const like = `%${term.replace(/[%,()]/g, "")}%`;
      const filters: string[] = [`customer_name.ilike.${like}`];
      if (normPhone.length === 11 && normPhone.startsWith("01")) {
        const tail = normPhone.slice(-8);
        filters.push(`phone_normalized.eq.${normPhone}`);
        filters.push(`phone_normalized.ilike.%${tail}%`);
        filters.push(`customer_phone.ilike.%${tail}%`);
      } else if (digits.length >= 3) {
        const needle = digits.length >= 8 ? digits.slice(-8) : digits;
        filters.push(`phone_normalized.ilike.%${needle}%`);
        filters.push(`customer_phone.ilike.%${needle}%`);
        if (digits.length <= 9) filters.push(`order_number.eq.${parseInt(digits, 10)}`);
      }
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, customer_address, status, total_amount, created_at, order_sources(name), order_items(quantity, products(name))")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(8);
      // Ignore stale responses that resolved after a newer query started.
      if (myReqId !== reqIdRef.current) return;
      setHits((data ?? []) as unknown as Hit[]);
      setLoading(false);
      setOpen(true);
    }, 300);
    return () => {
      clearTimeout(t);
      // Invalidate any in-flight request from this effect run.
      reqIdRef.current++;
    };
  }, [q]);


  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openOrder = async (id: string) => {
    setLoadingOrderId(id);
    try {
      const { data: o, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, consignment_id, invoice_note, internal_note, is_paid_marketing")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!o) { toast.error("Order not found"); return; }
      setOpen(false);
      setQ("");
      setViewOrder(o as unknown as DetailOrder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoadingOrderId(null);
    }
  };

  const statusTone = (s: string) => {
    if (s === "completed") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    if (s === "cancelled" || s === "returned" || s === "fraud") return "bg-destructive/15 text-destructive border-destructive/30";
    if (s === "processing" || s === "pending" || s === "pending_web") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (hits.length) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) openOrder(hits[0].id); }}
          placeholder="Search by name or phone…"
          className="pl-8 h-9"
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-[min(720px,calc(100vw-2rem))] rounded-md border bg-popover shadow-xl z-50 overflow-hidden max-h-[75vh] overflow-y-auto">
          {hits.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No results.</div>
          ) : (
            hits.map((h) => {
              const items = h.order_items ?? [];
              const productSummary = items
                .map((it) => `${it.products?.name ?? "—"}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`)
                .join(", ");
              const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => openOrder(h.id)}
                  disabled={loadingOrderId === h.id}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b last:border-b-0 disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{h.customer_name}</span>
                      <MemberBadge phone={h.customer_phone} />
                      <Badge variant="outline" className={`text-[10px] ${statusTone(h.status)}`}>
                        {h.status}
                      </Badge>
                      {h.order_sources?.name && (
                        <Badge variant="secondary" className="text-[10px]">{h.order_sources.name}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground">#{h.order_number}</span>
                      <span className="text-sm font-bold tabular-nums">৳{Number(h.total_amount ?? 0).toFixed(0)}</span>
                      {loadingOrderId === h.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mb-1">
                    <span className="tabular-nums">{h.customer_phone}</span>
                    <span>·</span>
                    <span className="tabular-nums">{new Date(h.created_at).toLocaleDateString()}</span>
                    {totalQty > 0 && (
                      <>
                        <span>·</span>
                        <span>{totalQty} item{totalQty > 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                  {productSummary && (
                    <div className="text-xs text-foreground/80 truncate">{productSummary}</div>
                  )}
                  {h.customer_address && (
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">📍 {h.customer_address}</div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
      {viewOrder && (
        <OrderDetailDialog order={viewOrder} onClose={() => setViewOrder(null)} />
      )}
    </div>
  );
}

