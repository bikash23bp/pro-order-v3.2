import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ ids: z.string().optional() });

export const Route = createFileRoute("/_app/orders/bulk-invoice")({
  head: () => ({ meta: [{ title: "Bulk Invoices — OMS" }] }),
  validateSearch: searchSchema,
  component: BulkInvoicePage,
});

type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  subtotal: number;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  total_amount: number;
  invoice_note: string | null;
  created_at: string;
};

type Item = {
  id: string;
  order_id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; sku: string | null } | null;
  product_variants: { attributes: Record<string, string> | null; sku: string | null } | null;
};

function BulkInvoicePage() {
  const { ids } = Route.useSearch();
  const idList = (ids ?? "").split(",").filter(Boolean);
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (idList.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      const [{ data: os }, { data: its }] = await Promise.all([
        supabase.from("orders").select("*").in("id", idList).order("order_number"),
        supabase
          .from("order_items")
          .select("id, order_id, quantity, unit_price, products(name, sku, image_url), product_variants(attributes, sku, image_url)")
          .in("order_id", idList),
      ]);
      setOrders((os ?? []) as Order[]);
      const grouped: Record<string, Item[]> = {};
      ((its ?? []) as unknown as Item[]).forEach((it) => {
        (grouped[it.order_id] ??= []).push(it);
      });
      setItemsByOrder(grouped);
      setLoading(false);
    })();
  }, [ids]);

  useEffect(() => {
    if (!loading && orders.length > 0) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, orders.length]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading invoices…</div>;
  if (orders.length === 0) return <div className="p-8 text-muted-foreground">No orders selected.</div>;

  return (
    <div className="space-y-4 p-4">
      <style>{`@media print { .print-hide { display: none !important; } .invoice-page { page-break-after: always; } @page { margin: 12mm; } }`}</style>
      <div className="flex justify-between items-center print-hide">
        <h1 className="text-xl font-semibold">Bulk Invoices ({orders.length})</h1>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
      </div>
      {orders.map((o) => {
        const its = itemsByOrder[o.id] ?? [];
        const due = Number(o.total_amount) - Number(o.advance_amount);
        return (
          <div key={o.id} className="invoice-page bg-card border rounded-lg p-6 max-w-3xl mx-auto">
            <div className="flex justify-between items-start mb-6 pb-4 border-b">
              <div>
                <h2 className="text-2xl font-bold">Invoice</h2>
                <div className="text-sm text-muted-foreground">#{o.order_number}</div>
                <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{o.customer_name}</div>
                <div className="text-muted-foreground">{o.customer_phone}</div>
                <div className="text-muted-foreground whitespace-pre-line max-w-xs">{o.customer_address}</div>
              </div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {its.map((it) => {
                  const variantLabel = it.product_variants?.attributes
                    ? Object.values(it.product_variants.attributes).filter(Boolean).join(", ")
                    : null;
                  const sku = it.product_variants?.sku ?? it.products?.sku ?? null;
                  return (
                    <tr key={it.id} className="border-b">
                      <td className="py-2">
                        <div>{it.products?.name ?? "—"}</div>
                        {variantLabel && <div className="text-[11px] text-primary">{variantLabel}</div>}
                        {sku && <div className="text-[11px] text-muted-foreground">SKU: {sku}</div>}
                      </td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">৳ {Number(it.unit_price).toFixed(2)}</td>
                      <td className="py-2 text-right">৳ {(it.quantity * Number(it.unit_price)).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>৳ {Number(o.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>৳ {Number(o.delivery_charge).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-৳ {Number(o.discount_amount).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Advance</span><span>-৳ {Number(o.advance_amount).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2 text-base"><span>Due</span><span>৳ {due.toFixed(2)}</span></div>
            </div>
            {o.invoice_note && <div className="mt-4 text-xs text-muted-foreground border-t pt-3">{o.invoice_note}</div>}
          </div>
        );
      })}
    </div>
  );
}
