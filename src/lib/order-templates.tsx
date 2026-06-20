import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import {
  Eye, Pencil, Trash2, FileText, Phone, Truck, StickyNote, Crown, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MemberBadge } from "@/components/MemberBadge";
import { DuplicateBadge } from "@/components/orders/DuplicateBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ----------------- Types -----------------

export type OrderStatus =
  | "pending" | "pending_web" | "ready_order" | "processing" | "ready_to_ship" | "out_of_stock" | "shipped"
  | "completed" | "cancelled" | "cancel_request" | "returned" | "no_response" | "fraud" | "hold" | "incomplete";

export type OrderForTemplate = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: OrderStatus;
  total_amount: number;
  subtotal: number;
  delivery_charge: number;
  created_at: string;
  consignment_id: string | null;
  tracking_url: string | null;
  internal_note: string | null;
  preorder: boolean | null;
  order_items: Array<{
    quantity: number;
    unit_price: number;
    products: { name: string; image_url?: string | null } | null;
    product_variants?: { image_url: string | null; attributes: Record<string, string> | null } | null;
  }> | null;
};

export type OrderTemplateFlags = {
  isSelected: boolean;
  isAdmin: boolean;
  isVip: boolean;
  isDuplicate: boolean;
  isRepeat: boolean;
  isDispatchStatus: boolean;
  courierFailed: boolean;
  creatorLabel: string;
  editorLabel: string | null;
};

export type OrderTemplateActions = {
  toggleOne: (id: string) => void;
  onView: (o: OrderForTemplate) => void;
  onEdit: (o: OrderForTemplate) => void;
  onSetProfilePhone: (phone: string) => void;
  onEditNote: (args: { id: string; order_number: number; note: string }) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, next: OrderStatus | "__preorder", prev: OrderStatus) => void;
};

export type OrderTemplateProps = {
  order: OrderForTemplate;
  flags: OrderTemplateFlags;
  actions: OrderTemplateActions;
};

export type OrderTemplateSurface = "desktop" | "mobile";

export type OrderTemplateMeta = {
  id: string;
  name: string;
  description: string;
  surface: OrderTemplateSurface;
  render: (p: OrderTemplateProps) => ReactElement;
};

// ----------------- Shared constants -----------------

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  pending_web: "Web Pending",
  ready_order: "Ready Order",
  processing: "Processing",
  ready_to_ship: "Ready to Ship",
  out_of_stock: "Out of Stock",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
  cancel_request: "Cancel Request",
  returned: "Returned",
  no_response: "No Response",
  fraud: "Fraud",
  hold: "Hold",
  incomplete: "Incomplete",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/15 text-black border-yellow-500/30",
  pending_web: "bg-amber-500/15 text-black border-amber-500/30",
  ready_order: "bg-amber-600/15 text-black border-amber-600/30",
  processing: "bg-yellow-500/15 text-black border-yellow-500/30",
  ready_to_ship: "bg-blue-500/15 text-black border-blue-500/30",
  out_of_stock: "bg-purple-500/15 text-black border-purple-500/30",
  shipped: "bg-indigo-500/15 text-black border-indigo-500/30",
  completed: "bg-emerald-500/15 text-black border-emerald-500/30",
  cancelled: "bg-red-500/15 text-black border-red-500/30",
  cancel_request: "bg-pink-500/15 text-black border-pink-500/30",
  returned: "bg-orange-500/15 text-black border-orange-500/30",
  no_response: "bg-orange-500/15 text-black border-orange-500/30",
  fraud: "bg-rose-500/15 text-black border-rose-500/30",
  hold: "bg-amber-500/15 text-black border-amber-500/30",
  incomplete: "bg-amber-700/15 text-black border-amber-700/30",
};

// ----------------- Helpers -----------------

/** "Nov 23, 2025, 11:45 PM" — English, 12-hour, midnight shows as 12:00 AM */
export function formatOrderDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}

function StatusSelect({ order, actions, size = "default" }: {
  order: OrderForTemplate; actions: OrderTemplateActions; size?: "default" | "sm";
}) {
  const currentValue = order.preorder ? "__preorder" : order.status;
  const toneClass = order.preorder
    ? "bg-violet-500/15 text-black border-violet-500/30"
    : (STATUS_TONE[order.status] ?? "");
  return (
    <Select value={currentValue} onValueChange={(v) => actions.onUpdateStatus(order.id, v as OrderStatus, order.status)}>
      <SelectTrigger className={`${size === "sm" ? "h-6 px-1.5 text-[10px] min-w-[110px]" : "h-7 px-2 text-xs min-w-[130px]"} w-auto shrink-0 border ${toneClass}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <SelectItem key={k} value={k}>{v}</SelectItem>
        ))}
        <SelectItem value="__preorder">Pre-Order</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CustomerBadges({ order, flags, actions }: OrderTemplateProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <button
        className="font-semibold text-primary hover:underline text-left truncate max-w-full"
        onClick={() => actions.onSetProfilePhone(order.customer_phone)}
      >
        {order.customer_name}
      </button>
      <MemberBadge phone={order.customer_phone} />
      {flags.isVip && (
        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1 py-0">
          <Crown className="h-3 w-3" /> VIP
        </Badge>
      )}
      {flags.isDuplicate && <DuplicateBadge />}
      {flags.isRepeat && (
        <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px] px-1 py-0">
          Repeat
        </Badge>
      )}
      {order.preorder && (
        <Badge variant="outline" className="bg-violet-500/15 text-violet-400 border-violet-500/30 text-[10px] px-1 py-0">
          Pre-Order
        </Badge>
      )}
    </div>
  );
}

function ItemsList({ order, dense = false }: { order: OrderForTemplate; dense?: boolean }) {
  const items = order.order_items ?? [];
  if (items.length === 0) return null;
  const size = dense ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className={`space-y-1.5 ${dense ? "" : "pt-2 mt-1 border-t border-dashed border-border/60"}`}>
      {items.map((it, i) => {
        const img = it.product_variants?.image_url ?? it.products?.image_url ?? null;
        const attrs = it.product_variants?.attributes;
        const variantLabel = attrs && typeof attrs === "object"
          ? Object.values(attrs).filter(Boolean).join(", ")
          : "";
        return (
          <div key={i} className="flex items-center gap-2">
            {img ? (
              <img
                src={img}
                alt={it.products?.name ?? ""}
                loading="lazy"
                className={`${size} rounded-md border border-border/60 object-cover bg-muted shrink-0`}
              />
            ) : (
              <div className={`${size} rounded-md border border-border/60 bg-muted flex items-center justify-center shrink-0`}>
                <Package className="h-4 w-4 text-muted-foreground/60" />
              </div>
            )}
            <div className="flex-1 min-w-0 text-xs">
              <div className="block max-w-full truncate font-medium text-foreground/90">{it.products?.name ?? "—"}</div>
              {variantLabel && (
                <div className="block max-w-full truncate text-[11px] text-muted-foreground/90">{variantLabel}</div>
              )}
              <div className="text-[11px] text-muted-foreground font-mono">
                ৳{(Number(it.unit_price) * it.quantity).toFixed(0)}
              </div>
            </div>
            <span className="text-xs font-semibold tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-muted/70">
              ×{it.quantity}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InternalNoteBlock({ order, actions }: { order: OrderForTemplate; actions: OrderTemplateActions }) {
  if (order.internal_note) {
    return (
      <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/15 px-2.5 py-2 shadow-sm">
        <div className="flex items-center gap-1.5 mb-1">
          <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Internal Note
          </span>
          <button
            type="button"
            className="ml-auto text-[10px] text-amber-700 dark:text-amber-300 hover:underline"
            onClick={() => actions.onEditNote({ id: order.id, order_number: order.order_number, note: order.internal_note ?? "" })}
          >
            Edit
          </button>
        </div>
        <div className="text-xs font-medium text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words">
          {order.internal_note}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      onClick={() => actions.onEditNote({ id: order.id, order_number: order.order_number, note: "" })}
    >
      <StickyNote className="h-3 w-3" /> Add note
    </button>
  );
}

function PlainNoteBlock({ order, actions }: { order: OrderForTemplate; actions: OrderTemplateActions }) {
  if (order.internal_note) {
    return (
      <div className="text-xs text-foreground whitespace-pre-wrap break-words">
        <span className="font-semibold">Note: </span>{order.internal_note}
        <button
          type="button"
          className="ml-2 text-[11px] text-muted-foreground hover:text-foreground underline"
          onClick={() => actions.onEditNote({ id: order.id, order_number: order.order_number, note: order.internal_note ?? "" })}
        >
          Edit
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      onClick={() => actions.onEditNote({ id: order.id, order_number: order.order_number, note: "" })}
    >
      <StickyNote className="h-3 w-3" /> Add note
    </button>
  );
}

function PriceBreakdown({ order, className = "" }: { order: OrderForTemplate; className?: string }) {
  const delivery = Number(order.delivery_charge ?? 0);
  const subtotal = Number(order.subtotal ?? 0);
  const total = Number(order.total_amount);
  if (delivery > 0 && subtotal > 0) {
    return (
      <span className={`tabular-nums ${className}`}>
        <span className="text-muted-foreground font-normal">৳{subtotal.toFixed(0)}+৳{delivery.toFixed(0)}=</span>
        ৳{total.toFixed(0)}
      </span>
    );
  }
  return <span className={`tabular-nums ${className}`}>৳{total.toFixed(0)}</span>;
}

function CreatorEditorLine({ flags, className = "" }: { flags: OrderTemplateFlags; className?: string }) {
  return (
    <div className={`text-[10px] text-muted-foreground leading-tight ${className}`}>
      <div className="truncate">Created by {flags.creatorLabel}</div>
      {flags.editorLabel && <div className="truncate">Edited by {flags.editorLabel}</div>}
    </div>
  );
}

function CourierBlock({ order, flags }: { order: OrderForTemplate; flags: OrderTemplateFlags }) {
  if (!flags.isDispatchStatus) return <span className="text-muted-foreground/60 text-xs">—</span>;
  if (flags.courierFailed) {
    return (
      <div className="space-y-1">
        <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 text-[10px] px-1.5 py-0">
          Sent Failed
        </Badge>
        <div className="text-[11px] text-destructive/80">No consignment ID returned.</div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="font-mono text-[11px] break-all">{order.consignment_id}</div>
      {order.tracking_url ? (
        <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-[11px]">
          <Truck className="h-3 w-3" /> Tracking Link
        </a>
      ) : (
        <span className="text-muted-foreground text-[11px]">No tracking link</span>
      )}
    </div>
  );
}

function ActionRow({ order, flags, actions, size = "default" }: OrderTemplateProps & { size?: "default" | "sm" }) {
  const cls = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <div className="inline-flex gap-0.5 shrink-0">
      <Button size="icon" variant="ghost" className={cls} onClick={() => actions.onView(order)}><Eye className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={cls} onClick={() => actions.onEdit(order)}><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={cls} asChild>
        <Link to="/orders/$orderId/invoice" params={{ orderId: order.id }}><FileText className="h-4 w-4" /></Link>
      </Button>
      {flags.isAdmin && (
        <Button size="icon" variant="ghost" className={cls} onClick={() => actions.onDelete(order.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

// =================================================================
// DESKTOP TEMPLATES
// =================================================================

function DesktopCardPremium(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`group relative rounded-xl border bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${
      flags.courierFailed ? "border-destructive/40 bg-destructive/5"
        : flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent border-b border-border/40 flex-wrap">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} aria-label="Select row" />
        <span className="font-mono text-sm font-semibold shrink-0">#{order.order_number}</span>
        {order.invoice_number && <span className="font-mono text-[10px] text-muted-foreground tracking-wide truncate max-w-[140px]">{order.invoice_number}</span>}
        <div className="ml-auto flex items-center gap-3 shrink-0 flex-wrap justify-end">
          <StatusSelect order={order} actions={actions} />
          <PriceBreakdown order={order} className="font-bold text-lg tabular-nums whitespace-nowrap shrink-0" />
        </div>
      </div>
      <div className="px-4 py-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:gap-6">
        <div className="space-y-2 min-w-0">
          <CustomerBadges {...p} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <a href={`tel:${order.customer_phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground truncate">
              <Phone className="h-3 w-3 shrink-0" />{order.customer_phone}
            </a>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2">{order.customer_address}</div>
          <ItemsList order={order} />
          <InternalNoteBlock order={order} actions={actions} />
        </div>
        <div className="space-y-2 text-xs md:border-l md:border-border/40 md:pl-4 min-w-0">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Courier</div>
            <CourierBlock order={order} flags={flags} />
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            Created by: <span className="font-medium text-foreground/80">{flags.creatorLabel}</span>
          </div>
          {flags.editorLabel && (
            <div className="text-[11px] text-muted-foreground truncate">
              Edited by: <span className="font-medium text-foreground/80">{flags.editorLabel}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border/40 bg-muted/20">
        <div className="text-[11px] text-muted-foreground">{formatOrderDate(order.created_at)}</div>
        <ActionRow {...p} />
      </div>
    </div>
  );
}

function DesktopCardCompact(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-lg border bg-card px-3 py-2 flex items-center gap-3 flex-wrap hover:bg-muted/30 transition-colors ${
      flags.courierFailed ? "border-destructive/40" : flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
      <span className="font-mono text-xs font-semibold w-16 shrink-0">#{order.order_number}</span>
      <div className="min-w-0 flex-1 basis-[220px]">
        <PriceBreakdown order={order} className="block text-xs font-bold tabular-nums text-foreground/90 mb-0.5" />
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <CustomerBadges {...p} />
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 min-w-0">
          <span className="shrink-0">{order.customer_phone}</span>
          <span className="shrink-0">·</span>
          <span className="truncate">{(order.order_items ?? []).map(i => `${i.products?.name ?? "—"} ×${i.quantity}`).join(", ")}</span>
        </div>
        <div className="mt-1">
          <PlainNoteBlock order={order} actions={actions} />
        </div>
      </div>
      <div className="hidden xl:block text-[11px] text-muted-foreground w-32 truncate shrink-0">
        {flags.creatorLabel}
        {flags.editorLabel && <span className="block text-[10px]">✎ {flags.editorLabel}</span>}
      </div>
      <div className="text-[11px] text-muted-foreground whitespace-nowrap hidden lg:block shrink-0">{formatOrderDate(order.created_at)}</div>
      <StatusSelect order={order} actions={actions} size="sm" />
      <ActionRow {...p} size="sm" />
    </div>
  );
}

function DesktopTableClassic(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`grid grid-cols-[auto_80px_1fr_1fr_140px_120px_100px_auto] items-center gap-3 px-3 py-2.5 border bg-card text-sm ${
      flags.courierFailed ? "border-destructive/40 bg-destructive/5" : flags.isSelected ? "border-primary/50 bg-primary/5" : "border-border/60"
    }`}>
      <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
      <span className="font-mono font-semibold">#{order.order_number}</span>
      <div className="min-w-0">
        <CustomerBadges {...p} />
        <div className="text-[11px] text-muted-foreground">{order.customer_phone}</div>
      </div>
      <div className="min-w-0 text-xs text-muted-foreground truncate">
        {(order.order_items ?? []).slice(0, 2).map((i) => `${i.products?.name ?? "—"} ×${i.quantity}`).join(", ")}
        {(order.order_items?.length ?? 0) > 2 && ` +${(order.order_items?.length ?? 0) - 2}`}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatOrderDate(order.created_at)}
        <CreatorEditorLine flags={flags} />
      </div>
      <StatusSelect order={order} actions={actions} size="sm" />
      <PriceBreakdown order={order} className="font-bold tabular-nums text-right" />
      <ActionRow {...p} size="sm" />
    </div>
  );
}

function DesktopSplitPanel(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-xl border bg-card overflow-hidden grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] ${
      flags.courierFailed ? "border-destructive/40" : flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <div className="bg-muted/40 p-4 space-y-2 border-r border-border/40 min-w-0">
        <div className="flex items-center gap-2">
          <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
          <span className="font-mono text-xs font-semibold">#{order.order_number}</span>
        </div>
        <CustomerBadges {...p} />
        <div className="text-xs text-muted-foreground min-w-0">
          <a href={`tel:${order.customer_phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 shrink-0" />{order.customer_phone}
          </a>
        </div>
        <div className="text-xs text-muted-foreground line-clamp-3">{order.customer_address}</div>
        <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/40 truncate">
          {formatOrderDate(order.created_at)} · {flags.creatorLabel}
          {flags.editorLabel && <span> · ✎ {flags.editorLabel}</span>}
        </div>
      </div>
      <div className="p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <StatusSelect order={order} actions={actions} />
          <PriceBreakdown order={order} className="font-bold text-xl tabular-nums shrink-0" />
        </div>
        <ItemsList order={order} />
        <CourierBlock order={order} flags={flags} />
        <InternalNoteBlock order={order} actions={actions} />
        <div className="flex justify-end pt-2 border-t border-border/40">
          <ActionRow {...p} />
        </div>
      </div>
    </div>
  );
}

function DesktopDarkLuxury(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-xl border overflow-hidden bg-slate-950 text-slate-100 shadow-lg ${
      flags.isSelected ? "ring-1 ring-amber-500/60 border-amber-500/40" : "border-slate-800"
    }`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent flex-wrap">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
        <span className="font-mono text-sm font-semibold text-amber-300 shrink-0">#{order.order_number}</span>
        {order.invoice_number && <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">{order.invoice_number}</span>}
        <div className="ml-auto flex items-center gap-3 shrink-0 flex-wrap justify-end">
          <StatusSelect order={order} actions={actions} />
          <PriceBreakdown order={order} className="font-bold text-lg tabular-nums text-amber-300 shrink-0" />
        </div>
      </div>
      <div className="px-4 py-3 grid md:grid-cols-2 gap-4">
        <div className="space-y-2 min-w-0">
          <CustomerBadges {...p} />
          <div className="text-xs text-slate-400 truncate"><Phone className="h-3 w-3 inline mr-1" />{order.customer_phone}</div>
          <div className="text-xs text-slate-400 line-clamp-2">{order.customer_address}</div>
          <ItemsList order={order} />
        </div>
        <div className="space-y-2 text-xs min-w-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-300/70 mb-1">Courier</div>
            <CourierBlock order={order} flags={flags} />
          </div>
          <InternalNoteBlock order={order} actions={actions} />
          <div className="text-[11px] text-slate-400 truncate">
            By {flags.creatorLabel}
            {flags.editorLabel && <span> · ✎ {flags.editorLabel}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-slate-900/40">
        <span className="text-[11px] text-slate-500">{formatOrderDate(order.created_at)}</span>
        <ActionRow {...p} />
      </div>
    </div>
  );
}

function DesktopMinimalLine(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`py-3 border-b border-border/40 ${flags.isSelected ? "bg-primary/5" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
        <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">#{order.order_number}</span>
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <CustomerBadges {...p} />
            <span className="text-[11px] text-muted-foreground truncate">· {order.customer_phone}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {formatOrderDate(order.created_at)} · {flags.creatorLabel}
            {flags.editorLabel && <span> · ✎ {flags.editorLabel}</span>}
            {(order.order_items?.length ?? 0) > 0 && ` · ${order.order_items?.length} item(s)`}
          </div>
        </div>
        <StatusSelect order={order} actions={actions} size="sm" />
        <PriceBreakdown order={order} className="font-semibold tabular-nums w-20 text-right shrink-0" />
        <ActionRow {...p} size="sm" />
      </div>
      {order.internal_note && (
        <div className="mt-2 ml-24 text-xs text-amber-700 dark:text-amber-300">
          <StickyNote className="h-3 w-3 inline mr-1" />{order.internal_note}
        </div>
      )}
    </div>
  );
}

// =================================================================
// MOBILE TEMPLATES
// =================================================================

function MobileStack(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${
      flags.courierFailed ? "border-destructive/40 bg-destructive/5"
        : flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/40 flex-wrap">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
        <span className="font-mono text-sm font-semibold">#{order.order_number}</span>
        <div className="ml-auto flex items-center gap-2">
          <StatusSelect order={order} actions={actions} size="sm" />
          <PriceBreakdown order={order} className="font-bold tabular-nums" />
        </div>
      </div>
      <div className="px-3 py-3 space-y-2">
        <CustomerBadges {...p} />
        <div className="text-xs text-muted-foreground">
          <Phone className="h-3 w-3 inline mr-1" />{order.customer_phone}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-2">{order.customer_address}</div>
        <ItemsList order={order} />
        <CourierBlock order={order} flags={flags} />
        <PlainNoteBlock order={order} actions={actions} />
        <CreatorEditorLine flags={flags} />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/40 bg-muted/20">
        <div className="text-[11px] text-muted-foreground truncate">{formatOrderDate(order.created_at)}</div>
        <ActionRow {...p} size="sm" />
      </div>
    </div>
  );
}

function MobileCompact(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-lg border bg-card p-2.5 ${flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"}`}>
      <div className="flex items-center gap-2">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
        <span className="font-mono text-xs font-semibold">#{order.order_number}</span>
        <PriceBreakdown order={order} className="ml-auto font-bold tabular-nums" />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <CustomerBadges {...p} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{order.customer_phone} · {formatOrderDate(order.created_at)}</div>
      <CreatorEditorLine flags={flags} className="mt-1" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusSelect order={order} actions={actions} size="sm" />
        <ActionRow {...p} size="sm" />
      </div>
      {order.internal_note && (
        <div className="mt-2 text-[11px] rounded bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-100 px-2 py-1">
          <StickyNote className="h-3 w-3 inline mr-1" />{order.internal_note}
        </div>
      )}
    </div>
  );
}

function MobilePhoto(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  const firstItem = (order.order_items ?? [])[0];
  const heroImg = firstItem?.product_variants?.image_url ?? firstItem?.products?.image_url ?? null;
  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${
      flags.isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      {heroImg ? (
        <div className="relative h-32 bg-muted">
          <img src={heroImg} alt="" loading="lazy" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute top-2 left-2"><Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} /></div>
          <div className="absolute top-2 right-2"><StatusSelect order={order} actions={actions} size="sm" /></div>
          <div className="absolute bottom-2 left-3 right-3 text-white">
            <div className="font-mono text-xs opacity-80">#{order.order_number}</div>
            <PriceBreakdown order={order} className="font-bold text-lg" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 border-b">
          <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
          <span className="font-mono text-xs font-semibold">#{order.order_number}</span>
          <PriceBreakdown order={order} className="ml-auto font-bold tabular-nums" />
        </div>
      )}
      <div className="p-3 space-y-2">
        <CustomerBadges {...p} />
        <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
        <ItemsList order={order} dense />
        <InternalNoteBlock order={order} actions={actions} />
        <CreatorEditorLine flags={flags} />
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground">{formatOrderDate(order.created_at)}</span>
          <ActionRow {...p} size="sm" />
        </div>
      </div>
    </div>
  );
}

function MobileTicket(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`relative bg-card border border-dashed border-border rounded-md p-3 ${
      flags.isSelected ? "border-primary ring-1 ring-primary/30" : ""
    }`}>
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-dashed border-border" />
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-dashed border-border" />
      <div className="flex items-center gap-2 mb-2">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
        <span className="font-mono text-xs font-semibold">ORDER #{order.order_number}</span>
        <PriceBreakdown order={order} className="ml-auto font-bold tabular-nums text-lg" />
      </div>
      <div className="border-t border-dashed border-border my-2" />
      <div className="space-y-1.5">
        <CustomerBadges {...p} />
        <div className="text-[11px] text-muted-foreground">{order.customer_phone}</div>
        <div className="text-[11px] text-muted-foreground line-clamp-2">{order.customer_address}</div>
      </div>
      <div className="border-t border-dashed border-border my-2" />
      <ItemsList order={order} dense />
      {order.internal_note && (
        <>
          <div className="border-t border-dashed border-border my-2" />
          <InternalNoteBlock order={order} actions={actions} />
        </>
      )}
      <div className="border-t border-dashed border-border my-2" />
      <div className="flex items-center justify-between gap-2">
        <StatusSelect order={order} actions={actions} size="sm" />
        <ActionRow {...p} size="sm" />
      </div>
      <div className="text-center text-[10px] text-muted-foreground mt-2 tracking-widest">
        {formatOrderDate(order.created_at)}
      </div>
      <CreatorEditorLine flags={flags} className="text-center mt-1" />
    </div>
  );
}

function MobileBold(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`rounded-xl border-2 bg-card p-3 ${
      flags.isSelected ? "border-primary" : "border-border/60"
    }`}>
      <div className="flex items-start gap-2">
        <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} className="mt-1" />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground">#{order.order_number}</div>
          <PriceBreakdown order={order} className="text-2xl font-black tabular-nums leading-tight" />
        </div>
        <StatusSelect order={order} actions={actions} />
      </div>
      <div className="mt-2 space-y-1">
        <CustomerBadges {...p} />
        <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
      </div>
      <ItemsList order={order} dense />
      <InternalNoteBlock order={order} actions={actions} />
      <CreatorEditorLine flags={flags} className="mt-2" />
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground">{formatOrderDate(order.created_at)}</span>
        <ActionRow {...p} size="sm" />
      </div>
    </div>
  );
}

function MobileGlass(p: OrderTemplateProps) {
  const { order, flags, actions } = p;
  return (
    <div className={`relative rounded-xl overflow-hidden bg-gradient-to-br from-primary/10 via-card to-card border ${
      flags.isSelected ? "border-primary/60 ring-1 ring-primary/40" : "border-border/60"
    } backdrop-blur-sm`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      <div className="relative p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={flags.isSelected} onCheckedChange={() => actions.toggleOne(order.id)} />
          <span className="font-mono text-xs font-semibold">#{order.order_number}</span>
          <PriceBreakdown order={order} className="ml-auto font-bold tabular-nums" />
        </div>
        <CustomerBadges {...p} />
        <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
        <ItemsList order={order} dense />
        <CourierBlock order={order} flags={flags} />
        <InternalNoteBlock order={order} actions={actions} />
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <StatusSelect order={order} actions={actions} size="sm" />
          <ActionRow {...p} size="sm" />
        </div>
        <div className="text-[10px] text-muted-foreground text-center">{formatOrderDate(order.created_at)}</div>
        <CreatorEditorLine flags={flags} className="text-center" />
      </div>
    </div>
  );
}

// =================================================================
// REGISTRY
// =================================================================

export const DESKTOP_TEMPLATES: OrderTemplateMeta[] = [
  { id: "card-premium",  name: "Card Premium",   description: "Gradient card with two-column body",        surface: "desktop", render: DesktopCardPremium },
  { id: "card-compact",  name: "Card Compact",   description: "Dense single-line row with key info",       surface: "desktop", render: DesktopCardCompact },
  { id: "table-classic", name: "Table Classic",  description: "Spreadsheet-style horizontal layout",       surface: "desktop", render: DesktopTableClassic },
  { id: "split-panel",   name: "Split Panel",    description: "Left customer / right items & actions",     surface: "desktop", render: DesktopSplitPanel },
  { id: "dark-luxury",   name: "Dark Luxury",    description: "Dark slate background with gold accents",   surface: "desktop", render: DesktopDarkLuxury },
  { id: "minimal-line",  name: "Minimal Line",   description: "Editorial borderless rows, light & airy",   surface: "desktop", render: DesktopMinimalLine },
];

export const MOBILE_TEMPLATES: OrderTemplateMeta[] = [
  { id: "mobile-stack",   name: "Stack",         description: "Vertical card with full details",            surface: "mobile", render: MobileStack },
  { id: "mobile-compact", name: "Compact",       description: "Small card, title + total focus",            surface: "mobile", render: MobileCompact },
  { id: "mobile-photo",   name: "Photo Hero",    description: "Large product image cover",                  surface: "mobile", render: MobilePhoto },
  { id: "mobile-ticket",  name: "Ticket",        description: "Receipt-style with dashed dividers",         surface: "mobile", render: MobileTicket },
  { id: "mobile-bold",    name: "Bold",          description: "Oversized total, prominent typography",      surface: "mobile", render: MobileBold },
  { id: "mobile-glass",   name: "Glass",         description: "Soft gradient & glassmorphism",              surface: "mobile", render: MobileGlass },
];

export function findOrderTemplate(id: string | null | undefined, surface: OrderTemplateSurface): OrderTemplateMeta {
  const list = surface === "desktop" ? DESKTOP_TEMPLATES : MOBILE_TEMPLATES;
  return list.find((t) => t.id === id) ?? list[0];
}
