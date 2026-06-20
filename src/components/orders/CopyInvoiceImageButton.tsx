import { useState } from "react";
import { createRoot } from "react-dom/client";
import { toBlob, toJpeg } from "html-to-image";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  findInvoiceTemplate,
  generateQrDataUrl,
  type PrintItem,
  type PrintOrder,
} from "@/lib/print-templates";

type Props = { orderId: string };

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function CopyInvoiceImageButton({ orderId }: Props) {
  const [busy, setBusy] = useState<null | "copy" | "download">(null);

  const renderInvoice = async () => {
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-99999px;top:0;background:#ffffff;color:#000;z-index:-1;";
    document.body.appendChild(host);
    const root = createRoot(host);

    const cleanup = () => {
      root.unmount();
      host.remove();
    };

    const [
      { data: settings },
      { data: o },
      { data: its },
      { data: couriers },
    ] = await Promise.all([
      supabase.from("app_settings").select("active_invoice_template, logo_url, business_name, business_phone, business_address, invoice_prefix, invoice_suffix, invoice_include_year, invoice_pad_length, invoice_seq, invoice_year").maybeSingle(),
      supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
      supabase
        .from("order_items")
        .select(
          "id, order_id, quantity, unit_price, products(name, sku, image_url), product_variants(attributes, sku, image_url)",
        )
        .eq("order_id", orderId),
      supabase.from("couriers").select("id, name, invoice_template_id"),
    ]);

    if (!o) {
      cleanup();
      throw new Error("Order not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = settings as any;
    const courierMap: Record<string, { name: string; invoice_template_id: string | null }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((couriers ?? []) as any[]).forEach((c) => {
      courierMap[c.id] = { name: c.name, invoice_template_id: c.invoice_template_id };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderAny = o as any;
    const courierEntry = orderAny.courier_id ? courierMap[orderAny.courier_id] : null;
    const tplId = courierEntry?.invoice_template_id ?? s?.active_invoice_template ?? null;
    const tpl = findInvoiceTemplate(tplId);

    let createdByName = "Unknown";
    if (orderAny.created_by) {
      const { data: names } = await supabase.rpc(
        "get_user_display_names",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { p_ids: [orderAny.created_by] } as any,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdByName = ((names ?? []) as any[])[0]?.display_name ?? "Unknown";
    }

    const printOrder: PrintOrder = {
      ...orderAny,
      created_by_name: createdByName,
      logo_url: s?.logo_url ?? null,
      business_name: s?.business_name ?? null,
      business_phone: s?.business_phone ?? null,
      business_address: s?.business_address ?? null,
      courier_name: courierEntry?.name ?? null,
    };
    const items = (its ?? []) as unknown as PrintItem[];
    const qr = await generateQrDataUrl(
      printOrder.invoice_number ?? `#${printOrder.order_number}`,
    );

    await new Promise<void>((resolve) => {
      root.render(
        <div
          data-invoice-capture
          style={{
            background: "#ffffff",
            display: "block",
            width: "fit-content",
            boxSizing: "content-box",
          }}
        >
          {tpl.render(printOrder, items, qr)}
        </div>,
      );
      requestAnimationFrame(() => setTimeout(resolve, 250));
    });

    const imgs = Array.from(host.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(() => resolve(), 2500);
          }),
      ),
    );

    const wrapper = host.firstElementChild as HTMLElement | null;
    const node = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
    if (!node) {
      cleanup();
      throw new Error("Render failed");
    }

    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width) || node.offsetWidth;
    const height = Math.ceil(rect.height) || node.offsetHeight;

    return { node, width, height, printOrder, cleanup };
  };

  const handleCopy = async () => {
    if (busy) return;
    setBusy("copy");
    let cleanup: (() => void) | null = null;
    try {
      const r = await renderInvoice();
      cleanup = r.cleanup;
      const blob = await toBlob(r.node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: false,
        imagePlaceholder: TRANSPARENT_PX,
        skipFonts: true,
        width: r.width,
        height: r.height,
        style: { margin: "0", transform: "none" },
      });
      if (!blob || typeof ClipboardItem === "undefined") {
        throw new Error("Clipboard not available in this browser");
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.success("Invoice copied — paste in chat (Ctrl/Cmd+V)");
    } catch (e) {
      console.error("Copy invoice failed", e);
      toast.error(e instanceof Error ? e.message : "Failed to copy invoice");
    } finally {
      cleanup?.();
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (busy) return;
    setBusy("download");
    let cleanup: (() => void) | null = null;
    try {
      const r = await renderInvoice();
      cleanup = r.cleanup;
      const jpgUrl = await toJpeg(r.node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        quality: 0.95,
        cacheBust: false,
        imagePlaceholder: TRANSPARENT_PX,
        skipFonts: true,
        width: r.width,
        height: r.height,
        style: { margin: "0", transform: "none" },
      });
      const a = document.createElement("a");
      a.href = jpgUrl;
      a.download = `invoice-${r.printOrder.invoice_number ?? r.printOrder.order_number}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Invoice saved as JPG");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download invoice");
    } finally {
      cleanup?.();
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={handleCopy} disabled={!!busy}>
        {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        Copy Invoice
      </Button>
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={!!busy}>
        {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download JPG
      </Button>
    </div>
  );
}
 
