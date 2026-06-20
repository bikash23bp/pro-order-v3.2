import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Search, Send, Loader2, Download, X, Tag, MessageCircle, PhoneCall, ListChecks, Plus, Minus, Crown,
} from "lucide-react";
import { MemberBadge } from "@/components/MemberBadge";
import { listCustomers, type CustomerStat, bulkCreateFollowUpTasks, listFollowUpAssignees } from "@/lib/customers.functions";
import { sendBulkCustomerSms } from "@/lib/sms.functions";
import { sendBulkWhatsapp, getWhatsappSettings } from "@/lib/marketing.functions";
import { listTelesalesStaff, assignSystemCustomersToTelesales } from "@/lib/telesales.functions";
import { bulkAddTag, bulkRemoveTag, CUSTOMER_TAGS, TAG_LABEL, TAG_TONE, type CustomerTag } from "@/lib/tags.functions";
import { ExportMenu } from "@/components/ExportMenu";
import { CustomerProfileDialog } from "@/components/customers/CustomerProfileDialog";
import { CustomerTagPicker, TagBadges } from "@/components/customers/CustomerTagPicker";
import { TagDiscountSettingsCard } from "@/components/customers/TagDiscountSettingsCard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES, DATE_LABEL, rangeFor, type DatePreset } from "./shared";

type Staff = { id: string; name: string };
type Assignee = { id: string; display_name: string; email: string | null; role: string };

export function TaggedCustomersTab() {
  const fetchList = useServerFn(listCustomers);
  const sendSms = useServerFn(sendBulkCustomerSms);
  const sendWa = useServerFn(sendBulkWhatsapp);
  const fetchWaSettings = useServerFn(getWhatsappSettings);
  const fetchTeleStaff = useServerFn(listTelesalesStaff);
  const assignTele = useServerFn(assignSystemCustomersToTelesales);
  const fetchAssignees = useServerFn(listFollowUpAssignees);
  const createTasks = useServerFn(bulkCreateFollowUpTasks);
  const addTag = useServerFn(bulkAddTag);
  const removeTag = useServerFn(bulkRemoveTag);

  const [rows, setRows] = useState<CustomerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);
  const [teleStaff, setTeleStaff] = useState<Staff[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // Filters
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | "tagged" | CustomerTag>("tagged");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Pagination
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profilePhone, setProfilePhone] = useState<string | null>(null);

  // Dialogs
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMsg, setSmsMsg] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  const [waOpen, setWaOpen] = useState(false);
  const [waMsg, setWaMsg] = useState("");
  const [waSending, setWaSending] = useState(false);

  const [teleOpen, setTeleOpen] = useState(false);
  const [teleAssignee, setTeleAssignee] = useState<string>("");
  const [teleSaving, setTeleSaving] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("Follow up with tagged customer");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);

  const [tagOpen, setTagOpen] = useState<null | "add" | "remove">(null);
  const [tagPick, setTagPick] = useState<CustomerTag>("new_customer");
  const [tagSaving, setTagSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchList({ data: { page: 1, limit: 5000 } });
      setRows(res.rows);
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const h = () => { load(); };
    window.addEventListener("customers:refresh", h);
    return () => window.removeEventListener("customers:refresh", h);
  }, []);

  useEffect(() => {
    fetchWaSettings()
      .then((s: any) => setWaConfigured(!!(s?.enabled && s?.api_url && s?.api_token)))
      .catch(() => setWaConfigured(false));
    fetchTeleStaff().then((s: any) => setTeleStaff(s ?? [])).catch(() => {});
    fetchAssignees().then((a: any) => setAssignees(a ?? [])).catch(() => {});
  }, []);

  const taggedRows = useMemo(() => rows.filter((r) => r.tags.length > 0), [rows]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length, tagged: taggedRows.length };
    for (const t of CUSTOMER_TAGS) m[t] = 0;
    for (const r of taggedRows) for (const t of r.tags) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [rows, taggedRows]);

  const baseRows = useMemo(() => {
    if (tagFilter === "all") return rows;
    if (tagFilter === "tagged") return taggedRows;
    return taggedRows.filter((r) => r.tags.includes(tagFilter));
  }, [rows, taggedRows, tagFilter]);

  const filtered = useMemo(() => {
    const [from, to] = rangeFor(datePreset, customFrom, customTo);
    return baseRows.filter((r) => {
      if (q) {
        const s = q.toLowerCase();
        const hit = (r.name ?? "").toLowerCase().includes(s)
          || r.phone.includes(q)
          || (r.email ?? "").toLowerCase().includes(s);
        if (!hit) return false;
      }
      if (from || to) {
        if (!r.last_order_at) return false;
        const d = new Date(r.last_order_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
  }, [baseRows, q, datePreset, customFrom, customTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const pageAllSelected = paged.length > 0 && paged.every((r) => selected.has(r.phone));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) paged.forEach((r) => next.delete(r.phone));
      else paged.forEach((r) => next.add(r.phone));
      return next;
    });
  };
  const toggleOne = (phone: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  };

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.phone)), [rows, selected]);
  const selectedContacts = useMemo(
    () => selectedRows.map((r) => ({ phone: r.phone, name: r.name })),
    [selectedRows],
  );

  const getExportRows = () => filtered.map((r) => ({
    Name: r.name ?? "",
    Phone: r.phone,
    Email: r.email ?? "",
    Tags: r.tags.map((t) => TAG_LABEL[t]).join("; "),
    "Total Orders": r.total_orders,
    "Completed Orders": r.completed_orders,
    "Lifetime Value": Number(r.total_spent).toFixed(2),
    "Last Order": r.last_order_at ?? "",
  }));

  const submitSms = async () => {
    if (selectedContacts.length === 0 || !smsMsg.trim()) return;
    setSmsSending(true);
    try {
      const res = await sendSms({ data: { contacts: selectedContacts, message: smsMsg.trim() } });
      toast.success(`Sent ${res.sent} / ${res.total} (${res.failed} failed)`);
      setSmsOpen(false); setSmsMsg(""); setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSmsSending(false); }
  };

  const submitWa = async () => {
    if (selectedContacts.length === 0 || !waMsg.trim()) return;
    setWaSending(true);
    try {
      const res = await sendWa({ data: { recipients: selectedContacts, message: waMsg.trim() } });
      toast.success(`Sent ${res.sent} / ${res.total} (${res.failed} failed)`);
      setWaOpen(false); setWaMsg(""); setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setWaSending(false); }
  };

  const submitTele = async () => {
    if (selectedContacts.length === 0) return;
    setTeleSaving(true);
    try {
      const res = await assignTele({
        data: {
          customers: selectedRows.map((r) => ({ name: r.name, phone: r.phone, address: r.address })),
          assignedTo: teleAssignee || null,
        },
      });
      toast.success(`Telesales: ${res.created} created, ${res.updated} updated`);
      setTeleOpen(false); setTeleAssignee(""); setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setTeleSaving(false); }
  };

  const submitTask = async () => {
    if (selectedContacts.length === 0 || !taskTitle.trim() || !taskAssignee) {
      return toast.error("Title ও assignee দরকার");
    }
    setTaskSaving(true);
    try {
      const res = await createTasks({
        data: {
          title: taskTitle.trim(),
          description: taskDesc.trim() || null,
          assigned_to: taskAssignee,
          customers: selectedRows.map((r) => ({ name: r.name, phone: r.phone })),
        },
      });
      toast.success(`${res.created} টি follow-up task তৈরি হয়েছে`);
      setTaskOpen(false); setTaskDesc(""); setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setTaskSaving(false); }
  };

  const submitBulkTag = async () => {
    if (selectedContacts.length === 0) return;
    setTagSaving(true);
    try {
      const phones = selectedRows.map((r) => r.phone);
      if (tagOpen === "add") {
        const res = await addTag({ data: { phones, tag: tagPick } });
        toast.success(`${res.added} টি কাস্টমারে ${TAG_LABEL[tagPick]} ট্যাগ যোগ হয়েছে`);
      } else {
        await removeTag({ data: { phones, tag: tagPick } });
        toast.success(`${TAG_LABEL[tagPick]} ট্যাগ সরানো হয়েছে`);
      }
      setTagOpen(null); setSelected(new Set());
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setTagSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><Tag className="h-5 w-5" /></div>
          <div>
            <div className="font-semibold leading-tight">Tagged Customers</div>
            <div className="text-xs text-muted-foreground">
              ট্যাগ অনুযায়ী কাস্টমার দেখুন, ফিল্টার ও বাল্ক অ্যাকশন নিন · মোট ট্যাগেড <strong>{counts.tagged}</strong> · ফিল্টারে <strong>{filtered.length}</strong>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu filenameBase="tagged-customers" getRows={getExportRows} count={filtered.length} />
        </div>
      </div>

      <TagDiscountSettingsCard />

      {/* Tag chips quick filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={tagFilter === "tagged" ? "default" : "outline"}
          onClick={() => setTagFilter("tagged")}
        >
          All Tagged <Badge variant="secondary" className="ml-1">{counts.tagged}</Badge>
        </Button>
        {CUSTOMER_TAGS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tagFilter === t ? "default" : "outline"}
            onClick={() => setTagFilter(t)}
            className="gap-1.5"
          >
            <span className={`inline-block w-2 h-2 rounded-full ${TAG_TONE[t].split(" ")[0]}`} />
            {TAG_LABEL[t]} <Badge variant="secondary" className="ml-1">{counts[t]}</Badge>
          </Button>
        ))}
        <Button
          size="sm"
          variant={tagFilter === "all" ? "default" : "ghost"}
          onClick={() => setTagFilter("all")}
        >
          All Customers
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DATE_LABEL) as DatePreset[]).map((k) =>
                  <SelectItem key={k} value={k}>{DATE_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            {datePreset === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[150px]" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[150px]" />
              </>
            )}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm h-9" />
            </div>
            <Label className="text-xs text-muted-foreground">Rows</Label>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-sm"><strong>{selected.size}</strong> selected</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => { setSmsOpen(true); setSmsMsg(""); }}>
                  <Send className="h-4 w-4" /> SMS
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setWaOpen(true); setWaMsg(""); }} disabled={waConfigured === false}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTeleOpen(true)}>
                  <PhoneCall className="h-4 w-4" /> Assign Telesales
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                  <ListChecks className="h-4 w-4" /> Assign Task
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setTagOpen("add"); setTagPick("new_customer"); }}>
                  <Plus className="h-4 w-4" /> Add Tag
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setTagOpen("remove"); setTagPick("new_customer"); }}>
                  <Minus className="h-4 w-4" /> Remove Tag
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4" /> Clear
                </Button>
              </div>
            </div>
          )}
          {waConfigured === false && (
            <div className="text-xs text-muted-foreground">
              WhatsApp পাঠাতে আগে <Link to="/marketing/settings" className="underline">settings</Link> এ API configure করুন।
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={pageAllSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Lifetime Value</TableHead>
                <TableHead className="hidden md:table-cell">Last Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No tagged customers in this view.</TableCell></TableRow>
              ) : paged.map((r) => (
                <TableRow key={r.phone} data-state={selected.has(r.phone) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(r.phone)} onCheckedChange={() => toggleOne(r.phone)} aria-label={`Select ${r.name ?? r.phone}`} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button className="text-primary hover:underline text-left" onClick={() => setProfilePhone(r.phone)}>
                        {r.name ?? "—"}
                      </button>
                      <MemberBadge phone={r.phone} />
                      {r.is_vip && (
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                          <Crown className="h-3 w-3" /> VIP
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <TagBadges tags={r.tags} size="xs" />
                      <CustomerTagPicker
                        phone={r.phone}
                        initialTags={r.tags}
                        buttonLabel=""
                        buttonSize="icon"
                        buttonVariant="ghost"
                        showBadgesInline={false}
                        onChange={() => load()}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{r.total_orders}</TableCell>
                  <TableCell className="text-right font-medium">৳ {Number(r.total_spent).toFixed(2)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t text-sm">
          <div className="text-muted-foreground">
            {filtered.length === 0 ? "0 results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </Card>

      {/* Bulk SMS */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>SMS to {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Use <code>{`{{name}}`}</code> to personalize.</div>
            <Textarea value={smsMsg} onChange={(e) => setSmsMsg(e.target.value)} rows={5} maxLength={1000} placeholder="Hi {{name}}, …" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSmsOpen(false)}>Cancel</Button>
            <Button onClick={submitSms} disabled={smsSending || !smsMsg.trim()}>
              {smsSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>WhatsApp to {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Use <code>{`{{name}}`}</code> to personalize.</div>
            <Textarea value={waMsg} onChange={(e) => setWaMsg(e.target.value)} rows={5} maxLength={1000} placeholder="Hi {{name}}, …" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWaOpen(false)}>Cancel</Button>
            <Button onClick={submitWa} disabled={waSending || !waMsg.trim()}>
              {waSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Telesales */}
      <Dialog open={teleOpen} onOpenChange={setTeleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {selected.size} to Telesales</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Telesales staff</Label>
              <Select value={teleAssignee} onValueChange={setTeleAssignee}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned (pool)" /></SelectTrigger>
                <SelectContent>
                  {teleStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Empty রাখলে unassigned pool-এ যাবে। বিদ্যমান assignment থাকলে reassign হবে।
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTeleOpen(false)}>Cancel</Button>
            <Button onClick={submitTele} disabled={teleSaving}>
              {teleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Task */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create follow-up task for {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={3} maxLength={2000} />
            </div>
            <div className="space-y-1">
              <Label>Assign to</Label>
              <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select assignee" /></SelectTrigger>
                <SelectContent>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.display_name} <span className="text-muted-foreground text-xs">({a.role})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button onClick={submitTask} disabled={taskSaving || !taskTitle.trim() || !taskAssignee}>
              {taskSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk tag add/remove */}
      <Dialog open={tagOpen !== null} onOpenChange={(o) => !o && setTagOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tagOpen === "add" ? "Add tag to" : "Remove tag from"} {selected.size} customer(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Tag</Label>
            <Select value={tagPick} onValueChange={(v) => setTagPick(v as CustomerTag)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CUSTOMER_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>{TAG_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagOpen(null)}>Cancel</Button>
            <Button onClick={submitBulkTag} disabled={tagSaving}>
              {tagSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : tagOpen === "add" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {tagOpen === "add" ? "Add" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {profilePhone && (
        <CustomerProfileDialog
          phone={profilePhone}
          open={!!profilePhone}
          onClose={() => setProfilePhone(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
