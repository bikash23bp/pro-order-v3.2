import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  findInvoiceTemplate, findStickerTemplate, generateQrDataUrl, PrintMetaBanner,
  type PrintOrder, type PrintItem, type TemplateMeta,
} from "@/lib/print-templates";

const searchSchema = z.object({
  ids: z.string().optional(),
  type: z.enum(["invoice", "sticker"]).default("invoice"),
});

export const Route = createFileRoute("/_app/orders/bulk-print")({
  head: () => ({ meta: [{ title: "Bulk Print — OMS" }] }),
  validateSearch: searchSchema,
  component: BulkPrintPage,
});

function BulkPrintPage() {
  const { ids, type } = Route.useSearch();
  const idList = (ids ?? "").split(",").filter(Boolean);
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, PrintItem[]>>({});
  const [qrByOrder, setQrByOrder] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<TemplateMeta | null>(null);
  const [templateByOrder, setTemplateByOrder] = useState<Record<string, TemplateMeta>>({});
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (idList.length === 0) { setLoading(false); return; }
    (async () => {
      try {
        const [{ data: settings }, { data: os }, { data: its }, { data: couriers }] = await Promise.all([
          supabase.from("app_settings").select("active_invoice_template, active_sticker_template, logo_url, business_name, business_phone, business_address").maybeSingle(),
          supabase.from("orders").select("id, order_number, invoice_number, customer_name, customer_phone, customer_address, subtotal, delivery_charge, discount_amount, advance_amount, total_amount, invoice_note, internal_note, created_at, created_by, consignment_id, courier_id").in("id", idList).order("order_number"),

          supabase.from("order_items").select("id, order_id, quantity, unit_price, products(name, sku, image_url), product_variants(attributes, sku, image_url)").in("order_id", idList),
          supabase.from("couriers").select("id, name, sticker_template_id, invoice_template_id"),
        ]);
        const s = settings as any;
        const tpl = type === "sticker"
          ? findStickerTemplate(s?.active_sticker_template)
          : findInvoiceTemplate(s?.active_invoice_template);
        setTemplate(tpl);
        const logoUrl: string | null = s?.logo_url ?? null;
        const businessName: string | null = s?.business_name ?? null;
        const businessPhone: string | null = s?.business_phone ?? null;
        const businessAddress: string | null = s?.business_address ?? null;
        const courierMap: Record<string, string> = {};
        const courierStickerMap: Record<string, string | null> = {};
        const courierInvoiceMap: Record<string, string | null> = {};
        ((couriers ?? []) as Array<{ id: string; name: string; sticker_template_id: string | null; invoice_template_id: string | null }>).forEach(c => {
          courierMap[c.id] = c.name;
          courierStickerMap[c.id] = c.sticker_template_id;
          courierInvoiceMap[c.id] = c.invoice_template_id;
        });

        const rawOrders = (os ?? []) as (PrintOrder & { created_by?: string | null; courier_id?: string | null })[];
        const creatorIds = Array.from(new Set(rawOrders.map(o => o.created_by).filter(Boolean))) as string[];
        const nameMap: Record<string, string> = {};
        if (creatorIds.length) {
          const { data: names } = await supabase.rpc("get_user_display_names", { p_ids: creatorIds } as any);
          ((names ?? []) as Array<{ id: string; display_name: string }>).forEach(r => { nameMap[r.id] = r.display_name; });
        }
        const ordersList: PrintOrder[] = rawOrders.map(o => ({
          ...o,
          created_by_name: o.created_by ? (nameMap[o.created_by] ?? "Unknown") : "Unknown",
          logo_url: logoUrl,
          business_name: businessName,
          business_phone: businessPhone,
          business_address: businessAddress,
          courier_name: o.courier_id ? (courierMap[o.courier_id] ?? null) : null,
        }));

        // Per-order template: use courier-specific template when set
        const perOrder: Record<string, TemplateMeta> = {};
        rawOrders.forEach(o => {
          const overrideId = o.courier_id
            ? (type === "sticker" ? courierStickerMap[o.courier_id] : courierInvoiceMap[o.courier_id])
            : null;
          perOrder[o.id] = overrideId
            ? (type === "sticker" ? findStickerTemplate(overrideId) : findInvoiceTemplate(overrideId))
            : tpl;
        });
        setTemplateByOrder(perOrder);

        setOrders(ordersList);

        const grouped: Record<string, PrintItem[]> = {};
        ((its ?? []) as unknown as PrintItem[]).forEach((it) => {
          (grouped[it.order_id] ??= []).push(it);
        });
        setItemsByOrder(grouped);

        const qrs: Record<string, string> = {};
        await Promise.all(ordersList.map(async (o) => {
          qrs[o.id] = await generateQrDataUrl(o.invoice_number ?? `#${o.order_number}`);
        }));
        setQrByOrder(qrs);
      } finally {
        setLoading(false);
      }
    })();
  }, [ids, type]);

  useEffect(() => {
    if (!loading && orders.length > 0 && template) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, orders.length, template]);

  if (loading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Preparing print layout…</div>;
  if (orders.length === 0) return <div className="p-8 text-muted-foreground">No orders selected.</div>;
  if (!template) return <div className="p-8 text-muted-foreground">No active template.</div>;

  return (
    <div>
      <style>{`
        @media screen { body { background: #f3f4f6; } .print-page { margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,0.1); } }
        @media print {
          .print-hide { display: none !important; }
          .print-page { page-break-after: always; break-after: page; margin: 0 !important; box-shadow: none !important; border: none !important; }
          .print-page:last-child { page-break-after: auto; }
          @page { margin: 0; }
          body { background: white !important; }
        }
      `}</style>
      <div className="print-hide flex items-center justify-between p-3 bg-card border-b sticky top-0 z-10">
        <div className="text-sm">
          Bulk {type === "sticker" ? "Stickers" : "Invoices"} · {orders.length} order(s) · Template: <b>{template.name}</b>
        </div>
        <Button onClick={() => window.print()} size="sm"><Printer className="h-4 w-4" />Print</Button>
      </div>
      <div>
        {orders.map((o) => {
          const tplForOrder = templateByOrder[o.id] ?? template;
          return (
            <div key={o.id} className="print-page">
              {tplForOrder.id !== "invoice-steadfast-ef" && (
                <PrintMetaBanner order={o} compact={type === "sticker"} />
              )}
              {tplForOrder.render(o, itemsByOrder[o.id] ?? [], qrByOrder[o.id] ?? "")}
            </div>
          );
        })}
      </div>

    </div>
  );
}
