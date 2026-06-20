import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ClipboardCheck, Loader2, Plus, RefreshCw, Search, UserCircle2,
  BarChart3, UserX, User2, Phone, ExternalLink, Check, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CustomerProfileDialog } from "@/components/customers/CustomerProfileDialog";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({ meta: [{ title: "Tasks & Followup — OMS" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    user: typeof s.user === "string" ? s.user : undefined,
  }),
  component: TasksPage,
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
type CustomerHit = { source: string; name: string; phone: string };

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

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || role === "business_owner";
  const userId = user?.id ?? null;

  const [tab, setTab] = useState<"mine" | "created" | "all" | "reports">("mine");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [userFilter, setUserFilter] = useState<string>(search.user ?? "all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [textSearch, setTextSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ phone: string; name: string } | null>(null);

  // sync user filter from URL (e.g. coming from reports)
  useEffect(() => {
    if (search.user && search.user !== userFilter) setUserFilter(search.user);
  }, [search.user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin && tab === "all") setTab("mine");
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!userId) return;
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["my-pending-tasks-count", userId] });
      }, 800);
    };
    const ch = supabase
      .channel(`tasks-page-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);


  const usersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_assignable_users");
      if (error) throw error;
      return (data ?? []) as AssignableUser[];
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks", tab, statusFilter, userFilter, userId],
    enabled: !!userId && tab !== "reports",
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("id, title, description, assigned_to, assigned_by, status, completed_at, created_at, updated_at, customer_name, customer_phone, customer_source, notes")
        .order("created_at", { ascending: false })
        .limit(500);
      if (tab === "mine" && userId) q = q.eq("assigned_to", userId);
      else if (tab === "created" && userId) q = q.eq("assigned_by", userId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (isAdmin && tab === "all" && userFilter !== "all") q = q.eq("assigned_to", userFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const userMap = useMemo(() => {
    const m = new Map<string, AssignableUser>();
    (usersQuery.data ?? []).forEach((u) => m.set(u.id, u));
    return m;
  }, [usersQuery.data]);

  const filtered = useMemo(() => {
    const list = tasksQuery.data ?? [];
    const s = textSearch.trim().toLowerCase();
    const c = customerSearch.trim().toLowerCase();
    return list.filter((t) => {
      if (s) {
        const hay = `${t.title} ${t.description ?? ""} ${userMap.get(t.assigned_to)?.display_name ?? ""} ${userMap.get(t.assigned_by)?.display_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (c) {
        const hay = `${t.customer_name ?? ""} ${t.customer_phone ?? ""}`.toLowerCase();
        if (!hay.includes(c)) return false;
      }
      return true;
    });
  }, [tasksQuery.data, textSearch, customerSearch, userMap]);

  const counts = useMemo(() => {
    const list = tasksQuery.data ?? [];
    return {
      pending: list.filter((t) => t.status === "pending").length,
      on_hold: list.filter((t) => t.status === "on_hold").length,
      completed: list.filter((t) => t.status === "completed").length,
    };
  }, [tasksQuery.data]);

  const updateStatus = async (id: string, status: TaskStatus) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(`Status: ${STATUS_LABEL[status]}`);
  };

  const reassign = async (id: string, newAssignee: string) => {
    const { error } = await supabase.from("tasks").update({ assigned_to: newAssignee }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Task reassigned");
  };

  const unassign = async (t: Task) => {
    if (t.assigned_to === t.assigned_by) {
      toast.info("Already with creator");
      return;
    }
    const { error } = await supabase.from("tasks").update({ assigned_to: t.assigned_by }).eq("id", t.id);
    if (error) toast.error(error.message);
    else toast.success("Unassigned — back to creator");
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/15 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Tasks & Followup</h1>
            <p className="text-xs text-muted-foreground">Assign work, link customers, track status.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/tasks/reports"><BarChart3 className="h-4 w-4 mr-1" /> Reports</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => tasksQuery.refetch()}>
            <RefreshCw className={`h-4 w-4 ${tasksQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Task
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <Tabs value={tab} onValueChange={(v) => {
            if (v === "reports") {
              navigate({ to: "/tasks/reports" });
              return;
            }
            setTab(v as typeof tab);
          }}>
            <TabsList>
              <TabsTrigger value="mine">Assigned to me</TabsTrigger>
              <TabsTrigger value="created">Created by me</TabsTrigger>
              {isAdmin && <TabsTrigger value="all">All tasks</TabsTrigger>}
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3" />
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
                placeholder="Search title, description, person…"
                className="pl-8 h-9"
              />
            </div>
            <div className="relative min-w-[160px]">
              <Phone className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Customer name/phone"
                className="pl-8 h-9 w-[200px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && tab === "all" && (
              <Select value={userFilter} onValueChange={(v) => {
                setUserFilter(v);
                navigate({ to: "/tasks", search: { user: v === "all" ? undefined : v } as never, replace: true });
              }}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {(usersQuery.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
              <Badge variant="outline" className={STATUS_TONE.pending}>Pending {counts.pending}</Badge>
              <Badge variant="outline" className={STATUS_TONE.on_hold}>On Hold {counts.on_hold}</Badge>
              <Badge variant="outline" className={STATUS_TONE.completed}>Done {counts.completed}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {tasksQuery.isLoading ? (
        <Card><CardContent className="p-8 grid place-items-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          No tasks found.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((t) => {
            const assignee = userMap.get(t.assigned_to);
            const assigner = userMap.get(t.assigned_by);
            const canReassign = isAdmin || t.assigned_by === userId;
            const canChangeStatus = isAdmin || t.assigned_to === userId || t.assigned_by === userId;
            return (
              <Card key={t.id}>
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[240px] space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to="/tasks/$taskId"
                          params={{ taskId: t.id }}
                          className="font-medium hover:underline underline-offset-2"
                        >
                          {t.title}
                        </Link>
                        <Badge variant="outline" className={STATUS_TONE[t.status]}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                        {t.customer_phone && (
                          <>
                            <button
                              type="button"
                              onClick={() => setProfilePhone(t.customer_phone!)}
                              title="View customer profile"
                            >
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 cursor-pointer">
                                <User2 className="h-3 w-3 mr-1" />
                                {t.customer_name || "Customer"} · {t.customer_phone}
                              </Badge>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                              onClick={() => setBlockTarget({ phone: t.customer_phone!, name: t.customer_name ?? "" })}
                              title="Block this customer"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-2">
                          {t.description}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Avatar className="h-4 w-4">
                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                              {initials(assignee?.display_name ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                          Assigned to <span className="font-medium text-foreground/80">{assignee?.display_name ?? "—"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <UserCircle2 className="h-3 w-3" />
                          By <span className="font-medium text-foreground/80">{assigner?.display_name ?? "—"}</span>
                        </span>
                        <span>· {format(new Date(t.created_at), "dd MMM, p")}</span>
                        {t.completed_at && (
                          <span className="text-emerald-400">· Completed {format(new Date(t.completed_at), "dd MMM, p")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {canChangeStatus && (
                        <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v as TaskStatus)}>
                          <SelectTrigger className={`h-8 w-[130px] text-xs border ${STATUS_TONE[t.status]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="on_hold">On Hold</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {canReassign && (
                        <>
                          <Select value={t.assigned_to} onValueChange={(v) => reassign(t.id, v)}>
                            <SelectTrigger className="h-8 w-[150px] text-xs">
                              <SelectValue placeholder="Reassign" />
                            </SelectTrigger>
                            <SelectContent>
                              {(usersQuery.data ?? []).map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {t.assigned_to !== t.assigned_by && (
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => unassign(t)} title="Unassign (back to creator)">
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <Link to="/tasks/$taskId" params={{ taskId: t.id }}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <NotesField taskId={t.id} initialValue={t.notes ?? ""} disabled={!canChangeStatus} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={usersQuery.data ?? []}
        currentUserId={userId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />

      {profilePhone && (
        <CustomerProfileDialog
          phone={profilePhone}
          open={!!profilePhone}
          onClose={() => setProfilePhone(null)}
        />
      )}

      <BlockCustomerDialog
        open={!!blockTarget}
        onOpenChange={(v) => { if (!v) setBlockTarget(null); }}
        defaultPhone={blockTarget?.phone}
      />
    </div>
  );
}

function CustomerPicker({
  value, onChange,
}: {
  value: { name: string; phone: string; source: string } | null;
  onChange: (v: { name: string; phone: string; source: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [open, setOpen] = useState(false);

  const hits = useQuery({
    queryKey: ["task-customer-search", debounced],
    enabled: open && debounced.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_task_customers", { p_query: debounced });
      if (error) throw error;
      return (data ?? []) as CustomerHit[];
    },
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
        <div className="text-sm">
          <span className="font-medium">{value.name || "Customer"}</span>
          <span className="text-muted-foreground"> · {value.phone}</span>
          <Badge variant="outline" className="ml-2 text-[10px]">{value.source}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Clear</Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        value={query}
        placeholder="Search name or phone…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && debounced.trim() && (
        <div className="rounded-md border border-border/60 bg-popover max-h-56 overflow-auto">
          {hits.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" /> Searching…</div>
          ) : (hits.data ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>No match. Use manually:</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => { onChange({ name: query.trim(), phone: query.trim(), source: "manual" }); setOpen(false); }}
              >
                Use "{query.trim()}"
              </Button>
            </div>
          ) : (
            <ul className="text-sm">
              {(hits.data ?? []).map((h) => (
                <li
                  key={`${h.source}-${h.phone}`}
                  className="px-2 py-1.5 hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-2"
                  onClick={() => { onChange({ name: h.name, phone: h.phone, source: h.source }); setOpen(false); }}
                >
                  <span><span className="font-medium">{h.name}</span> <span className="text-muted-foreground">· {h.phone}</span></span>
                  <Badge variant="outline" className="text-[10px]">{h.source}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CreateTaskDialog({
  open, onOpenChange, users, currentUserId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: AssignableUser[];
  currentUserId: string | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignTo, setAssignTo] = useState<string>("");
  const [customer, setCustomer] = useState<{ name: string; phone: string; source: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle(""); setDescription(""); setAssignTo(""); setCustomer(null);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!assignTo) return toast.error("Select an assignee");
    if (!currentUserId) return toast.error("Not signed in");
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assignTo,
      assigned_by: currentUserId,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? null,
      customer_source: customer?.source ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Task created");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Assign work to a teammate. Optionally link a customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call customer and confirm order" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Details</label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done? Any context, links…"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Customer (optional)</label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Assign to</label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name} {u.id === currentUserId ? "(me)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesField({ taskId, initialValue, disabled }: { taskId: string; initialValue: string; disabled?: boolean }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Sync external updates (realtime) when not actively editing
    if (!dirty) setValue(initialValue);
  }, [initialValue, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("tasks")
        .update({ notes: value.trim().length ? value : null })
        .eq("id", taskId);
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 1500);
    }, 700);
    return () => clearTimeout(handle);
  }, [value, dirty, taskId]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Notes</span>
        <span className="inline-flex items-center gap-1">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {saved && <><Check className="h-3 w-3 text-emerald-400" /> Saved</>}
        </span>
      </div>
      <Textarea
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => { setValue(e.target.value); setDirty(true); setSaved(false); }}
        placeholder={disabled ? "No edit access" : "Add a note…"}
        maxLength={4000}
        className="text-xs min-h-[44px]"
      />
    </div>
  );
}

