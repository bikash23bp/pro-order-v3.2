import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, ClipboardCheck, Loader2, UserCircle2, History, RefreshCw, UserX, User2, Phone, ShoppingBag, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CustomerProfileDialog } from "@/components/customers/CustomerProfileDialog";
import { CustomerTagPicker } from "@/components/customers/CustomerTagPicker";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { checkBlocked, unblockCustomer } from "@/lib/blocked-customers.functions";


export const Route = createFileRoute("/_app/tasks/$taskId")({
  head: () => ({ meta: [{ title: "Task details — OMS" }] }),
  component: TaskDetailPage,
});

type TaskStatus = "pending" | "on_hold" | "completed";
type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_source: string | null;
  notes: string | null;
};
type AssignableUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
};
type HistoryEvent = {
  id: string;
  task_id: string;
  changed_by: string | null;
  event_type: "created" | "status_changed" | "reassigned" | "updated" | "note_updated";
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
};

const STATUS_TONE: Record<TaskStatus, string> = {
  pending: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  on_hold: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  on_hold: "On Hold",
  completed: "Completed",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;
  const isAdmin = role === "admin" || role === "business_owner";

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
      if (error) throw error;
      return data as Task | null;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_assignable_users");
      if (error) throw error;
      return (data ?? []) as AssignableUser[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["task-history", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_history")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryEvent[];
    },
  });

  const customerPhone = taskQuery.data?.customer_phone ?? null;
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<string>("all");
  const [historyFrom, setHistoryFrom] = useState<string>("");
  const [historyTo, setHistoryTo] = useState<string>("");
  const [historyPageSize, setHistoryPageSize] = useState<number>(10);
  const [profileOpen, setProfileOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const normalizedPhone = (customerPhone ?? "").replace(/\D/g, "").slice(-11);
  const blockedQuery = useQuery({
    queryKey: ["task-customer-blocked", normalizedPhone],
    enabled: !!normalizedPhone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_customers")
        .select("id, reason")
        .eq("phone_normalized", normalizedPhone)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; reason: string } | null;
    },
  });
  const doUnblock = useServerFn(unblockCustomer);
  const unblock = async () => {
    if (!blockedQuery.data?.id) return;
    try {
      await doUnblock({ data: { id: blockedQuery.data.id } });
      toast.success("Customer unblocked");
      qc.invalidateQueries({ queryKey: ["task-customer-blocked", normalizedPhone] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock");
    }
  };


  // Reset to first page when filters change
  useEffect(() => { setHistoryPage(1); }, [historyStatus, historyFrom, historyTo, customerPhone, historyPageSize]);

  type OrderRow = { id: string; order_number: number; status: string; total_amount: number; created_at: string };
  const customerHistoryQuery = useQuery({
    queryKey: ["task-customer-orders", customerPhone, historyPage, historyPageSize, historyStatus, historyFrom, historyTo],
    enabled: !!customerPhone,
    queryFn: async () => {
      const normalized = (customerPhone ?? "").replace(/[^0-9]/g, "").slice(-11);
      if (!normalized) return { rows: [] as OrderRow[], count: 0, totalSpend: 0, lastOrderAt: null as string | null };

      const applyFilters = <T extends ReturnType<typeof supabase.from>>(q: any) => {
        let qq = q.eq("phone_normalized", normalized);
        if (historyStatus !== "all") qq = qq.eq("status", historyStatus);
        if (historyFrom) qq = qq.gte("created_at", new Date(historyFrom).toISOString());
        if (historyTo) {
          const end = new Date(historyTo); end.setHours(23, 59, 59, 999);
          qq = qq.lte("created_at", end.toISOString());
        }
        return qq;
      };

      const from = (historyPage - 1) * historyPageSize;
      const to = from + historyPageSize - 1;

      const rowsQ = applyFilters(supabase.from("orders").select("id, order_number, status, total_amount, created_at", { count: "exact" }))
        .order("created_at", { ascending: false })
        .range(from, to);
      const aggQ = applyFilters(supabase.from("orders").select("total_amount, created_at"))
        .order("created_at", { ascending: false });

      const [rowsRes, aggRes] = await Promise.all([rowsQ, aggQ]);
      if (rowsRes.error) throw rowsRes.error;
      if (aggRes.error) throw aggRes.error;
      const agg = (aggRes.data ?? []) as Array<{ total_amount: number; created_at: string }>;
      return {
        rows: (rowsRes.data ?? []) as OrderRow[],
        count: rowsRes.count ?? 0,
        totalSpend: agg.reduce((s, o) => s + Number(o.total_amount || 0), 0),
        lastOrderAt: agg[0]?.created_at ?? null,
      };
    },
  });
  const ORDER_STATUSES = ["processing", "ready_to_ship", "shipped", "completed", "cancelled", "cancel_request", "returned", "pending_web", "no_response", "fraud"] as const;

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`task-detail-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `id=eq.${taskId}` }, () => {
        qc.invalidateQueries({ queryKey: ["task", taskId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_history", filter: `task_id=eq.${taskId}` }, () => {
        qc.invalidateQueries({ queryKey: ["task-history", taskId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [taskId, qc]);

  const userMap = useMemo(() => {
    const m = new Map<string, AssignableUser>();
    (usersQuery.data ?? []).forEach((u) => m.set(u.id, u));
    return m;
  }, [usersQuery.data]);

  const nameOf = (id: string | null | undefined) =>
    (id && userMap.get(id)?.display_name) || (id ? `User ${id.slice(0, 6)}` : "—");

  const task = taskQuery.data;

  const canChangeStatus = !!task && (isAdmin || task.assigned_to === userId || task.assigned_by === userId);
  const canReassign = !!task && (isAdmin || task.assigned_by === userId);

  const updateStatus = async (status: TaskStatus) => {
    if (!task) return;
    const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (error) toast.error(error.message);
    else toast.success(`Status: ${STATUS_LABEL[status]}`);
  };

  const reassign = async (newAssignee: string) => {
    if (!task) return;
    const { error } = await supabase.from("tasks").update({ assigned_to: newAssignee }).eq("id", task.id);
    if (error) toast.error(error.message);
    else toast.success("Task reassigned");
  };

  const unassign = async () => {
    if (!task) return;
    if (task.assigned_to === task.assigned_by) {
      toast.info("Already with creator");
      return;
    }
    const { error } = await supabase.from("tasks").update({ assigned_to: task.assigned_by }).eq("id", task.id);
    if (error) toast.error(error.message);
    else toast.success("Unassigned — back to creator");
  };

  if (taskQuery.isLoading) {
    return (
      <div className="p-8 grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/tasks" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Task not found, or you don't have access.
        </CardContent></Card>
      </div>
    );
  }

  const assignee = userMap.get(task.assigned_to);
  const assigner = userMap.get(task.assigned_by);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/tasks"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/15 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{task.title}</h1>
            <p className="text-[11px] text-muted-foreground">
              Created {format(new Date(task.created_at), "dd MMM yyyy, p")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { taskQuery.refetch(); historyQuery.refetch(); }}>
          <RefreshCw className={`h-4 w-4 ${taskQuery.isFetching || historyQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Description
              <Badge variant="outline" className={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm whitespace-pre-wrap break-words text-foreground/90 min-h-[60px]">
              {task.description?.trim() || <span className="text-muted-foreground italic">No description.</span>}
            </div>
            <NotesEditor taskId={task.id} initialValue={task.notes ?? ""} disabled={!canChangeStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">People & Status</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Assigned to</div>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {initials(assignee?.display_name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{assignee?.display_name ?? "—"}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Assigned by</div>
              <div className="flex items-center gap-2">
                <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>{assigner?.display_name ?? "—"}</span>
              </div>
            </div>

            {canChangeStatus && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Update status</div>
                <Select value={task.status} onValueChange={(v) => updateStatus(v as TaskStatus)}>
                  <SelectTrigger className={`h-9 border ${STATUS_TONE[task.status]}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {canReassign && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Reassign</div>
                <div className="flex items-center gap-2">
                  <Select value={task.assigned_to} onValueChange={reassign}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(usersQuery.data ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {task.assigned_to !== task.assigned_by && (
                    <Button size="sm" variant="outline" onClick={unassign} title="Unassign (back to creator)">
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {task.customer_phone && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Customer</div>
                <div className="rounded-md border border-border/60 p-2 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{task.customer_name || "Customer"}</span>
                    {task.customer_source && (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">{task.customer_source}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(task.customer_phone ?? "");
                      toast.success("Phone copied");
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {task.customer_phone}
                  </button>
                  {blockedQuery.data && (
                    <div className="rounded border border-red-500/40 bg-red-500/10 text-red-300 text-[11px] p-1.5 mt-1">
                      <span className="font-medium">Blocked:</span> {blockedQuery.data.reason}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <CustomerTagPicker phone={task.customer_phone} buttonSize="sm" buttonVariant="outline" />
                    {blockedQuery.data ? (
                      <Button size="sm" variant="outline" onClick={unblock}>
                        <ShieldCheck className="h-4 w-4 mr-1" /> Unblock
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => setBlockOpen(true)}>
                        <ShieldAlert className="h-4 w-4 mr-1" /> Block
                      </Button>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setProfileOpen(true)}>
                    <UserCircle2 className="h-4 w-4 mr-1" /> View full profile
                  </Button>

                </div>
              </div>
            )}

            {task.completed_at && (
              <div className="text-xs text-emerald-400">
                Completed {format(new Date(task.completed_at), "dd MMM yyyy, p")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" /> Status history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="grid place-items-center p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">No history yet.</div>
          ) : (
            <ol className="relative border-l border-border/60 ml-2 space-y-3">
              {(historyQuery.data ?? []).map((h) => {
                const actor = nameOf(h.changed_by);
                let label = "";
                if (h.event_type === "created") {
                  label = `${actor} created this task`;
                } else if (h.event_type === "status_changed") {
                  const from = h.from_value as TaskStatus | null;
                  const to = h.to_value as TaskStatus | null;
                  label = `${actor} changed status: ${from ? STATUS_LABEL[from] : "—"} → ${to ? STATUS_LABEL[to] : "—"}`;
                } else if (h.event_type === "reassigned") {
                  label = `${actor} reassigned: ${nameOf(h.from_value)} → ${nameOf(h.to_value)}`;
                } else if (h.event_type === "note_updated") {
                  label = `${actor} updated notes`;
                } else {
                  label = `${actor} updated this task`;
                }
                return (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary/70 border border-background" />
                    <div className="text-sm">{label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(new Date(h.created_at), "dd MMM yyyy, p")}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {task.customer_phone && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> Customer order history
              <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                {task.customer_name || "Customer"} · {task.customer_phone}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</label>
                <Select value={historyStatus} onValueChange={setHistoryStatus}>
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
                <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
                <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Show</label>
                <Select value={String(historyPageSize)} onValueChange={(v) => setHistoryPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="1000">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(historyStatus !== "all" || historyFrom || historyTo) && (
                <Button variant="ghost" size="sm" className="h-8"
                  onClick={() => { setHistoryStatus("all"); setHistoryFrom(""); setHistoryTo(""); }}>
                  Clear
                </Button>
              )}
            </div>

            {customerHistoryQuery.isLoading ? (
              <div className="grid place-items-center p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : (customerHistoryQuery.data?.count ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">No orders match the current filters.</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                  <span>Total orders: <span className="text-foreground font-medium">{customerHistoryQuery.data!.count}</span></span>
                  <span>Total spend: <span className="text-foreground font-medium">৳{customerHistoryQuery.data!.totalSpend.toLocaleString()}</span></span>
                  {customerHistoryQuery.data!.lastOrderAt && (
                    <span>Last order: <span className="text-foreground font-medium">{format(new Date(customerHistoryQuery.data!.lastOrderAt), "dd MMM yyyy")}</span></span>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Order #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerHistoryQuery.data!.rows.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">#{o.order_number}</TableCell>
                        <TableCell className="text-xs">{format(new Date(o.created_at), "dd MMM yyyy, p")}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{o.status}</Badge></TableCell>
                        <TableCell className="text-right">৳{Number(o.total_amount || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                            <Link to="/orders/$orderId/invoice" params={{ orderId: o.id }}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {(() => {
                  const total = customerHistoryQuery.data!.count;
                  const totalPages = Math.max(1, Math.ceil(total / historyPageSize));
                  const start = (historyPage - 1) * historyPageSize + 1;
                  const end = Math.min(historyPage * historyPageSize, total);
                  return (
                    <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                      <span>Showing {start}–{end} of {total}</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-7" disabled={historyPage <= 1}
                          onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>Prev</Button>
                        <span>Page {historyPage} / {totalPages}</span>
                        <Button variant="outline" size="sm" className="h-7" disabled={historyPage >= totalPages}
                          onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {task.customer_phone && (
        <CustomerProfileDialog
          phone={task.customer_phone}
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {task.customer_phone && (
        <BlockCustomerDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          defaultPhone={task.customer_phone}
          onBlocked={() => qc.invalidateQueries({ queryKey: ["task-customer-blocked", normalizedPhone] })}
        />
      )}
    </div>
  );
}

function NotesEditor({ taskId, initialValue, disabled }: { taskId: string; initialValue: string; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const existing = initialValue.trim();

  const addNote = async () => {
    const entry = draft.trim();
    if (!entry) return;
    setSaving(true);
    const stamp = format(new Date(), "dd MMM yyyy, p");
    const block = `[${stamp}] ${entry}`;
    const next = existing ? `${block}\n\n${existing}` : block;
    const { error } = await supabase
      .from("tasks")
      .update({ notes: next })
      .eq("id", taskId);
    setSaving(false);
    if (error) return toast.error(error.message);
    setDraft("");
    toast.success("Note added");
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</div>
      {existing && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-48 overflow-auto">
          {existing}
        </div>
      )}
      <div className="flex items-start gap-2">
        <Textarea
          rows={2}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNote(); }
          }}
          placeholder={disabled ? "No edit access" : "Write a note…"}
          maxLength={2000}
          className="text-sm flex-1"
        />
        <Button size="sm" onClick={addNote} disabled={!draft.trim() || saving || disabled} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Plus className="h-4 w-4 mr-1" /> Add Note</>)}
        </Button>
      </div>
    </div>
  );
}
