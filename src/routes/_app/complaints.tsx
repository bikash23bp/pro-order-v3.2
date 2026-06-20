import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareWarning, Plus, CheckCircle2, PhoneCall, ListTodo } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listComplaints, getComplaintStaffStats, updateComplaint,
  COMPLAINT_CATEGORIES, COMPLAINT_SEVERITIES, COMPLAINT_STATUSES,
  CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, SEVERITY_TONE, STATUS_TONE,
  type ComplaintRow, type ComplaintCategory, type ComplaintSeverity, type ComplaintStatus,
} from "@/lib/complaints.functions";
import { importTelesalesCustomers } from "@/lib/telesales.functions";
import { ComplaintDialog } from "@/components/complaints/ComplaintDialog";

export const Route = createFileRoute("/_app/complaints")({
  head: () => ({ meta: [{ title: "Complaints — OMS" }] }),
  component: ComplaintsPage,
});

type DatePreset = "all" | "today" | "7d" | "30d" | "month";

function rangeFor(p: DatePreset): { from: string | null; to: string | null } {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  if (p === "all") return { from: null, to: null };
  const from = new Date(now);
  if (p === "today") from.setHours(0, 0, 0, 0);
  else if (p === "7d") { from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0); }
  else if (p === "30d") { from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0); }
  else if (p === "month") { from.setMonth(from.getMonth() - 1); from.setHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to: to.toISOString() };
}

const PAGE_SIZES = [10, 50, 100];

function ComplaintsPage() {
  const listFn = useServerFn(listComplaints);
  const statsFn = useServerFn(getComplaintStaffStats);
  const updateFn = useServerFn(updateComplaint);
  const assignTelesales = useServerFn(importTelesalesCustomers);

  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ComplaintStatus | "all">("all");
  const [category, setCategory] = useState<ComplaintCategory | "all">("all");
  const [severity, setSeverity] = useState<ComplaintSeverity | "all">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getComplaintStaffStats>> | null>(null);

  const [openDialog, setOpenDialog] = useState(false);
  const [dialogPhone, setDialogPhone] = useState("");
  const [dialogName, setDialogName] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const [assignableUsers, setAssignableUsers] = useState<{ id: string; display_name: string }[]>([]);
  const [tsTarget, setTsTarget] = useState<ComplaintRow | null>(null);
  const [tsUserId, setTsUserId] = useState("");
  const [tsBusy, setTsBusy] = useState(false);
  const [taskTarget, setTaskTarget] = useState<ComplaintRow | null>(null);
  const [taskUserId, setTaskUserId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUserId, setBulkUserId] = useState("");
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkDesc, setBulkDesc] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTsOpen, setBulkTsOpen] = useState(false);
  const [bulkTsUserId, setBulkTsUserId] = useState("");
  const [bulkTsBusy, setBulkTsBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = rangeFor(datePreset);
      const data = await listFn({ data: {
        q: q || null,
        status: status === "all" ? null : status,
        category: category === "all" ? null : category,
        severity: severity === "all" ? null : severity,
        from: r.from, to: r.to,
      }});
      setRows(data);
      setPage(1);
    } finally { setLoading(false); }
  };

  const loadStats = async () => {
    const r = rangeFor(datePreset);
    const s = await statsFn({ data: { from: r.from, to: r.to } });
    setStats(s);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("list_assignable_users");
      setAssignableUsers((data ?? []) as { id: string; display_name: string }[]);
    })();
  }, []);

  useEffect(() => { load(); loadStats(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setTimeout(() => { load(); loadStats(); }, 300);
    return () => clearTimeout(t);
  }, [q, status, category, severity, datePreset]);

  const openCount = useMemo(
    () => rows.filter((r) => r.status === "open" || r.status === "in_progress").length,
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  const quickResolve = async (c: ComplaintRow) => {
    const note = window.prompt("Resolution note (optional):", "") ?? "";
    try {
      await updateFn({ data: { id: c.id, status: "resolved", resolution_note: note || null } });
      toast.success("Resolved");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const submitTelesales = async () => {
    if (!tsTarget || !tsUserId) return;
    if (!tsTarget.phone?.trim()) { toast.error("No phone"); return; }
    setTsBusy(true);
    try {
      const res = await assignTelesales({ data: {
        rows: [{ name: tsTarget.customer_name, phone: tsTarget.phone, address: null }],
        assignedTo: tsUserId,
      }});
      const name = assignableUsers.find((u) => u.id === tsUserId)?.display_name ?? "user";
      toast.success(`Assigned to ${name} (new: ${res.assignmentsCreated}, re: ${res.assignmentsUpdated})`);
      setTsTarget(null); setTsUserId("");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setTsBusy(false); }
  };

  const submitTask = async () => {
    if (!taskTarget || !taskUserId) return;
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes.user?.id;
    if (!me) { toast.error("Not signed in"); return; }
    setTaskBusy(true);
    try {
      const title = taskTitle.trim() || `Complaint — ${taskTarget.customer_name || taskTarget.phone}`;
      const desc = [
        taskDesc.trim(),
        `Complaint: [${CATEGORY_LABEL[taskTarget.category]}/${SEVERITY_LABEL[taskTarget.severity]}] ${taskTarget.note}`,
      ].filter(Boolean).join("\n\n");
      const { error } = await supabase.from("tasks").insert({
        assigned_to: taskUserId,
        assigned_by: me,
        title, description: desc,
        customer_name: taskTarget.customer_name,
        customer_phone: taskTarget.phone,
        customer_source: "complaint" as any,
        status: "pending" as const,
      });
      if (error) throw error;
      const name = assignableUsers.find((u) => u.id === taskUserId)?.display_name ?? "user";
      toast.success(`Task assigned to ${name}`);
      setTaskTarget(null); setTaskUserId(""); setTaskTitle(""); setTaskDesc("");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setTaskBusy(false); }
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const togglePage = (checked: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      for (const r of pageRows) checked ? n.add(r.id) : n.delete(r.id);
      return n;
    });
  };
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const submitBulkTask = async () => {
    if (!bulkUserId || selected.size === 0) return;
    const { data: userRes } = await supabase.auth.getUser();
    const me = userRes.user?.id;
    if (!me) { toast.error("Not signed in"); return; }
    setBulkBusy(true);
    try {
      const picked = rows.filter((r) => selected.has(r.id));
      const payload = picked.map((c) => ({
        assigned_to: bulkUserId,
        assigned_by: me,
        title: bulkTitle.trim() || `Complaint — ${c.customer_name || c.phone}`,
        description: [
          bulkDesc.trim(),
          `Complaint: [${CATEGORY_LABEL[c.category]}/${SEVERITY_LABEL[c.severity]}] ${c.note}`,
        ].filter(Boolean).join("\n\n"),
        customer_name: c.customer_name,
        customer_phone: c.phone,
        customer_source: "complaint" as any,
        status: "pending" as const,
      }));
      const { error } = await supabase.from("tasks").insert(payload);
      if (error) throw error;
      const name = assignableUsers.find((u) => u.id === bulkUserId)?.display_name ?? "user";
      toast.success(`${payload.length} task(s) assigned to ${name}`);
      setBulkOpen(false); setBulkUserId(""); setBulkTitle(""); setBulkDesc("");
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBulkBusy(false); }
  };

  const submitBulkTelesales = async () => {
    if (!bulkTsUserId || selected.size === 0) return;
    setBulkTsBusy(true);
    try {
      const picked = rows.filter((r) => selected.has(r.id) && r.phone?.trim());
      if (picked.length === 0) { toast.error("No valid phones"); setBulkTsBusy(false); return; }
      const res = await assignTelesales({ data: {
        rows: picked.map((c) => ({ name: c.customer_name, phone: c.phone, address: null })),
        assignedTo: bulkTsUserId,
      }});
      const name = assignableUsers.find((u) => u.id === bulkTsUserId)?.display_name ?? "user";
      toast.success(`Assigned ${picked.length} to ${name} (new: ${res.assignmentsCreated}, re: ${res.assignmentsUpdated})`);
      setBulkTsOpen(false); setBulkTsUserId(""); setSelected(new Set());
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setBulkTsBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageSquareWarning className="h-6 w-6 text-rose-400" /> Complaints
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and resolve customer complaints. {openCount} unresolved.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New complaint
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="staff">By Staff</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  ["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "1 month"], ["all", "All"],
                ] as [DatePreset, string][]).map(([k, lbl]) => (
                  <Button key={k} size="sm" variant={datePreset === k ? "default" : "outline"}
                    onClick={() => setDatePreset(k)}>{lbl}</Button>
                ))}
              </div>

              {selected.size > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                  <span className="text-sm font-medium">{selected.size} selected</span>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                    <Button size="sm" variant="outline" onClick={() => setBulkTsOpen(true)}>
                      <PhoneCall className="h-4 w-4 mr-1" /> Assign to telesales
                    </Button>
                    <Button size="sm" onClick={() => setBulkOpen(true)}>
                      <ListTodo className="h-4 w-4 mr-1" /> Assign as task
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Input placeholder="Search phone / name / note…" value={q} onChange={(e) => setQ(e.target.value)} className="md:col-span-2" />
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    {COMPLAINT_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {COMPLAINT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All severity</SelectItem>
                    {COMPLAINT_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={allPageSelected}
                          onCheckedChange={(v) => togglePage(!!v)} />
                      </TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow><TableCell colSpan={9} className="text-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin inline" />
                      </TableCell></TableRow>
                    )}
                    {!loading && pageRows.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                        No complaints found.
                      </TableCell></TableRow>
                    )}
                    {pageRows.map((c) => (
                      <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox checked={selected.has(c.id)}
                            onCheckedChange={() => toggleOne(c.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.customer_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{c.phone}</div>
                        </TableCell>
                        <TableCell>
                          <span className="px-1.5 py-0.5 rounded border text-[10px] bg-muted">{CATEGORY_LABEL[c.category]}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_TONE[c.severity]}`}>
                            {SEVERITY_LABEL[c.severity]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${STATUS_TONE[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs truncate">{c.note}</TableCell>
                        <TableCell className="text-xs">{c.created_by_name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1 flex-wrap">
                            {c.status !== "resolved" && (
                              <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                onClick={() => quickResolve(c)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />Resolve
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-7 text-[11px]"
                              onClick={() => { setTsTarget(c); setTsUserId(""); }}>
                              <PhoneCall className="h-3 w-3 mr-1" />Telesales
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]"
                              onClick={() => {
                                setTaskTarget(c); setTaskUserId("");
                                setTaskTitle(""); setTaskDesc("");
                              }}>
                              <ListTodo className="h-3 w-3 mr-1" />Task
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                              onClick={() => {
                                setDialogPhone(c.phone);
                                setDialogName(c.customer_name);
                                setOpenDialog(true);
                              }}>View</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <div className="text-xs text-muted-foreground">
                  Total {rows.length} • Page {page}/{totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader><CardTitle className="text-base">Complaints logged by each staff</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Resolved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats?.staff ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right font-medium">{s.total}</TableCell>
                      <TableCell className="text-right text-rose-400">{s.open}</TableCell>
                      <TableCell className="text-right text-emerald-400">{s.resolved}</TableCell>
                    </TableRow>
                  ))}
                  {stats && stats.staff.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No data.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <Card>
            <CardHeader><CardTitle className="text-base">Category-wise breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Category</TableHead><TableHead className="text-right">Count</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(stats?.categories ?? []).map((c) => (
                    <TableRow key={c.category}>
                      <TableCell>{CATEGORY_LABEL[c.category]}</TableCell>
                      <TableCell className="text-right font-medium">{c.count}</TableCell>
                    </TableRow>
                  ))}
                  {stats && stats.categories.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No data.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {openDialog && (
        <ComplaintDialog
          open={openDialog}
          onOpenChange={(v) => { setOpenDialog(v); if (!v) load(); }}
          phone={dialogPhone}
          customerName={dialogName}
        />
      )}

      <NewComplaintQuick
        open={newOpen}
        onClose={() => { setNewOpen(false); load(); }}
        phone={newPhone}
        setPhone={setNewPhone}
      />

      {/* Telesales assign dialog */}
      <Dialog open={!!tsTarget} onOpenChange={(v) => { if (!v) setTsTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign to telesales</DialogTitle>
            <DialogDescription>{tsTarget?.customer_name || tsTarget?.phone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Assign to</Label>
            <Select value={tsUserId} onValueChange={setTsUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setTsTarget(null)}>Cancel</Button>
              <Button disabled={!tsUserId || tsBusy} onClick={submitTelesales}>
                {tsBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task assign dialog */}
      <Dialog open={!!taskTarget} onOpenChange={(v) => { if (!v) setTaskTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign as task</DialogTitle>
            <DialogDescription>{taskTarget?.customer_name || taskTarget?.phone}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Assign to</Label>
            <Select value={taskUserId} onValueChange={setTaskUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label className="text-xs">Title (optional)</Label>
            <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow up complaint…" />
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={3} value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setTaskTarget(null)}>Cancel</Button>
              <Button disabled={!taskUserId || taskBusy} onClick={submitTask}>
                {taskBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk task assign dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {selected.size} complaint(s) as tasks</DialogTitle>
            <DialogDescription>One task will be created per selected complaint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Assign to</Label>
            <Select value={bulkUserId} onValueChange={setBulkUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label className="text-xs">Title (optional)</Label>
            <Input value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} placeholder="Follow up complaint…" />
            <Label className="text-xs">Note (optional)</Label>
            <Textarea rows={3} value={bulkDesc} onChange={(e) => setBulkDesc(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button disabled={!bulkUserId || bulkBusy || selected.size === 0} onClick={submitBulkTask}>
                {bulkBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Create tasks
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Bulk telesales assign dialog */}
      <Dialog open={bulkTsOpen} onOpenChange={setBulkTsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign {selected.size} complaint(s) to telesales</DialogTitle>
            <DialogDescription>Customers will be added to the selected telesales user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Assign to</Label>
            <Select value={bulkTsUserId} onValueChange={setBulkTsUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setBulkTsOpen(false)}>Cancel</Button>
              <Button disabled={!bulkTsUserId || bulkTsBusy || selected.size === 0} onClick={submitBulkTelesales}>
                {bulkTsBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewComplaintQuick({
  open, onClose, phone, setPhone,
}: {
  open: boolean; onClose: () => void;
  phone: string; setPhone: (v: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => { if (!open) setDialogOpen(false); }, [open]);

  if (!open) return null;
  if (dialogOpen) {
    return (
      <ComplaintDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) onClose(); }}
        phone={phone}
      />
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-lg p-4 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Customer phone</h3>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" autoFocus />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={phone.trim().length < 6} onClick={() => setDialogOpen(true)}>Continue</Button>
        </div>
      </div>
    </div>
  );
}
