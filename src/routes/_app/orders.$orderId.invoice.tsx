import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer, ArrowLeft, Truck, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pushToSteadfast } from "@/lib/courier.functions";

type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  advance_amount: number;
  delivery_charge: number;
  total_amount: number;
  consignment_id: string | null;
  tracking_url: string | null;
  invoice_note: string | null;
  created_at: string;
};

type Item = {
  id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; sku: string | null } | null;
  product_variants: { attributes: Record<string, string> | null; sku: string | null } | null;
};

export const Route = createFileRoute("/_app/orders/$orderId/invoice")({
  head: () => ({ meta: [{ title: "Invoice — OMS" }] }),
  component: InvoicePage,
});

function InvoicePage() {
  const { orderId } = useParams({ from: "/_app/orders/$orderId/invoice" });
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const pushFn = useServerFn(pushToSteadfast);

  const load = async () => {
    setLoading(true);
    const [{ data: o, error: oe }, { data: it, error: ie }] = await Promise.all([
      supabase.from("orders").select("id, order_number, customer_name, customer_phone, customer_email, customer_address, status, subtotal, discount_amount, advance_amount, delivery_charge, total_amount, consignment_id, tracking_url, invoice_note, created_at").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("id, quantity, unit_price, products(name, sku, image_url), product_variants(attributes, sku, image_url)").eq("order_id", orderId),
    ]);
    if (oe) toast.error(oe.message);
    if (ie) toast.error(ie.message);
    setOrder((o ?? null) as Order | null);
    setItems((it ?? []) as unknown as Item[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orderId]);

  const onPush = async () => {
    setPushing(true);
    try {
      const res = await pushFn({ data: { orderId } });
      if (res.ok) {
        toast.success(res.message || "Pushed to courier");
        load();
      } else {
        toast.error(res.error || "Failed to push");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushing(false);
    }
  };

  if (loading) return <div className="text-muted-foreground p-6">Loading invoice…</div>;
  if (!order) return <div className="text-muted-foreground p-6">Order not found.</div>;

  const due = Number(order.total_amount) - Number(order.advance_amount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders"><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>
        <div className="flex gap-2">
          {!order.consignment_id && (
            <Button onClick={onPush} disabled={pushing} variant="secondary">
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Push to Steadfast
            </Button>
          )}
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
        </div>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border p-6 sm:p-10 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-0 print:bg-white print:text-black">
        <header className="flex items-start justify-between gap-4 pb-6 border-b">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">INVOICE</h1>
            <p className="text-sm text-muted-foreground print:text-gray-600">OMS — Order Management</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-mono font-semibold">#{order.order_number}</div>
            <div className="text-muted-foreground print:text-gray-600">
              {new Date(order.created_at).toLocaleDateString()}
            </div>
            <Badge variant="outline" className="mt-1 capitalize">{order.status.replace(/_/g, " ")}</Badge>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground print:text-gray-600 mb-1">Bill To</div>
            <div className="font-medium">{order.customer_name}</div>
            <div className="text-sm text-muted-foreground print:text-gray-700">{order.customer_phone}</div>
            {order.customer_email && <div className="text-sm text-muted-foreground print:text-gray-700">{order.customer_email}</div>}
            <div className="text-sm whitespace-pre-line mt-1">{order.customer_address}</div>
          </div>
          <div className="flex sm:justify-end">
            <div className="text-center">
              <QRCodeSVG value={order.id} size={112} bgColor="transparent" fgColor="currentColor" />
              <div className="text-[10px] font-mono text-muted-foreground print:text-gray-600 mt-1">Scan for Order ID</div>
              {order.consignment_id && (
                <div className="text-[10px] mt-1">Consignment: <span className="font-mono">{order.consignment_id}</span></div>
              )}
            </div>
          </div>
        </section>

        <section className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground print:text-gray-600 border-b">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const variantLabel = it.product_variants?.attributes
                  ? Object.values(it.product_variants.attributes).filter(Boolean).join(", ")
                  : null;
                const sku = it.product_variants?.sku ?? it.products?.sku ?? null;
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{it.products?.name ?? "—"}</div>
                      {variantLabel && <div className="text-xs text-primary print:text-gray-800">{variantLabel}</div>}
                      {sku && <div className="text-xs text-muted-foreground print:text-gray-600">SKU: {sku}</div>}
                    </td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2 text-right">৳ {Number(it.unit_price).toFixed(2)}</td>
                    <td className="py-2 text-right font-medium">৳ {(it.quantity * Number(it.unit_price)).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={Number(order.subtotal)} />
          <Row label="Delivery" value={Number(order.delivery_charge)} />
          <Row label="Discount" value={-Number(order.discount_amount)} />
          <Row label="Advance Paid" value={-Number(order.advance_amount)} />
          <div className="flex justify-between pt-2 mt-2 border-t font-semibold text-base">
            <span>Amount Due</span>
            <span>৳ {due.toFixed(2)}</span>
          </div>
        </section>

        {order.invoice_note && (
          <section className="mt-6 pt-4 border-t text-xs text-muted-foreground print:text-gray-700">
            <span className="font-semibold">Note:</span> {order.invoice_note}
          </section>
        )}

        <footer className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground print:text-gray-600">
          Thank you for your purchase.
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground print:text-gray-700">
      <span>{label}</span>
      <span>৳ {value.toFixed(2)}</span>
    </div>
  );
}
