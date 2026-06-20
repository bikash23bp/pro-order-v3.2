import type { ReactElement } from "react";
import Barcode from "react-barcode";

export type PrintOrder = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  subtotal: number;
  delivery_charge: number;
  discount_amount: number;
  advance_amount: number;
  total_amount: number;
  invoice_note: string | null;
  internal_note?: string | null;
  created_at: string;
  created_by_name?: string | null;
  logo_url?: string | null;
  business_name?: string | null;
  business_phone?: string | null;
  business_address?: string | null;
  consignment_id?: string | null;
  courier_name?: string | null;
};


export type PrintItem = {
  id: string;
  order_id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; sku: string | null; image_url?: string | null } | null;
  product_variants?: { attributes: Record<string, string> | null; sku: string | null; image_url?: string | null } | null;
};

function variantLabelOf(it: PrintItem): string | null {
  const attrs = it.product_variants?.attributes;
  if (!attrs) return null;
  const values = Object.values(attrs).filter(Boolean) as string[];
  return values.length ? values.join(", ") : null;
}
function skuOf(it: PrintItem): string | null {
  return it.product_variants?.sku ?? it.products?.sku ?? null;
}
function imageOf(it: PrintItem): string | null {
  return it.product_variants?.image_url ?? it.products?.image_url ?? null;
}

export type TemplateMeta = {
  id: string;
  name: string;
  paper: string;
  description: string;
  render: (order: PrintOrder, items: PrintItem[], qrDataUrl: string) => ReactElement;
};

const fmt = (n: number) => `৳ ${Number(n || 0).toFixed(2)}`;

export async function generateQrDataUrl(text: string): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const { default: QRCode } = await import("qrcode");
    return await QRCode.toDataURL(text, { margin: 1, width: 200 });
  } catch {
    return "";
  }
}

export function PrintMetaBanner(_: { order: PrintOrder; compact?: boolean }) {
  return null;
}

/* =====================================================================
 *  STYLE THEMES — each invoice/sticker model picks a theme + layout flag,
 *  but the underlying SYSTEM (header / customer / items / totals / note)
 *  is identical.
 * ===================================================================== */

type ThemeName = "ink" | "indigo" | "emerald" | "crimson" | "slate" | "amber" | "rose" | "teal" | "violet" | "mono";
type HeaderLayout = "split" | "stacked" | "centered" | "banner";

type Theme = {
  accentBg: string;     // header / total bar bg
  accentText: string;   // text on accent bg
  accentBorder: string; // border color class
  soft: string;         // very light tint for zebra/summary
  ring: string;         // outline frame
};

const THEMES: Record<ThemeName, Theme> = {
  ink:     { accentBg: "bg-black",       accentText: "text-white", accentBorder: "border-black",       soft: "bg-gray-50",      ring: "border-black" },
  indigo:  { accentBg: "bg-indigo-700",  accentText: "text-white", accentBorder: "border-indigo-700",  soft: "bg-indigo-50",    ring: "border-indigo-700" },
  emerald: { accentBg: "bg-emerald-700", accentText: "text-white", accentBorder: "border-emerald-700", soft: "bg-emerald-50",   ring: "border-emerald-700" },
  crimson: { accentBg: "bg-rose-700",    accentText: "text-white", accentBorder: "border-rose-700",    soft: "bg-rose-50",      ring: "border-rose-700" },
  slate:   { accentBg: "bg-slate-800",   accentText: "text-white", accentBorder: "border-slate-800",   soft: "bg-slate-100",    ring: "border-slate-800" },
  amber:   { accentBg: "bg-amber-600",   accentText: "text-white", accentBorder: "border-amber-600",   soft: "bg-amber-50",     ring: "border-amber-600" },
  rose:    { accentBg: "bg-pink-600",    accentText: "text-white", accentBorder: "border-pink-600",    soft: "bg-pink-50",      ring: "border-pink-600" },
  teal:    { accentBg: "bg-teal-700",    accentText: "text-white", accentBorder: "border-teal-700",    soft: "bg-teal-50",      ring: "border-teal-700" },
  violet:  { accentBg: "bg-violet-700",  accentText: "text-white", accentBorder: "border-violet-700",  soft: "bg-violet-50",    ring: "border-violet-700" },
  mono:    { accentBg: "bg-white",       accentText: "text-black", accentBorder: "border-black",       soft: "bg-gray-100",     ring: "border-black" },
};

/* ============== SHARED BUILDING BLOCKS ============== */

function Header({ o, t, layout, density = "md" }: { o: PrintOrder; t: Theme; layout: HeaderLayout; density?: "sm" | "md" }) {
  const logoSize = density === "sm" ? "h-10 w-10" : "h-14 w-14";
  const titleSize = density === "sm" ? "text-[12px]" : "text-[14px]";
  const textSize = density === "sm" ? "text-[8px]" : "text-[10px]";

  const Brand = (
    <div className="flex items-start gap-2 min-w-0">
      {o.logo_url ? (
        <img src={o.logo_url} alt="Logo" className={`${logoSize} object-contain shrink-0`} />
      ) : (
        <div className={`${logoSize} border border-dashed border-gray-400 flex items-center justify-center text-[7px] text-gray-400 shrink-0`}>LOGO</div>
      )}
      <div className="leading-tight min-w-0">
        <div className={`font-bold ${titleSize}`}>{o.business_name || "Your Business"}</div>
        {o.business_phone && <div className={textSize}>📞 {o.business_phone}</div>}
        {o.business_address && <div className={`${textSize} whitespace-pre-line`}>📍 {o.business_address}</div>}
      </div>
    </div>
  );

  const Meta = (
    <div className={`${textSize} leading-tight shrink-0`}>
      <div><span className="font-semibold">Date:</span> {new Date(o.created_at).toLocaleString()}</div>
      <div><span className="font-semibold">Invoice #:</span> <span className="font-mono">{o.invoice_number ?? `ORD-${o.order_number}`}</span></div>
      <div className={`mt-1 inline-block ${t.accentBg} ${t.accentText} px-1.5 py-0.5 rounded`}>
        Created By: {(o.created_by_name ?? "").trim() || "Unknown"}
      </div>
    </div>
  );

  if (layout === "banner") {
    return (
      <div className={`${t.accentBg} ${t.accentText} -mx-2 -mt-2 px-3 py-2 mb-2 flex items-start justify-between gap-2`}>
        <div className="flex items-start gap-2 min-w-0">
          {o.logo_url
            ? <img src={o.logo_url} alt="Logo" className={`${logoSize} object-contain bg-white p-0.5 rounded shrink-0`} />
            : <div className={`${logoSize} bg-white/20 flex items-center justify-center text-[7px] shrink-0`}>LOGO</div>}
          <div className="leading-tight min-w-0">
            <div className={`font-bold ${titleSize}`}>{o.business_name || "Your Business"}</div>
            {o.business_phone && <div className={textSize}>📞 {o.business_phone}</div>}
            {o.business_address && <div className={`${textSize} whitespace-pre-line opacity-90`}>📍 {o.business_address}</div>}
          </div>
        </div>
        <div className={`${textSize} text-right leading-tight shrink-0`}>
          <div><span className="font-semibold">Date:</span> {new Date(o.created_at).toLocaleString()}</div>
          <div><span className="font-semibold">Invoice #:</span> <span className="font-mono">{o.invoice_number ?? `ORD-${o.order_number}`}</span></div>
          <div className="mt-1 inline-block bg-white/20 px-1.5 py-0.5 rounded">By: {(o.created_by_name ?? "").trim() || "Unknown"}</div>
        </div>
      </div>
    );
  }

  if (layout === "stacked") {
    return (
      <div className={`border-b-2 ${t.accentBorder} pb-2 mb-2 text-center`}>
        <div className="flex items-center justify-center gap-2">{Brand}</div>
        <div className="mt-1 flex justify-center">{Meta}</div>
      </div>
    );
  }

  if (layout === "centered") {
    return (
      <div className={`border-b-2 ${t.accentBorder} pb-2 mb-2`}>
        <div className="text-center">{o.logo_url ? <img src={o.logo_url} alt="Logo" className={`${logoSize} object-contain mx-auto`} /> : null}
          <div className={`font-bold ${titleSize}`}>{o.business_name || "Your Business"}</div>
          {o.business_phone && <div className={textSize}>📞 {o.business_phone}</div>}
          {o.business_address && <div className={`${textSize}`}>📍 {o.business_address}</div>}
        </div>
        <div className={`${textSize} flex justify-between mt-2 border-t pt-1`}>
          <div><span className="font-semibold">Date:</span> {new Date(o.created_at).toLocaleString()}</div>
          <div><span className="font-semibold">Invoice #:</span> <span className="font-mono">{o.invoice_number ?? `ORD-${o.order_number}`}</span></div>
          <div>By: <span className="font-semibold">{(o.created_by_name ?? "").trim() || "Unknown"}</span></div>
        </div>
      </div>
    );
  }

  // split (default)
  const parcelId = o.consignment_id?.trim();
  const courier = o.courier_name?.trim();
  const showParcel = parcelId || courier;
  return (
    <div className={`flex items-start justify-between border-b-2 ${t.accentBorder} pb-2 mb-2 gap-2`}>
      {Brand}
      {showParcel && (
        <div className={`${textSize} leading-tight border ${t.accentBorder} rounded px-2 py-1 font-mono self-center mx-2`}>
          {courier && <div><span className="font-bold">Courier:</span> {courier}</div>}
          <div><span className="font-bold">Parcel ID:</span> {parcelId || "N/A"}</div>
        </div>
      )}
      <div className="text-right">{Meta}</div>
    </div>
  );
}


function Recipient({ o, t, density = "md" }: { o: PrintOrder; t: Theme; density?: "sm" | "md" }) {
  const barcodeValue = o.invoice_number || `ORD-${o.order_number}`;
  const height = density === "sm" ? 36 : 48;
  return (
    <div className={`mb-2 p-2 rounded ${t.soft} flex items-start justify-between gap-3`}>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase opacity-70 mb-0.5">Bill To / Recipient</div>
        <div className="font-bold text-[12px]">{o.customer_name}</div>
        <div className="text-[10px]">📞 {o.customer_phone}</div>
        <div className="text-[10px] whitespace-pre-line">📍 {o.customer_address}</div>
      </div>
      <div className="bg-white p-1 rounded shrink-0">
        <Barcode value={barcodeValue} format="CODE128" width={1.3} height={height} fontSize={9} margin={0} displayValue />
      </div>
    </div>
  );
}

function ParcelBar({ o, t }: { o: PrintOrder; t: Theme; density?: "sm" | "md" }) {
  const parcelId = o.consignment_id?.trim() || "N/A";
  const courier = o.courier_name?.trim();
  return (
    <div className="mb-2">
      <div className={`border ${t.accentBorder} px-2 py-1 text-[10px] font-mono leading-tight inline-block`}>
        <div><span className="font-bold">Invoice #:</span> {o.invoice_number ?? `ORD-${o.order_number}`}</div>
        <div><span className="font-bold">Parcel ID:</span> {parcelId}</div>
        {courier && <div><span className="font-bold">Courier:</span> {courier}</div>}
      </div>
    </div>
  );
}


function ItemsTable({ its, t, density = "md", showImage = true }: { its: PrintItem[]; t: Theme; density?: "sm" | "md"; showImage?: boolean }) {
  const sz = density === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <table className={`w-full border-collapse mb-2 ${sz}`}>
      <thead>
        <tr className={`${t.accentBg} ${t.accentText}`}>
          {showImage && <th className={`border ${t.accentBorder} p-1 text-left w-12`}>Pic</th>}
          <th className={`border ${t.accentBorder} p-1 text-left`}>Product</th>
          <th className={`border ${t.accentBorder} p-1 text-right w-10`}>Qty</th>
          <th className={`border ${t.accentBorder} p-1 text-right w-16`}>Price</th>
          <th className={`border ${t.accentBorder} p-1 text-right w-20`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {its.map((it, idx) => {
          const vl = variantLabelOf(it);
          const sku = skuOf(it);
          const img = imageOf(it);
          return (
            <tr key={it.id} className={idx % 2 ? t.soft : ""}>
              {showImage && (
                <td className={`border ${t.accentBorder} p-1`}>
                  {img ? (
                    <img src={img} alt="" className="h-8 w-8 object-cover rounded border" />
                  ) : (
                    <div className="h-8 w-8 bg-gray-100 border rounded" />
                  )}
                </td>
              )}
              <td className={`border ${t.accentBorder} p-1`}>
                <div className="font-bold">{it.products?.name ?? "—"}</div>
                {vl && <div className="italic font-semibold">{vl}</div>}
                {sku && <div className="text-[8px] opacity-70">SKU: {sku}</div>}
              </td>
              <td className={`border ${t.accentBorder} p-1 text-right font-semibold`}>{it.quantity}</td>
              <td className={`border ${t.accentBorder} p-1 text-right`}>{fmt(it.unit_price)}</td>
              <td className={`border ${t.accentBorder} p-1 text-right font-bold`}>{fmt(it.quantity * it.unit_price)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SummaryAndNote({ o, t }: { o: PrintOrder; t: Theme }) {
  const due = Number(o.total_amount) - Number(o.advance_amount);
  return (
    <div className="mb-2">
      <div className="flex justify-end">
        <table className="text-[11px] border-collapse">
          <tbody>
            <tr><td className="px-2 py-0.5 text-right">Sub Total:</td><td className="px-2 py-0.5 text-right font-mono w-24">{fmt(o.subtotal)}</td></tr>
            <tr><td className="px-2 py-0.5 text-right">Delivery Fee:</td><td className="px-2 py-0.5 text-right font-mono">{fmt(o.delivery_charge)}</td></tr>
            {Number(o.discount_amount) > 0 && (
              <tr><td className="px-2 py-0.5 text-right">Discount:</td><td className="px-2 py-0.5 text-right font-mono">- {fmt(o.discount_amount)}</td></tr>
            )}
            {Number(o.advance_amount) > 0 && (
              <tr><td className="px-2 py-0.5 text-right">Advance:</td><td className="px-2 py-0.5 text-right font-mono">- {fmt(o.advance_amount)}</td></tr>
            )}
            <tr className={`${t.accentBg} ${t.accentText}`}>
              <td className="px-2 py-1 text-right font-bold">Due Amount:</td>
              <td className="px-2 py-1 text-right font-mono font-bold">{fmt(due)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryWithNoteSideBySide({ o, t }: { o: PrintOrder; t: Theme }) {
  const due = Number(o.total_amount) - Number(o.advance_amount);
  return (
    <div className="flex items-start gap-2 mb-2">
      {/* বাম দিকে — Shipping Note */}
      <div className="flex-1">
        <div className={`border-2 border-dashed ${t.accentBorder} p-2 rounded h-full min-h-[60px]`}>
          {o.invoice_note?.trim() ? (
            <>
              <div className="font-bold text-[11px]">📝 Shipping Note:</div>
              <div className="italic font-semibold leading-snug text-[11px]">
                {o.invoice_note.trim()}
              </div>
            </>
          ) : (
            <div className="font-bold text-[11px]">📝 Shipping Note:</div>
          )}
        </div>
      </div>
      {/* ডান দিকে — Totals */}
      <div className="shrink-0">
        <table className="text-[11px] border-collapse">
          <tbody>
            <tr><td className="px-2 py-0.5 text-right">Sub Total:</td><td className="px-2 py-0.5 text-right font-mono w-24">{fmt(o.subtotal)}</td></tr>
            <tr><td className="px-2 py-0.5 text-right">Delivery Fee:</td><td className="px-2 py-0.5 text-right font-mono">{fmt(o.delivery_charge)}</td></tr>
            {Number(o.discount_amount) > 0 && (
              <tr><td className="px-2 py-0.5 text-right">Discount:</td><td className="px-2 py-0.5 text-right font-mono">- {fmt(o.discount_amount)}</td></tr>
            )}
            {Number(o.advance_amount) > 0 && (
              <tr><td className="px-2 py-0.5 text-right">Advance:</td><td className="px-2 py-0.5 text-right font-mono">- {fmt(o.advance_amount)}</td></tr>
            )}
            <tr className={`${t.accentBg} ${t.accentText}`}>
              <td className="px-2 py-1 text-right font-bold">Due Amount:</td>
              <td className="px-2 py-1 text-right font-mono font-bold">{fmt(due)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============== INVOICE RENDERER ============== */

function Invoice({
  o, its, width, minHeight, density = "md", theme, layout, showImage = true, noteSideBySide = false,
}: {
  o: PrintOrder; its: PrintItem[]; width: string; minHeight?: string;
  density?: "sm" | "md"; theme: ThemeName; layout: HeaderLayout; showImage?: boolean; noteSideBySide?: boolean;
}) {
  const t = THEMES[theme];
  return (
    <div
      style={{ width, minHeight, padding: density === "sm" ? "4mm" : "8mm" }}
      className={`bg-white text-black text-[11px] font-sans border-2 ${t.ring}`}
    >
      <Header o={o} t={t} layout={layout} density={density} />
      <Recipient o={o} t={t} density={density} />

      <ItemsTable its={its} t={t} density={density} showImage={showImage} />
      {noteSideBySide ? <SummaryWithNoteSideBySide o={o} t={t} /> : <SummaryAndNote o={o} t={t} />}
    </div>
  );
}

/* ============== STICKER RENDERER ============== */

function Sticker({
  o, its, qr, width, height, theme, layout, showItems, showImage = false,
}: {
  o: PrintOrder; its: PrintItem[]; qr: string; width: string; height: string;
  theme: ThemeName; layout: HeaderLayout; showItems?: boolean; showImage?: boolean;
}) {
  const t = THEMES[theme];
  const due = Number(o.total_amount) - Number(o.advance_amount);

  return (
    <div
      style={{ width, height, padding: "2.5mm" }}
      className={`bg-white text-black text-[9px] font-sans border-2 ${t.ring} flex flex-col overflow-hidden`}
    >
      {/* Brand header */}
      {layout === "banner" ? (
        <div className={`${t.accentBg} ${t.accentText} -mx-1 -mt-1 px-1.5 py-1 mb-1 flex items-center justify-between gap-1`}>
          <div className="flex items-center gap-1 min-w-0">
            {o.logo_url
              ? <img src={o.logo_url} alt="" className="h-7 w-7 object-contain bg-white p-0.5 rounded shrink-0" />
              : <div className="h-7 w-7 bg-white/20 rounded shrink-0" />}
            <div className="font-bold text-[10px] truncate">{o.business_name || "Your Business"}</div>
          </div>
          <div className="text-[7px] text-right leading-tight">
            <div className="font-mono">{o.invoice_number ?? `#${o.order_number}`}</div>
            <div>By: {(o.created_by_name ?? "").trim() || "—"}</div>
          </div>
        </div>
      ) : (
        <div className={`flex items-start justify-between border-b ${t.accentBorder} pb-1 mb-1 gap-1`}>
          <div className="flex items-start gap-1 min-w-0">
            {o.logo_url
              ? <img src={o.logo_url} alt="" className="h-8 w-8 object-contain shrink-0" />
              : <div className="h-8 w-8 border border-dashed border-gray-400 shrink-0" />}
            <div className="leading-tight min-w-0 text-[8px]">
              <div className="font-bold text-[10px] truncate">{o.business_name || "Your Business"}</div>
              {o.business_phone && <div>📞 {o.business_phone}</div>}
              {o.business_address && <div className="truncate">📍 {o.business_address}</div>}
            </div>
          </div>
          <div className="text-right text-[7px] leading-tight shrink-0">
            <div className="font-mono">{o.invoice_number ?? `#${o.order_number}`}</div>
            <div>{new Date(o.created_at).toLocaleDateString()}</div>
            <div className={`${t.accentBg} ${t.accentText} px-1 rounded mt-0.5`}>By: {(o.created_by_name ?? "").trim() || "—"}</div>
          </div>
        </div>
      )}

      {/* Recipient + QR */}
      <div className="flex justify-between gap-2 mb-1">
        <div className={`min-w-0 flex-1 text-[9px] leading-snug p-1 rounded ${t.soft}`}>
          <div className="font-bold">{o.customer_name}</div>
          <div>📞 {o.customer_phone}</div>
          <div className="whitespace-pre-line">📍 {o.customer_address}</div>
        </div>
        {qr && <img src={qr} alt="QR" className="w-14 h-14 shrink-0" />}
      </div>

      {/* Invoice barcode + Parcel ID (courier consignment id) */}
      <div className="mb-1">
        <div className="text-[8px] font-mono mb-0.5 flex justify-between gap-1">
          <span><span className="font-bold">Inv:</span> {o.invoice_number ?? `ORD-${o.order_number}`}</span>
          <span><span className="font-bold">Parcel:</span> {o.consignment_id?.trim() || "N/A"}</span>
        </div>
        {o.courier_name?.trim() && (
          <div className="text-[8px] font-mono mb-0.5"><span className="font-bold">Courier:</span> {o.courier_name.trim()}</div>
        )}
        <Barcode value={o.invoice_number || `ORD-${o.order_number}`} format="CODE128" width={1} height={22} fontSize={8} margin={0} displayValue />
      </div>


      {/* Items (optional) */}
      {showItems && (
        <div className={`text-[8px] border-t ${t.accentBorder} pt-0.5 mb-0.5 space-y-0.5`}>
          {its.slice(0, 3).map(it => {
            const vl = variantLabelOf(it);
            const img = imageOf(it);
            return (
              <div key={it.id} className="flex items-center gap-1">
                {showImage && (img
                  ? <img src={img} alt="" className="h-5 w-5 object-cover rounded border shrink-0" />
                  : <div className="h-5 w-5 bg-gray-100 border rounded shrink-0" />)}
                <span className="truncate flex-1">
                  <span className="font-bold">{it.products?.name}</span>
                  {vl && <span className="italic"> · {vl}</span>}
                </span>
                <span className="font-semibold">×{it.quantity}</span>
                <span className="font-bold">{fmt(it.quantity * it.unit_price)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Totals */}
      <div className={`flex justify-between text-[9px] ${t.accentBg} ${t.accentText} px-1 py-0.5 rounded`}>
        <span>Sub: {fmt(o.subtotal)} · Dlv: {fmt(o.delivery_charge)}</span>
        <span className="font-bold">Due: {fmt(due)}</span>
      </div>

      {/* Shipping Note — only when set */}
      {o.invoice_note?.trim() && (
        <div className={`mt-1 border border-dashed ${t.accentBorder} p-1 rounded`}>
          <div className="text-[8px] font-bold">📝 Note:</div>
          <div className="text-[8px] italic font-semibold leading-tight line-clamp-2">
            {o.invoice_note.trim()}
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
 *  INVOICE TEMPLATES — same system, different visual models
 * ===================================================================== */

const mkInvoice = (
  id: string, name: string, paper: string, description: string,
  width: string, minHeight: string | undefined, density: "sm" | "md",
  theme: ThemeName, layout: HeaderLayout, showImage = true, noteSideBySide = false,
): TemplateMeta => ({
  id, name, paper, description,
  render: (o, its) => <Invoice o={o} its={its} width={width} minHeight={minHeight} density={density} theme={theme} layout={layout} showImage={showImage} noteSideBySide={noteSideBySide} />,
});

export const INVOICE_TEMPLATES: TemplateMeta[] = [
  mkInvoice("invoice-steadfast-ef", "SteadFast EF (A5)", "A5", "Classic black & white split header.", "148mm", "210mm", "md", "ink", "split", true, true),
  mkInvoice("invoice-a4-standard", "Indigo Modern (A4)", "A4", "Indigo accent, split header with product images.", "210mm", "297mm", "md", "indigo", "split"),
  mkInvoice("invoice-a4-modern", "Emerald Banner (A4)", "A4", "Bold emerald top banner.", "210mm", "297mm", "md", "emerald", "banner"),
  mkInvoice("invoice-a4-minimal", "Slate Centered (A4)", "A4", "Centered brand, compact density.", "210mm", "297mm", "sm", "slate", "centered"),
  mkInvoice("invoice-a5-compact", "Crimson Compact (A5)", "A5", "Bold red accents, dense layout.", "148mm", "210mm", "sm", "crimson", "split"),
  mkInvoice("invoice-a5-boxed", "Amber Banner (A5)", "A5", "Warm amber banner header.", "148mm", "210mm", "md", "amber", "banner"),
  mkInvoice("invoice-pos-80", "Mono POS 80mm", "80mm", "Thermal slip, no images.", "80mm", undefined, "sm", "mono", "stacked", false),
  mkInvoice("invoice-pos-58", "Ink POS 58mm", "58mm", "Narrow thermal slip.", "58mm", undefined, "sm", "ink", "stacked", false),
  mkInvoice("invoice-thermal-receipt", "Teal Receipt 80mm", "80mm", "Teal-accented thermal receipt.", "80mm", undefined, "sm", "teal", "stacked", false),
  mkInvoice("invoice-branded", "Violet Branded (A4)", "A4", "Violet brand-forward banner.", "210mm", "297mm", "md", "violet", "banner"),
  mkInvoice("invoice-dual-column", "Rose Editorial (A4)", "A4", "Pink centered editorial style.", "210mm", "297mm", "md", "rose", "centered"),
];

/* =====================================================================
 *  STICKER TEMPLATES — same system, different visual models
 * ===================================================================== */

const mkSticker = (
  id: string, name: string, paper: string, description: string,
  width: string, height: string, theme: ThemeName, layout: HeaderLayout,
  showItems = false, showImage = false,
): TemplateMeta => ({
  id, name, paper, description,
  render: (o, its, qr) => <Sticker o={o} its={its} qr={qr} width={width} height={height} theme={theme} layout={layout} showItems={showItems} showImage={showImage} />,
});

export const STICKER_TEMPLATES: TemplateMeta[] = [
  mkSticker("sticker-4x3-standard", "Ink 4×3 Standard", "4×3 in", "Black & white classic.", "4in", "3in", "ink", "split"),
  mkSticker("sticker-4x3-items", "Indigo 4×3 Items", "4×3 in", "Indigo accent with item summary.", "4in", "3in", "indigo", "split", true, true),
  mkSticker("sticker-4x3-note", "Emerald 4×3 Banner", "4×3 in", "Emerald banner header.", "4in", "3in", "emerald", "banner"),
  mkSticker("sticker-4x3-barcode", "Crimson 4×3 Bold", "4×3 in", "Bold red accents.", "4in", "3in", "crimson", "split"),
  mkSticker("sticker-4x3-qr-prominent", "Slate 4×3 QR", "4×3 in", "Slate accent, large QR.", "4in", "3in", "slate", "split"),
  mkSticker("sticker-3x2-standard", "Ink 3×2 Compact", "3×2 in", "Compact B&W.", "3in", "2in", "ink", "split"),
  mkSticker("sticker-3x2-items", "Amber 3×2 Items", "3×2 in", "Amber compact with items.", "3in", "2in", "amber", "split", true, true),
  mkSticker("sticker-3x2-note", "Teal 3×2 Banner", "3×2 in", "Teal banner compact.", "3in", "2in", "teal", "banner"),
  mkSticker("sticker-3x2-minimal", "Violet 3×2 Minimal", "3×2 in", "Violet minimal.", "3in", "2in", "violet", "split"),
  mkSticker("sticker-3x2-dual-qr", "Rose 3×2 Editorial", "3×2 in", "Pink editorial compact.", "3in", "2in", "rose", "banner"),
];

export function findInvoiceTemplate(id: string | null | undefined): TemplateMeta {
  return INVOICE_TEMPLATES.find(t => t.id === id) ?? INVOICE_TEMPLATES[0];
}
export function findStickerTemplate(id: string | null | undefined): TemplateMeta {
  return STICKER_TEMPLATES.find(t => t.id === id) ?? STICKER_TEMPLATES[0];
}
