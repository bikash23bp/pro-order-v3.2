import { createFileRoute, Link } from "@tanstack/react-router";
import { MemberBadge } from "@/components/MemberBadge";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Search, UserPlus, PhoneOff, PhoneMissed, Clock3, ShieldAlert,
  PhoneCall, Plus, History, MapPin, Phone, Upload, MessageCircle, StickyNote, Save, UserCog,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listTelesalesAssignments, getTelesalesCounts, assignTelesalesCustomers,
  updateTelesalesAssignment, bulkUpdateTelesalesStatus, getTelesalesDetail,
  listTelesalesStaff, listUnassignedCustomers, importTelesalesCustomers,
  reassignTelesalesAssignment, listSystemCustomersForTelesales,
  assignSystemCustomersToTelesales, clearTelesalesAssignments,
  type TeleAssignment,
} from "@/lib/telesales.functions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TelesalesReport } from "@/components/telesales-report";
import { TelesalesPnLReport } from "@/components/telesales-pnl-report";

import { TeleTemplatesSettings } from "@/components/tele-templates-settings";
import { useTeleTemplate } from "@/hooks/use-tele-template";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TeleTemplateActions } from "@/lib/tele-templates";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { ComplaintDialog } from "@/components/complaints/ComplaintDialog";
import { OrderDetailDialog, type DetailOrder } from "@/components/orders/OrderDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquareWarning } from "lucide-react";

export const Route = createFileRoute("/_app/telesales")({
  head: () => ({ meta: [{ title: "TeleSales — OMS" }] }),
  component: TelesalesPage,
});

type TabStatus = "all" | "pending" | "complete" | "hold" | "order";
type ActionKey = "phone_off" | "not_received" | "will_take_later" | "fraud" | "call_back_later";
type Tab = TabStatus | ActionKey;

const ACTION_META: Record<ActionKey, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  phone_off: { label: "Phone Off", icon: PhoneOff, cls: "text-muted-foreground" },
  not_received: { label: "Not Received", icon: PhoneMissed, cls: "text-amber-500" },
  will_take_later: { label: "Will Take Later", icon: Clock3, cls: "text-blue-500" },
  fraud: { label: "Fraud", icon: ShieldAlert, cls: "text-destructive" },
  call_back_later: { label: "Call Back Later", icon: PhoneCall, cls: "text-emerald-500" },
};
const ACTION_KEYS: ActionKey[] = ["phone_off", "not_received", "will_take_later", "fraud", "call_back_later"];
const STATUS_KEYS: TabStatus[] = ["all", "order", "pending", "complete", "hold"];
const STATUS_LABEL: Record<TabStatus, string> = {
  all: "All",
  order: "Linked Orders",
  pending: "Pending",
  complete: "Complete",
  hold: "Hold",
};

function waLink(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  // Default to BD country code if local 11-digit (starts with 0)
  const intl = digits.length === 11 && digits.startsWith("0") ? `88${digits}` : digits;
  return `https://wa.me/${intl}`;
}

function TelesalesPage() {
  const fetchList = useServerFn(listTelesalesAssignments);
  const fetchCounts = useServerFn(getTelesalesCounts);
  const updateFn = useServerFn(updateTelesalesAssignment);
  const bulkFn = useServerFn(bulkUpdateTelesalesStatus);
  const staffFn = useServerFn(listTelesalesStaff);
  const assignFn = useServerFn(assignTelesalesCustomers);
  const unassignedFn = useServerFn(listUnassignedCustomers);
  const importFn = useServerFn(importTelesalesCustomers);
  const reassignFn = useServerFn(reassignTelesalesAssignment);
  const qc = useQueryClient();
  const { isAdmin, permissions } = useAuth();
  const canViewTeleReports = isAdmin || !!permissions?.can_view_telesales_reports;

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [assignedFilter, setAssignedFilter] = useState<string>("all"); // all|unassigned|<userId>
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [complaintFor, setComplaintFor] = useState<{ phone: string; name: string | null } | null>(null);

  const { desktopTemplate, mobileTemplate } = useTeleTemplate();
  const isMobile = useIsMobile();
  const activeTemplate = isMobile ? mobileTemplate : desktopTemplate;

  const assignedToFilter =
    assignedFilter === "all" ? undefined :
    assignedFilter === "unassigned" ? null : assignedFilter;

  const listKey = ["telesales-list", tab, assignedFilter] as const;
  const listQ = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const isAction = (ACTION_KEYS as string[]).includes(tab);
      const isAll = tab === "all";
      const isOrder = tab === "order";
      return await fetchList({ data: {
        status: isAction || isAll || isOrder ? undefined : (tab as Exclude<TabStatus, "all" | "order">),
        action: isAction ? (tab as ActionKey) : undefined,
        orderTab: isOrder || undefined,
        assignedTo: assignedToFilter,
        limit: 500,
      } });
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const countsQ = useQuery({
    queryKey: ["telesales-counts", assignedFilter],
    queryFn: () => fetchCounts({ data: { assignedTo: assignedToFilter } }) as Promise<Record<string, number>>,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const staffQ = useQuery({
    queryKey: ["telesales-staff"],
    queryFn: () => staffFn({}),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const bizQ = useQuery({
    queryKey: ["telesales-biz"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("app_settings").select("business_name, business_phone, business_address, logo_url").maybeSingle();
      return {
        name: data?.business_name ?? null,
        phone: data?.business_phone ?? null,
        address: data?.business_address ?? null,
        logo: data?.logo_url ?? null,
      };
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const rows = listQ.data ?? [];
  const loading = listQ.isLoading;
  const counts = countsQ.data ?? {
    all: 0, order: 0,
    pending: 0, complete: 0, hold: 0, total: 0,
    phone_off: 0, not_received: 0, will_take_later: 0, fraud: 0, call_back_later: 0,
  };
  const staff = staffQ.data ?? [];
  const biz = bizQ.data ?? { name: null, phone: null, address: null, logo: null };

  // Clear selection when tab/filter changes
  useEffect(() => { setSelected(new Set()); }, [tab, assignedFilter]);

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["telesales-list"] });
    qc.invalidateQueries({ queryKey: ["telesales-counts"] });
  };
  const setRows = (updater: (prev: TeleAssignment[]) => TeleAssignment[]) => {
    qc.setQueryData<TeleAssignment[]>(listKey, (prev) => updater(prev ?? []));
  };


  const onAction = async (id: string, action: ActionKey) => {
    try {
      await updateFn({ data: { id, action } });
      toast.success(`Marked as ${ACTION_META[action].label}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const moveStatus = async (status: Exclude<TabStatus, "all">) => {
    if (selected.size === 0) { toast.info("Select customers first"); return; }
    try {
      const n = await bulkFn({ data: { ids: [...selected], status } });
      toast.success(`Moved ${n} to ${status}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const bulkReassign = async (assignedTo: string | null, label: string) => {
    if (selected.size === 0) { toast.info("Select customers first"); return; }
    try {
      const ids = [...selected];
      const results = await Promise.allSettled(
        ids.map((id) => reassignFn({ data: { id, assignedTo } })),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (ok) toast.success(`Reassigned ${ok} to ${label}${failed ? ` (${failed} failed)` : ""}`);
      if (!ok && failed) toast.error(`Reassignment failed`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const visible = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      (r.name ?? "").toLowerCase().includes(s) ||
      r.phone.toLowerCase().includes(s) ||
      (r.address ?? "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  useEffect(() => { setPage(1); }, [tab, assignedFilter, search, pageSize]);
  const paged = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  );

  const allSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) paged.forEach((r) => next.delete(r.id));
    else paged.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Business Info Header */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          {biz.logo ? (
            <img src={biz.logo} alt="Business logo" className="h-12 w-12 rounded-md object-contain border bg-background" />
          ) : (
            <div className="h-12 w-12 rounded-md bg-muted grid place-items-center text-muted-foreground text-xs">Logo</div>
          )}
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-base">{biz.name ?? "Your Business"}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {biz.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{biz.phone}</span>}
              {biz.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{biz.address}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={() => setAssignOpen(true)}>
              <UserPlus className="h-4 w-4" /> Assign Customers
            </Button>
            <ClearAssignmentsMenu staff={staff} onCleared={reload} />
            <Button asChild>
              <Link to="/orders/new"><Plus className="h-4 w-4" /> New Order</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h1 className="text-2xl font-semibold">TeleSales</h1>
        <p className="text-sm text-muted-foreground">Manage assigned customers, calls, and order conversions.</p>
      </div>

      <Tabs defaultValue="workboard" className="w-full">
        <TabsList>
          <TabsTrigger value="workboard">Workboard</TabsTrigger>
          {canViewTeleReports && <TabsTrigger value="report">Report</TabsTrigger>}
          {canViewTeleReports && <TabsTrigger value="pnl">Income / Expense</TabsTrigger>}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="workboard" className="mt-4 space-y-4">
      {selected.size > 0 && (
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-y shadow-sm flex items-center gap-2 flex-wrap text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">— move to:</span>
          <Button size="sm" variant="outline" onClick={() => moveStatus("pending")}>Pending</Button>
          <Button size="sm" variant="outline" onClick={() => moveStatus("complete")}>Complete</Button>
          <Button size="sm" variant="outline" onClick={() => moveStatus("hold")}>Hold</Button>
          <span className="ml-2 text-muted-foreground">reassign to:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <UserCog className="h-3.5 w-3.5" /> Reassign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Reassign {selected.size} customer(s) to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {staff.length === 0 ? (
                <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
              ) : (
                staff.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => bulkReassign(s.id, s.name)}>
                    {s.name}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => bulkReassign(null, "Unassigned")}>
                Unassign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full overflow-x-auto">
            <TabsList className="h-auto flex-wrap justify-start">
              {STATUS_KEYS.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {STATUS_LABEL[s]} ({counts[s] ?? 0})
                </TabsTrigger>
              ))}
              {ACTION_KEYS.map((k) => {
                const M = ACTION_META[k];
                return (
                  <TabsTrigger key={k} value={k}>
                    <M.icon className={`h-3.5 w-3.5 mr-1 ${M.cls}`} />
                    {M.label} ({counts[k] ?? 0})
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <div className="flex-1 flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / phone / address"
                className="pl-8"
              />
            </div>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>


        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No customers in this tab.</p>
          ) : (
            <div className="p-3 sm:p-4">
              <div className="flex items-center gap-2 px-1 pb-2 text-xs text-muted-foreground">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span>Select page ({paged.length}) · {visible.length} total</span>
                <span className="ml-auto">Layout: <span className="font-medium text-foreground">{activeTemplate.name}</span></span>
              </div>
              <div className={isMobile ? "space-y-2 overflow-x-hidden" : (activeTemplate.id === "tele-table-classic" ? "rounded-md border overflow-hidden" : "space-y-2")}>
                {paged.map((r) => {
                  const teleActions: TeleTemplateActions = {
                    toggleOne: (id) => {
                      const s = new Set(selected);
                      if (s.has(id)) s.delete(id); else s.add(id);
                      setSelected(s);
                    },
                    onAction: (id, action) => onAction(id, action),
                    onOpenDetail: (id) => setDetailId(id),
                    onOpenComplaints: (phone, name) => setComplaintFor({ phone, name }),
                    onSaveNote: async (id, note) => {
                      await updateFn({ data: { id, note } });
                      setRows((prev) => prev.map((x) => x.id === id ? { ...x, note } : x));
                      toast.success("Note saved");
                    },
                    onReassign: async (id, staffId) => {
                      try {
                        const res = await reassignFn({ data: { id, assignedTo: staffId } });
                        const label = staffId ? (staff.find((s) => s.id === staffId)?.name ?? "staff") : "Unassigned";
                        toast.success(staffId ? `Reassigned to ${res.assignedToName ?? label}` : "Unassigned");
                        setRows((prev) => prev.map((x) => x.id === id
                          ? { ...x, assigned_to: staffId, assigned_to_name: staffId ? (staff.find((s) => s.id === staffId)?.name ?? null) : null }
                          : x));
                      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                    },
                  };
                  return (
                    <div key={r.id}>
                      {activeTemplate.render({
                        row: {
                          id: r.id, name: r.name, phone: r.phone, address: r.address,
                          status: r.status, last_action: r.last_action, note: r.note,
                          assigned_to: r.assigned_to, assigned_to_name: r.assigned_to_name,
                          order_count: r.order_count,
                          complaint_count: r.complaint_count,
                          order_id: r.order_id,
                        },
                        isSelected: selected.has(r.id),
                        staff,
                        actions: teleActions,
                      })}
                    </div>
                  );
                })}
              </div>
              <PaginationFooter
                page={page}
                pageSize={pageSize}
                total={visible.length}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {canViewTeleReports && (
          <TabsContent value="report" className="mt-4">
            <TelesalesReport />
          </TabsContent>
        )}

        {canViewTeleReports && (
          <TabsContent value="pnl" className="mt-4">
            <TelesalesPnLReport />
          </TabsContent>
        )}


        <TabsContent value="settings" className="mt-4">
          <TeleTemplatesSettings />
        </TabsContent>
      </Tabs>

      <AssignDialog
        open={assignOpen} onClose={() => setAssignOpen(false)}
        staff={staff}
        unassignedFn={unassignedFn} assignFn={assignFn}
        onAssigned={reload}
      />

      <DetailDialog id={detailId} onClose={() => setDetailId(null)} onUpdated={reload} />

      <ImportDialog
        open={importOpen} onClose={() => setImportOpen(false)}
        staff={staff} importFn={importFn} onImported={reload}
      />

      {complaintFor && (
        <ComplaintDialog
          open={!!complaintFor}
          onOpenChange={(v) => { if (!v) setComplaintFor(null); }}
          phone={complaintFor.phone}
          customerName={complaintFor.name}
        />
      )}
    </div>
  );
}

function ClearAssignmentsMenu({
  staff, onCleared,
}: {
  staff: { id: string; name: string }[];
  onCleared: () => void;
}) {
  const clearFn = useServerFn(clearTelesalesAssignments);
  const [pending, setPending] = useState(false);

  const doClear = async (userId: string | null, label: string) => {
    const msg = userId === null
      ? "Delete ALL telesales assignments (every user)? This cannot be undone."
      : `Delete every telesales assignment for ${label}? This cannot be undone.`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setPending(true);
    try {
      const { deleted } = await clearFn({ data: { userId } });
      toast.success(`Removed ${deleted} assignment(s)`);
      onCleared();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <UserCog className="h-4 w-4" /> Clear Assignments
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Unassign &amp; delete</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => doClear(null, "everyone")}
        >
          Delete ALL assignments
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">From specific staff</DropdownMenuLabel>
        {staff.length === 0 ? (
          <DropdownMenuItem disabled>No staff</DropdownMenuItem>
        ) : (
          staff.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => doClear(s.id, s.name)}>
              {s.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}




function NoteCell({
  row, updateFn, onSaved,
}: {
  row: TeleAssignment;
  updateFn: ReturnType<typeof useServerFn<typeof updateTelesalesAssignment>>;
  onSaved: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(row.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(row.note ?? ""); }, [row.note]);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({ data: { id: row.id, note: text } });
      onSaved(text);
      toast.success("Note saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    } finally { setSaving(false); }
  };

  const hasNote = (row.note ?? "").trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 max-w-[220px] justify-start gap-1.5 font-normal">
          <StickyNote className={`h-3.5 w-3.5 shrink-0 ${hasNote ? "text-amber-500" : "text-muted-foreground"}`} />
          <span className="truncate text-xs text-muted-foreground">
            {hasNote ? row.note : "Add note"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2">
        <Label className="text-xs">Note</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Customer prefers evening calls"
          rows={4}
          maxLength={2000}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setText(row.note ?? ""); setOpen(false); }}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AssignDialog({
  open, onClose, staff, unassignedFn, assignFn, onAssigned,
}: {
  open: boolean; onClose: () => void;
  staff: { id: string; name: string }[];
  unassignedFn: ReturnType<typeof useServerFn<typeof listUnassignedCustomers>>;
  assignFn: ReturnType<typeof useServerFn<typeof assignTelesalesCustomers>>;
  onAssigned: () => void;
}) {
  const systemFn = useServerFn(listSystemCustomersForTelesales);
  const assignSystemFn = useServerFn(assignSystemCustomersToTelesales);

  const [mode, setMode] = useState<"imported" | "system">("imported");
  const [assignee, setAssignee] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // imported tab
  const [iLoading, setILoading] = useState(false);
  const [iRows, setIRows] = useState<Awaited<ReturnType<typeof unassignedFn>>>([]);
  const [iQ, setIQ] = useState("");
  const [iSel, setISel] = useState<Set<string>>(new Set());

  // system tab
  const [sLoading, setSLoading] = useState(false);
  const [sRows, setSRows] = useState<Awaited<ReturnType<typeof systemFn>>>([]);
  const [sQ, setSQ] = useState("");
  const [sSource, setSSource] = useState<string>("any");
  const [sProduct, setSProduct] = useState<string>("any");
  const [sDateFrom, setSDateFrom] = useState<string>("");
  const [sDateTo, setSDateTo] = useState<string>("");
  const [sOnlyCancelled, setSOnlyCancelled] = useState(false);
  const [sHasDiscount, setSHasDiscount] = useState(false);
  const [sSel, setSSel] = useState<Map<string, { name: string | null; phone: string; address: string | null }>>(new Map());
  const [sourceOptions, setSourceOptions] = useState<{ id: string; name: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) {
      setISel(new Set()); setSSel(new Map()); setAssignee(""); setMode("imported");
      return;
    }
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const [{ data: src }, { data: prods }] = await Promise.all([
        supabase.from("order_sources").select("id, name").eq("visible", true).order("name"),
        supabase.from("products").select("id, name").eq("status", "active").order("name").limit(500),
      ]);
      setSourceOptions((src ?? []) as { id: string; name: string }[]);
      setProductOptions(prods ?? []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "imported") return;
    setILoading(true);
    unassignedFn({ data: { search: iQ || undefined, limit: 200 } })
      .then(setIRows).catch((e) => toast.error(String(e)))
      .finally(() => setILoading(false));
  }, [open, mode, iQ]);

  const runSystemSearch = async () => {
    setSLoading(true);
    try {
      const r = await systemFn({ data: {
        search: sQ || undefined,
        orderSourceId: sSource === "any" ? undefined : sSource,
        productId: sProduct === "any" ? undefined : sProduct,
        dateFrom: sDateFrom || undefined,
        dateTo: sDateTo || undefined,
        onlyCancelled: sOnlyCancelled || undefined,
        hasDiscount: sHasDiscount || undefined,
        limit: 500,
      } });
      setSRows(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSLoading(false); }
  };

  useEffect(() => {
    if (open && mode === "system" && sRows.length === 0) runSystemSearch();
    // eslint-disable-next-line
  }, [open, mode]);

  const submit = async () => {
    if (!assignee) { toast.info("Pick an assignee"); return; }
    setSaving(true);
    try {
      if (mode === "imported") {
        if (iSel.size === 0) { toast.info("Select customers"); setSaving(false); return; }
        const r = await assignFn({ data: { customerIds: [...iSel], assignedTo: assignee } });
        toast.success(`Assigned ${r.inserted + r.updated} customer(s)`);
      } else {
        if (sSel.size === 0) { toast.info("Select customers"); setSaving(false); return; }
        const r = await assignSystemFn({ data: { customers: [...sSel.values()], assignedTo: assignee } });
        toast.success(`Assigned ${r.created + r.updated} customer(s) from system`);
      }
      onAssigned(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const selCount = mode === "imported" ? iSel.size : sSel.size;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Assign Customers</DialogTitle></DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "imported" | "system")}>
          <TabsList>
            <TabsTrigger value="imported">Imported Customers</TabsTrigger>
            <TabsTrigger value="system">From System Customers</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2 items-center pt-2">
          <Label className="text-xs text-muted-foreground">Assign to:</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Assign to staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{selCount} selected</span>
        </div>

        {mode === "imported" ? (
          <div className="space-y-3">
            <Input placeholder="Search imported customers…" value={iQ} onChange={(e) => setIQ(e.target.value)} />
            {iLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : iRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No imported customers found.</p>
            ) : (
              <div className="max-h-[380px] overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Current Assignee</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={iSel.has(r.id)}
                            onCheckedChange={(v) => {
                              const n = new Set(iSel);
                              if (v) n.add(r.id); else n.delete(r.id);
                              setISel(n);
                            }}
                          />
                        </TableCell>
                        <TableCell>{r.name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{r.address ?? "—"}</TableCell>
                        <TableCell>
                          {r.assigned_to_name
                            ? <Badge variant="destructive">{r.assigned_to_name}</Badge>
                            : <Badge variant="secondary">Unassigned</Badge>}
                        </TableCell>
                        <TableCell className="text-center"><Badge variant="secondary">{r.order_count}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <Input placeholder="Search name / phone / address" value={sQ} onChange={(e) => setSQ(e.target.value)} />
              <Select value={sSource} onValueChange={setSSource}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any source</SelectItem>
                  {sourceOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sProduct} onValueChange={setSProduct}>
                <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any product</SelectItem>
                  {productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={sDateFrom} onChange={(e) => setSDateFrom(e.target.value)} placeholder="From" />
              <Input type="date" value={sDateTo} onChange={(e) => setSDateTo(e.target.value)} placeholder="To" />
              <div className="flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox checked={sOnlyCancelled} onCheckedChange={(v) => setSOnlyCancelled(!!v)} /> Cancelled
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox checked={sHasDiscount} onCheckedChange={(v) => setSHasDiscount(!!v)} /> Has discount
                </label>
                <Button size="sm" onClick={runSystemSearch} disabled={sLoading}>
                  {sLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Apply
                </Button>
              </div>
            </div>

            {sLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : sRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No customers match these filters.</p>
            ) : (
              <div className="max-h-[380px] overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={sRows.length > 0 && sRows.every((r) => sSel.has(r.phone_normalized))}
                          onCheckedChange={(v) => {
                            if (v) {
                              const n = new Map(sSel);
                              for (const r of sRows) n.set(r.phone_normalized, { name: r.name, phone: r.phone, address: r.address });
                              setSSel(n);
                            } else setSSel(new Map());
                          }}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                      <TableHead className="text-center">Cancelled</TableHead>
                      <TableHead>Sources</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sRows.map((r) => (
                      <TableRow key={r.phone_normalized}>
                        <TableCell>
                          <Checkbox
                            checked={sSel.has(r.phone_normalized)}
                            onCheckedChange={(v) => {
                              const n = new Map(sSel);
                              if (v) n.set(r.phone_normalized, { name: r.name, phone: r.phone, address: r.address });
                              else n.delete(r.phone_normalized);
                              setSSel(n);
                            }}
                          />
                        </TableCell>
                        <TableCell>{r.name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.address ?? "—"}</TableCell>
                        <TableCell className="text-center"><Badge variant="secondary">{r.order_count}</Badge></TableCell>
                        <TableCell className="text-center">
                          {r.cancelled_count > 0
                            ? <Badge variant="destructive">{r.cancelled_count}</Badge>
                            : <span className="text-xs text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">{r.sources.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || selCount === 0 || !assignee}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Assign {selCount > 0 ? `(${selCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({
  id, onClose, onUpdated,
}: { id: string | null; onClose: () => void; onUpdated: () => void }) {
  const detailFn = useServerFn(getTelesalesDetail);
  const updateFn = useServerFn(updateTelesalesAssignment);
  const [data, setData] = useState<Awaited<ReturnType<typeof detailFn>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [blockOpen, setBlockOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<DetailOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  const openOrder = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { data: o, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, customer_email, customer_address, status, total_amount, delivery_charge, discount_amount, advance_amount, advance_source_id, advance_txn_id, subtotal, consignment_id, invoice_note, internal_note, is_paid_marketing")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!o) { toast.error("Order not found"); return; }
      setViewOrder(o as unknown as DetailOrder);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoadingOrderId(null);
    }
  };

  useEffect(() => {
    if (!id) { setData(null); return; }
    setLoading(true);
    detailFn({ data: { id } }).then((d) => { setData(d); setNote(d.assignment.note ?? ""); })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const setStatus = async (status: "pending" | "complete" | "hold") => {
    if (!id) return;
    try {
      await updateFn({ data: { id, status, note } });
      toast.success(`Marked ${status}`);
      onUpdated();
      const d = await detailFn({ data: { id } });
      setData(d);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Customer Details
            {data?.customer?.phone && (
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => setComplaintOpen(true)}
                >
                  <MessageSquareWarning className="h-3.5 w-3.5" /> Complaint
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-xs"
                  onClick={() => setBlockOpen(true)}
                >
                  <ShieldAlert className="h-3.5 w-3.5" /> Block
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        <BlockCustomerDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          defaultPhone={data?.customer?.phone ?? undefined}
        />
        {data?.customer?.phone && (
          <ComplaintDialog
            open={complaintOpen}
            onOpenChange={setComplaintOpen}
            phone={data.customer.phone}
            customerName={data.customer.name ?? null}
          />
        )}
        {loading || !data ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Name</div><div className="font-medium">{data.customer?.name ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Phone</div><div className="font-medium">{data.customer?.phone}</div></div>
                <div className="sm:col-span-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Address</div><div className="font-medium">{data.customer?.address ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Assigned To</div><div className="font-medium">{data.assignment.assigned_to_name ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><Badge>{data.assignment.status}</Badge></div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this customer…" rows={3} />
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={async () => {
                  if (!id) return;
                  try {
                    await updateFn({ data: { id, note } });
                    toast.success("Note saved");
                    onUpdated();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                }}>
                  <Save className="h-3.5 w-3.5" /> Save Note
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setStatus("pending")}>Mark Pending</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus("complete")}>Mark Complete</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus("hold")}>Mark Hold</Button>
                <Button size="sm" asChild className="ml-auto">
                  <Link to="/orders/new"><Plus className="h-3 w-3" /> Create Order</Link>
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Order History ({data.orders.length})</div>
              {data.orders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No orders yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.orders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => openOrder(o.id)}
                      disabled={loadingOrderId === o.id}
                      className="w-full flex justify-between items-center text-xs border rounded-md p-2 hover:bg-accent transition-colors text-left disabled:opacity-60"
                    >
                      <span className="font-mono">#{o.order_number}</span>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                      <span>{new Date(o.created_at).toLocaleDateString()}</span>
                      <span className="font-semibold inline-flex items-center gap-1">
                        ৳ {o.total_amount.toFixed(0)}
                        {loadingOrderId === o.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {viewOrder && (
              <OrderDetailDialog
                order={viewOrder}
                onClose={() => { setViewOrder(null); onUpdated(); }}
              />
            )}

            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-1"><History className="h-4 w-4" /> Call Log</div>
              {data.logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No calls logged yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.logs.map((l) => (
                    <div key={l.id} className="text-xs border rounded-md p-2 flex justify-between gap-2">
                      <span>
                        {l.reassigned_to_name ? (
                          <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" /> Reassigned to <b>{l.reassigned_to_name}</b></span>
                        ) : l.reassigned_to === null && l.note === "Unassigned" ? (
                          <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" /> Unassigned</span>
                        ) : (<>
                          {l.action ? ACTION_META[l.action]?.label : null}
                          {l.status_to ? <span className="ml-1 text-muted-foreground">→ {l.status_to}</span> : null}
                          {l.note ? <span className="ml-1">— {l.note}</span> : null}
                        </>)}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {l.created_by_name ?? "—"} · {new Date(l.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open, onClose, staff, importFn, onImported,
}: {
  open: boolean; onClose: () => void;
  staff: { id: string; name: string }[];
  importFn: ReturnType<typeof useServerFn<typeof importTelesalesCustomers>>;
  onImported: () => void;
}) {
  type Row = { name: string | null; phone: string; address: string | null };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsed, setParsed] = useState<Row[]>([]);
  const [assignee, setAssignee] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [liveImported, setLiveImported] = useState(0);
  const [liveExisted, setLiveExisted] = useState(0);
  const [liveAssigned, setLiveAssigned] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(1); setParsed([]); setAssignee("none");
      setProgress(0); setProgressDone(0); setProgressTotal(0);
      setLiveImported(0); setLiveExisted(0); setLiveAssigned(0);
    }
  }, [open]);

  const HEADER_ALIASES: Record<string, string[]> = {
    name: ["name", "customer", "customer_name", "customername", "fullname", "full_name", "নাম"],
    phone: ["phone", "phoneno", "phone_no", "mobile", "mobileno", "number", "phonenumber", "mobilenumber", "contact", "ফোন"],
    address: ["address", "location", "city", "ঠিকানা"],
  };
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-#]+/g, "").trim();
  const findHeader = (headers: string[], key: keyof typeof HEADER_ALIASES) => {
    const aliases = HEADER_ALIASES[key].map(normalize);
    return headers.find((h) => aliases.includes(normalize(h))) ?? null;
  };

  const onFile = async (file: File) => {
    try {
      const { parseSpreadsheet } = await import("@/lib/spreadsheet-parse");
      const { headers, rows } = await parseSpreadsheet(file);
      const h = {
        name: findHeader(headers, "name"),
        phone: findHeader(headers, "phone"),
        address: findHeader(headers, "address"),
      };
      const out: Row[] = rows.map((r) => {
        const name = (h.name ? (r[h.name] ?? "").trim() : "") || null;
        const phone = (h.phone ? (r[h.phone] ?? "").trim() : "") || "N/A";
        const address = (h.address ? (r[h.address] ?? "").trim() : "") || null;
        return { name, phone, address };
      });
      if (out.length === 0) { toast.error("ফাইলে কোনো রো নেই"); return; }
      setParsed(out);
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    }
  };

  const downloadSample = () => {
    const csv = "Name,Phone,Address\nRahim Mia,01712345678,Dhanmondi Dhaka\nKarim,01898765432,Mirpur\n,01911111111,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "telesales-sample.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (parsed.length === 0) return;
    setBusy(true);
    setStep(3);
    setProgress(0); setProgressDone(0); setProgressTotal(parsed.length);
    setLiveImported(0); setLiveExisted(0); setLiveAssigned(0);
    try {
      const BATCH = 500;
      let imported = 0, existed = 0, assigned = 0;
      for (let i = 0; i < parsed.length; i += BATCH) {
        const slice = parsed.slice(i, i + BATCH);
        const r = await importFn({
          data: {
            rows: slice,
            assignedTo: assignee === "none" ? null : assignee,
          },
        });
        imported += r.imported;
        existed += r.alreadyExisted;
        assigned += r.assignmentsCreated + r.assignmentsUpdated;
        const done = i + slice.length;
        setProgressDone(done);
        setLiveImported(imported);
        setLiveExisted(existed);
        setLiveAssigned(assigned);
        setProgress(Math.round((done / parsed.length) * 100));
      }
      toast.success(`Imported ${imported}, existing ${existed}, assignments ${assigned}`);
      onImported();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import Telesales Customers — Step {step} of 3</DialogTitle></DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              সব হেডার optional: <b>Name, Phone, Address</b>। কলাম যে কোনো ক্রমে থাকতে পারে — হেডার নাম দেখে অটো ম্যাচ হবে। ডাটা না থাকলে ডিফল্ট বসবে (Phone=N/A)। একই phone আগে থেকে থাকলে নতুন কাস্টমার তৈরি হবে না, কিন্তু assignment হবে।
              <div className="mt-2 text-xs text-muted-foreground">
                CSV ও XLSX দুটোই গ্রহণ — একসাথে ৫০০০ পর্যন্ত, ৫০০ করে ব্যাচে প্রসেস, লাইভ প্রগ্রেস দেখা যাবে।
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={downloadSample}>Download sample CSV</Button>
            <div className="flex flex-col gap-2">
              <Label>File</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onFile(f);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Assign imported customers to (optional)</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Leave unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Leave unassigned</SelectItem>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-sm"><b>{parsed.length}</b> rows পার্স হয়েছে।</div>
            <div className="border rounded-md max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell className="text-xs truncate max-w-[260px]">{r.address ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.length > 50 && <div className="text-xs text-muted-foreground">প্রথম 50 দেখানো হয়েছে।</div>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="w-full h-2 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-sm">{busy ? "Importing..." : "Done"} {progressDone}/{progressTotal} ({progress}%)</div>
            <div className="flex gap-4 text-sm">
              <div className="text-green-600">Imported: {liveImported}</div>
              <div className="text-muted-foreground">Existing: {liveExisted}</div>
              <div className="text-blue-600">Assignments: {liveAssigned}</div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>Back</Button>
              <Button onClick={submit} disabled={busy}>
                <Upload className="h-4 w-4" /> Start import ({parsed.length})
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={onClose} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Close
            </Button>
          )}
          {step === 1 && <Button variant="outline" onClick={onClose}>Cancel</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaginationFooter({
  page, pageSize, total, totalPages, onPageChange, onPageSizeChange,
}: {
  page: number; pageSize: number; total: number; totalPages: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | "...")[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  for (let i = page - 1; i <= page + 1; i++) {
    if (i > 1 && i < totalPages) add(i);
  }
  if (totalPages > 1) add(totalPages);
  const withGaps: (number | "...")[] = [];
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i] as number;
    const prev = pages[i - 1] as number | undefined;
    if (typeof prev === "number" && cur - prev > 1) withGaps.push("...");
    withGaps.push(cur);
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap pt-3 mt-2 border-t text-xs text-muted-foreground">
      <div>Showing {from}–{to} of {total}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[88px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</Button>
        <div className="flex items-center gap-1">
          {withGaps.map((p, i) =>
            p === "..." ? (
              <span key={`gap-${i}`} className="px-1">…</span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "outline"}
                className="h-8 min-w-8 px-2"
                onClick={() => onPageChange(p)}
              >{p}</Button>
            ),
          )}
        </div>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Next</Button>
      </div>
    </div>
  );
}
