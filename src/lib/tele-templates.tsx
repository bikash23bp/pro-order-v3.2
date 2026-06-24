import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  Phone, MessageCircle, PhoneOff, PhoneMissed, Clock3, ShieldAlert,
  PhoneCall, UserCog, Plus, StickyNote, Save, Loader2, MessageSquareWarning, ShoppingBag, Star,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemberBadge } from "@/components/MemberBadge";

// ----- Types -----

export type TeleActionKey =
  | "phone_off" | "not_received" | "will_take_later" | "fraud" | "call_back_later";

export type TeleRow = {
  id: string;
  name: string | null;
  phone: string;
  address: string | null;
  status: "pending" | "complete" | "hold";
  last_action: TeleActionKey | null;
  note: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  order_count: number;
  complaint_count: number;
  order_id: string | null;
  duplicate_count?: number;
};

export type TeleStaff = { id: string; name: string };

export type TeleTemplateActions = {
  toggleOne: (id: string) => void;
  onAction: (id: string, action: TeleActionKey) => void;
  onReassign: (id: string, staffId: string | null) => void;
  onOpenDetail: (id: string) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
  onOpenComplaints: (phone: string, name: string | null) => void;
  onOpenReviews: (phone: string, name: string | null) => void;
};

export type TeleTemplateProps = {
  row: TeleRow;
  isSelected: boolean;
  staff: TeleStaff[];
  actions: TeleTemplateActions;
};

export type TeleTemplateSurface = "desktop" | "mobile";

export type TeleTemplateMeta = {
  id: string;
  name: string;
  description: string;
  surface: TeleTemplateSurface;
  render: (p: TeleTemplateProps) => ReactElement;
};

// ----- Shared helpers -----

export const TELE_ACTION_META: Record<TeleActionKey, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  phone_off:        { label: "Phone Off",       icon: PhoneOff,    cls: "text-muted-foreground" },
  not_received:     { label: "Not Received",    icon: PhoneMissed, cls: "text-amber-500" },
  will_take_later:  { label: "Will Take Later", icon: Clock3,      cls: "text-blue-500" },
  fraud:            { label: "Fraud",           icon: ShieldAlert, cls: "text-destructive" },
  call_back_later:  { label: "Call Back Later", icon: PhoneCall,   cls: "text-emerald-500" },
};
const ACTION_KEYS: TeleActionKey[] = ["phone_off", "not_received", "will_take_later", "fraud", "call_back_later"];

function waLink(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const intl = digits.length === 11 && digits.startsWith("0") ? `88${digits}` : digits;
  return `https://wa.me/${intl}`;
}

// ----- Shared sub-components -----

function ContactButtons({ phone, size = "sm" }: { phone: string; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-9 px-3" : "h-7 w-7";
  if (size === "md") {
    return (
      <div className="flex items-center gap-1.5">
        <Button asChild variant="outline" className={cls}>
          <a href={`tel:${phone}`}><Phone className="h-4 w-4 text-primary" /> Call</a>
        </Button>
        <Button asChild variant="outline" className={cls}>
          <a href={waLink(phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 text-emerald-600" /> WA</a>
        </Button>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-0.5">
      <Button asChild size="icon" variant="ghost" className={cls} title="Call">
        <a href={`tel:${phone}`} aria-label="Call"><Phone className="h-3.5 w-3.5 text-primary" /></a>
      </Button>
      <Button asChild size="icon" variant="ghost" className={cls} title="WhatsApp">
        <a href={waLink(phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp">
          <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
        </a>
      </Button>
    </div>
  );
}

function ActionIcons({ row, actions, dense = false }: { row: TeleRow; actions: TeleTemplateActions; dense?: boolean }) {
  const cls = dense ? "h-7 w-7" : "h-8 w-8";
  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center gap-0.5">
        {ACTION_KEYS.map((k) => {
          const M = TELE_ACTION_META[k];
          return (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className={cls} onClick={() => actions.onAction(row.id, k)}>
                  <M.icon className={`h-4 w-4 ${M.cls}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{M.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function ReassignMenu({ row, staff, actions, dense = false }: { row: TeleRow; staff: TeleStaff[]; actions: TeleTemplateActions; dense?: boolean }) {
  const cls = dense ? "h-7 w-7" : "h-8 w-8";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className={cls} title="Reassign">
          <UserCog className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Reassign to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {staff.length === 0 ? (
          <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
        ) : (
          staff.map((s) => (
            <DropdownMenuItem
              key={s.id}
              disabled={s.id === row.assigned_to}
              onClick={() => actions.onReassign(row.id, s.id)}
            >
              {s.name}{s.id === row.assigned_to ? " (current)" : ""}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!row.assigned_to} onClick={() => actions.onReassign(row.id, null)}>
          Unassign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NewOrderBtn({ row, size = "sm" }: { row: TeleRow; size?: "sm" | "icon" }) {
  const search = {
    name: row.name ?? undefined,
    phone: row.phone || undefined,
    address: row.address ?? undefined,
    source: "telesales",
    assignmentId: row.id,
  };
  if (size === "icon") {
    return (
      <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="New Order">
        <Link to="/orders/new" search={search}><Plus className="h-4 w-4" /></Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline" className="h-7">
      <Link to="/orders/new" search={search}><Plus className="h-3 w-3" /> Order</Link>
    </Button>
  );
}

function ComplaintBadge({ row, actions }: { row: TeleRow; actions: TeleTemplateActions }) {
  if (!row.complaint_count) return null;
  return (
    <Button
      size="sm"
      variant="destructive"
      className="h-6 px-1.5 gap-1 text-[10px]"
      title="পূর্বের কম্পেলেন আছে"
      onClick={(e) => { e.stopPropagation(); actions.onOpenComplaints(row.phone, row.name); }}
    >
      <MessageSquareWarning className="h-3 w-3" /> {row.complaint_count}
    </Button>
  );
}

function OrderTakenBadge({ row }: { row: TeleRow }) {
  if (!row.order_id) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
      <ShoppingBag className="h-3 w-3" /> Ordered
    </span>
  );
}

function DuplicateBadge({ row }: { row: TeleRow }) {
  const n = row.duplicate_count ?? 1;
  if (n <= 1) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium bg-red-500/15 text-red-500 border-red-500/40"
      title={`This customer is assigned ${n} times`}
    >
      <MessageSquareWarning className="h-3 w-3" /> Duplicate ×{n}
    </span>
  );
}

function NotePopover({ row, actions }: { row: TeleRow; actions: TeleTemplateActions }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(row.note ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(row.note ?? ""); }, [row.note]);
  const hasNote = (row.note ?? "").trim().length > 0;

  const save = async () => {
    setSaving(true);
    try { await actions.onSaveNote(row.id, text); setOpen(false); }
    finally { setSaving(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 max-w-[220px] justify-start gap-1.5 font-normal">
          <StickyNote className={`h-3.5 w-3.5 shrink-0 ${hasNote ? "text-amber-500" : "text-muted-foreground"}`} />
          <span className="truncate text-xs text-muted-foreground">{hasNote ? row.note : "Add note"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2">
        <Label className="text-xs">Note</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder="e.g. Customer prefers evening calls" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setText(row.note ?? ""); setOpen(false); }}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NameButton({ row, actions, className = "" }: { row: TeleRow; actions: TeleTemplateActions; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 min-w-0 max-w-full ${className}`}>
      <button className="text-left font-medium hover:underline truncate min-w-0" onClick={() => actions.onOpenDetail(row.id)}>
        {row.name ?? "—"}
      </button>
      <span className="shrink-0"><MemberBadge phone={row.phone} /></span>
      <span className="shrink-0"><ComplaintBadge row={row} actions={actions} /></span>
      <span className="shrink-0"><OrderTakenBadge row={row} /></span>
      <span className="shrink-0"><DuplicateBadge row={row} /></span>
    </div>
  );
}

function LastActionBadge({ row }: { row: TeleRow }) {
  if (!row.last_action) return null;
  const M = TELE_ACTION_META[row.last_action];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${M.cls}`}>
      <M.icon className="h-3 w-3" /> {M.label}
    </span>
  );
}

// =================================================================
// DESKTOP TEMPLATES
// =================================================================

function DesktopTableClassic(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`grid grid-cols-[auto_1fr_180px_1fr_60px_140px_200px_auto] items-center gap-3 px-3 py-2 border-b bg-card text-sm ${
      isSelected ? "bg-primary/5" : ""
    }`}>
      <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} />
      <NameButton row={row} actions={actions} />
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs">{row.phone}</span>
        <ContactButtons phone={row.phone} />
      </div>
      <div className="text-xs text-muted-foreground truncate">{row.address ?? "—"}</div>
      <div className="text-center"><Badge variant="secondary">{row.order_count}</Badge></div>
      <div className="text-xs truncate">{row.assigned_to_name ?? <span className="text-muted-foreground">—</span>}</div>
      <NotePopover row={row} actions={actions} />
      <div className="inline-flex items-center gap-0.5 justify-end">
        <ActionIcons row={row} actions={actions} dense />
        <ReassignMenu row={row} staff={staff} actions={actions} dense />
        <NewOrderBtn row={row} />
      </div>
    </div>
  );
}

function DesktopRowCompact(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2 hover:bg-muted/30 transition-colors ${
      isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} />
      <div className="min-w-0 flex-1 basis-[220px]">
        <NameButton row={row} actions={actions} />
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 min-w-0">
          <span className="font-mono shrink-0">{row.phone}</span>
          <span className="shrink-0">·</span>
          <span className="truncate">{row.address ?? "—"}</span>
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0">×{row.order_count}</Badge>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden lg:block shrink-0">{row.assigned_to_name ?? "—"}</span>
      <LastActionBadge row={row} />
      <ContactButtons phone={row.phone} />
      <ActionIcons row={row} actions={actions} dense />
      <ReassignMenu row={row} staff={staff} actions={actions} dense />
      <NewOrderBtn row={row} />
    </div>
  );
}

function DesktopCardPremium(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`group rounded-xl border bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${
      isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent border-b border-border/40 flex-wrap">
        <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} />
        <NameButton row={row} actions={actions} className="text-base" />
        <Badge variant="secondary" className="ml-auto">Orders: {row.order_count}</Badge>
        <LastActionBadge row={row} />
      </div>
      <div className="px-4 py-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{row.phone}</span>
            <ContactButtons phone={row.phone} />
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2">{row.address ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">
            Assigned: <span className="text-foreground/80">{row.assigned_to_name ?? "—"}</span>
          </div>
          <NotePopover row={row} actions={actions} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ActionIcons row={row} actions={actions} />
          <div className="flex items-center gap-1">
            <ReassignMenu row={row} staff={staff} actions={actions} />
            <NewOrderBtn row={row} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopSplitPanel(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`rounded-xl border bg-card overflow-hidden grid md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] ${
      isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"
    }`}>
      <div className="bg-muted/40 p-4 space-y-2 border-r border-border/40 min-w-0">
        <div className="flex items-center gap-2">
          <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} />
          <NameButton row={row} actions={actions} />
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
          <span className="font-mono truncate">{row.phone}</span>
        </div>
        <div className="text-xs text-muted-foreground line-clamp-3">{row.address ?? "—"}</div>
        <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
          {row.assigned_to_name ?? "Unassigned"} · {row.order_count} orders
        </div>
        <ContactButtons phone={row.phone} size="md" />
      </div>
      <div className="p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <LastActionBadge row={row} />
          <div className="flex items-center gap-1">
            <ReassignMenu row={row} staff={staff} actions={actions} />
            <NewOrderBtn row={row} />
          </div>
        </div>
        <NotePopover row={row} actions={actions} />
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Mark call result</div>
          <ActionIcons row={row} actions={actions} />
        </div>
      </div>
    </div>
  );
}

// =================================================================
// MOBILE TEMPLATES
// =================================================================

function MobileStack(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`w-full max-w-full overflow-hidden rounded-xl border bg-card p-3 space-y-2 ${isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"}`}>
      <div className="flex items-start gap-2 min-w-0">
        <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} className="mt-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <NameButton row={row} actions={actions} />
          <div className="text-[11px] text-muted-foreground truncate">{row.address ?? "—"}</div>
        </div>
        <Badge variant="secondary" className="shrink-0">{row.order_count}</Badge>
      </div>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="font-mono text-xs truncate">{row.phone}</span>
        <div className="shrink-0"><ContactButtons phone={row.phone} /></div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
        <LastActionBadge row={row} />
        <span className="text-[10px] text-muted-foreground truncate">{row.assigned_to_name ?? "Unassigned"}</span>
      </div>
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40 min-w-0">
        <div className="min-w-0 overflow-hidden"><ActionIcons row={row} actions={actions} dense /></div>
        <div className="flex items-center gap-1 shrink-0">
          <ReassignMenu row={row} staff={staff} actions={actions} dense />
          <NewOrderBtn row={row} size="icon" />
        </div>
      </div>
      <NotePopover row={row} actions={actions} />
    </div>
  );
}

function MobileMinimal(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`w-full max-w-full overflow-hidden rounded-lg border bg-card p-2.5 ${isSelected ? "border-primary/50" : "border-border/60"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <NameButton row={row} actions={actions} />
          <div className="font-mono text-[11px] text-muted-foreground truncate">{row.phone}</div>
        </div>
        <div className="shrink-0"><ContactButtons phone={row.phone} /></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"><UserCog className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Call result</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACTION_KEYS.map((k) => {
              const M = TELE_ACTION_META[k];
              return (
                <DropdownMenuItem key={k} onClick={() => actions.onAction(row.id, k)}>
                  <M.icon className={`h-3.5 w-3.5 ${M.cls}`} /> {M.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Reassign to</DropdownMenuLabel>
            {staff.map((s) => (
              <DropdownMenuItem key={s.id} disabled={s.id === row.assigned_to} onClick={() => actions.onReassign(row.id, s.id)}>
                {s.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem disabled={!row.assigned_to} onClick={() => actions.onReassign(row.id, null)}>Unassign</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/orders/new" search={{ name: row.name ?? undefined, phone: row.phone || undefined, address: row.address ?? undefined, source: "telesales" }}><Plus className="h-3.5 w-3.5" /> New Order</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function MobileContactFirst(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`w-full max-w-full overflow-hidden rounded-xl border bg-card ${isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"}`}>
      <div className="bg-gradient-to-r from-primary/10 to-transparent p-3 flex items-center gap-2 min-w-0">
        <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <NameButton row={row} actions={actions} />
          <div className="font-mono text-[11px] text-muted-foreground truncate">{row.phone}</div>
        </div>
        <Badge variant="secondary" className="shrink-0">{row.order_count}</Badge>
      </div>
      <div className="p-3 space-y-2 min-w-0">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="h-10 min-w-0"><a href={`tel:${row.phone}`}><Phone className="h-4 w-4" /> Call</a></Button>
          <Button asChild variant="outline" className="h-10 min-w-0"><a href={waLink(row.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</a></Button>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{row.address ?? "—"}</div>
        <div className="flex items-center justify-between gap-1 flex-wrap pt-2 border-t border-border/40 min-w-0">
          <div className="min-w-0 overflow-hidden"><ActionIcons row={row} actions={actions} dense /></div>
          <div className="flex items-center gap-1 shrink-0">
            <ReassignMenu row={row} staff={staff} actions={actions} dense />
            <NewOrderBtn row={row} size="icon" />
          </div>
        </div>
        <NotePopover row={row} actions={actions} />
      </div>
    </div>
  );
}

function MobileActionGrid(p: TeleTemplateProps) {
  const { row, isSelected, staff, actions } = p;
  return (
    <div className={`w-full max-w-full overflow-hidden rounded-xl border bg-card p-3 space-y-2 ${isSelected ? "border-primary/50 ring-1 ring-primary/30" : "border-border/60"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox checked={isSelected} onCheckedChange={() => actions.toggleOne(row.id)} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <NameButton row={row} actions={actions} />
          <div className="text-[11px] text-muted-foreground truncate">{row.address ?? "—"}</div>
        </div>
        <div className="shrink-0"><ContactButtons phone={row.phone} /></div>
      </div>
      <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2 min-w-0">
        <span className="font-mono truncate">{row.phone}</span>
        <span className="truncate text-right">{row.assigned_to_name ?? "Unassigned"} · {row.order_count}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {ACTION_KEYS.map((k) => {
          const M = TELE_ACTION_META[k];
          return (
            <Button key={k} variant="outline" size="sm" className="h-auto min-w-0 flex-col gap-0.5 py-1.5 px-1 text-[10px] whitespace-normal leading-tight" onClick={() => actions.onAction(row.id, k)}>
              <M.icon className={`h-3.5 w-3.5 ${M.cls}`} />
              <span className="leading-tight text-center break-words">{M.label}</span>
            </Button>
          );
        })}
        <div className="flex items-center justify-center gap-1 min-w-0">
          <ReassignMenu row={row} staff={staff} actions={actions} dense />
          <NewOrderBtn row={row} size="icon" />
        </div>
      </div>
      <NotePopover row={row} actions={actions} />
    </div>
  );
}

// ----- Registries -----

export const DESKTOP_TELE_TEMPLATES: TeleTemplateMeta[] = [
  { id: "tele-table-classic", name: "Classic Table", description: "বর্তমান ঘন টেবিল লেআউট, সমস্ত কলাম এক লাইনে।", surface: "desktop", render: DesktopTableClassic },
  { id: "tele-row-compact",   name: "Compact Row",   description: "এক লাইনের ছোট কার্ড, hover hi-lite সহ।", surface: "desktop", render: DesktopRowCompact },
  { id: "tele-card-premium",  name: "Premium Card",  description: "বড় কার্ড + হাইলাইটেড অ্যাকশন প্যানেল।", surface: "desktop", render: DesktopCardPremium },
  { id: "tele-split-panel",   name: "Split Panel",   description: "বাম পাশে কাস্টমার ইনফো, ডান পাশে অ্যাকশন।", surface: "desktop", render: DesktopSplitPanel },
];

export const MOBILE_TELE_TEMPLATES: TeleTemplateMeta[] = [
  { id: "tele-mobile-stack",         name: "Stack Card",     description: "সাধারণ স্ট্যাক কার্ড — সব ইনফো ভার্টিকালি।", surface: "mobile", render: MobileStack },
  { id: "tele-mobile-minimal",       name: "Minimal",        description: "নাম + ফোন + একটি menu — সবচেয়ে কম স্পেস।", surface: "mobile", render: MobileMinimal },
  { id: "tele-mobile-contact-first", name: "Contact First",  description: "বড় Call ও WhatsApp বাটন প্রথমে।", surface: "mobile", render: MobileContactFirst },
  { id: "tele-mobile-action-grid",   name: "Action Grid",    description: "৫টা স্ট্যাটাস বাটন ৩×২ গ্রিডে।", surface: "mobile", render: MobileActionGrid },
];

export function findTeleTemplate(id: string | null | undefined, surface: TeleTemplateSurface): TeleTemplateMeta {
  const list = surface === "desktop" ? DESKTOP_TELE_TEMPLATES : MOBILE_TELE_TEMPLATES;
  return list.find((t) => t.id === id) ?? list[0];
}
