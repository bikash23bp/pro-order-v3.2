import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { parseSpreadsheet } from "@/lib/spreadsheet-parse";
import { Search, Crown, Send, Loader2, Upload, Download, FileDown, Pencil, X, MessageCircle, PhoneCall, ListChecks, ShieldAlert } from "lucide-react";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { MemberBadge } from "@/components/MemberBadge";
import { listCustomers, getCustomersForExport, type CustomerStat, bulkCreateFollowUpTasks, listFollowUpAssignees } from "@/lib/customers.functions";
import { sendCustomSms, sendBulkCustomerSms } from "@/lib/sms.functions";
import { sendBulkWhatsapp, getWhatsappSettings } from "@/lib/marketing.functions";
import { listTelesalesStaff, assignSystemCustomersToTelesales } from "@/lib/telesales.functions";
import { ImportCustomersDialog } from "@/components/customers/ImportCustomersDialog";
import { ExportMenu } from "@/components/ExportMenu";
import { CustomerProfileDialog } from "@/components/customers/CustomerProfileDialog";
import { CustomerTagPicker, TagBadges } from "@/components/customers/CustomerTagPicker";
import { CUSTOMER_TAGS, TAG_LABEL, type CustomerTag } from "@/lib/tags.functions";
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

export function AllCustomersTab({ customerType }: { customerType?: "retail" | "wholesale" } = {}) {
  const fetchList = useServerFn(listCustomers);
  const exportFn = useServerFn(getCustomersForExport);
  const sendSms = useServerFn(sendCustomSms);
  const sendBulk = useServerFn(sendBulkCustomerSms);
  const sendWa = useServerFn(sendBulkWhatsapp);
  const fetchWaSettings = useServerFn(getWhatsappSettings);
  const fetchTeleStaff = useServerFn(listTelesalesStaff);
  const assignTele = useServerFn(assignSystemCustomersToTelesales);
  const fetchAssignees = useServerFn(listFollowUpAssignees);
  const createTasks = useServerFn(bulkCreateFollowUpTasks);
  const [importOpen, setImportOpen] = useState(false);
  const [rows, setRows] = useState<CustomerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [smsTo, setSmsTo] = useState<CustomerStat | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ phone: string; name?: string | null } | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [discountFilter, setDiscountFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);

  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);
  const [teleStaff, setTeleStaff] = useState<Staff[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  const [waOpen, setWaOpen] = useState(false);
  const [waMsg, setWaMsg] = useState("");
  const [waSending, setWaSending] = useState(false);

  const [teleOpen, setTeleOpen] = useState(false);
  const [teleAssignee, setTeleAssignee] = useState<string>("");
  const [teleSaving, setTeleSaving] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("Follow up with customer");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);

  const [total, setTotal] = useState(0);
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    setLoading(true);
    try {
      const [from, to] = rangeFor(datePreset, customFrom, customTo);
      const res = await fetchList({
        data: {
          page,
          limit: pageSize,
          q: qDebounced || null,
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
          customerType: customerType ?? null,
        },
      });
      setRows(res.rows);
      setTotal(res.total);
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, pageSize, qDebounced, datePreset, customFrom, customTo, customerType]);
  useEffect(() => {
    const h = () => { load(); };
    window.addEventListener("customers:refresh", h);
    return () => window.removeEventListener("customers:refresh", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchWaSettings()
      .then((s: any) => setWaConfigured(!!(s?.enabled && s?.api_url && s?.api_token)))
      .catch(() => setWaConfigured(false));
    fetchTeleStaff().then((s: any) => setTeleStaff(s ?? [])).catch(() => {});
    fetchAssignees().then((a: any) => setAssignees(a ?? [])).catch(() => {});
  }, []);

  // Reset to page 1 whenever filters / search change
  useEffect(() => { setPage(1); }, [qDebounced, datePreset, customFrom, customTo, pageSize, sourceFilter, productFilter, discountFilter, tagFilter]);

  // Source/product dropdowns: derived from visible page (limitation: not global).
  const allSources = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.sources.forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [rows]);

  const allProducts = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.products.forEach((x) => s.add(x)));
    return Array.from(s).sort();
  }, [rows]);

  // Server already handled q + date + pagination; remaining filters apply on visible page only.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (sourceFilter !== "all" && !r.sources.includes(sourceFilter)) return false;
      if (productFilter !== "all" && !r.products.includes(productFilter)) return false;
      if (discountFilter === "with" && !r.has_discount) return false;
      if (discountFilter === "without" && r.has_discount) return false;
      if (tagFilter !== "all" && !(r.tags ?? []).includes(tagFilter as CustomerTag)) return false;
      return true;
    });
  }, [rows, sourceFilter, productFilter, discountFilter, tagFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paged = filtered;

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

  const filteredProducts = useMemo(() => {
    const s = productSearch.toLowerCase();
    return allProducts.filter((p) => p.toLowerCase().includes(s)).slice(0, 200);
  }, [allProducts, productSearch]);

  const submitSms = async () => {
    if (!smsTo || !smsMessage.trim()) return;
    setSending(true);
    try {
      await sendSms({ data: { phone: smsTo.phone, message: smsMessage.trim() } });
      toast.success("SMS sent");
      setSmsTo(null); setSmsMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally { setSending(false); }
  };

  const submitBulk = async () => {
    const contacts = rows
      .filter((r) => selected.has(r.phone))
      .map((r) => ({ phone: r.phone, name: r.name }));
    if (contacts.length === 0 || !bulkMessage.trim()) return;
    setBulkSending(true);
    try {
      const res = await sendBulk({ data: { contacts, message: bulkMessage.trim() } });
      toast.success(`Sent ${res.sent} / ${res.total} (${res.failed} failed)`);
      setBulkOpen(false); setBulkMessage(""); setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally { setBulkSending(false); }
  };

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.phone)),
    [rows, selected],
  );
  const selectedContacts = useMemo(
    () => selectedRows.map((r) => ({ phone: r.phone, name: r.name })),
    [selectedRows],
  );

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

  const getExportRows = async () => {
    const useSelection = selected.size > 0;
    const [from, to] = rangeFor(datePreset, customFrom, customTo);
    const all = await exportFn({
      data: useSelection
        ? { phones: Array.from(selected) }
        : {
            q: qDebounced || null,
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
          },
    });
    return all.map((r: any) => ({
      Name: r.name ?? "",
      Phone: r.phone,
      Email: r.email ?? "",
      Address: r.address ?? "",
      "Total Orders": r.total_orders,
      "Completed Orders": r.completed_orders,
      "Cancelled Orders": r.cancelled_orders,
      "Lifetime Value": Number(r.total_spent).toFixed(2),
      "First Order": r.first_order_at ?? "",
      "Last Order": r.last_order_at ?? "",
      VIP: r.is_vip ? "Yes" : "No",
    }));
  };

  const resetFilters = () => {
    setSourceFilter("all"); setProductFilter("all"); setDatePreset("all");
    setCustomFrom(""); setCustomTo(""); setDiscountFilter("all"); setTagFilter("all"); setQ("");
  };

  return (
    <div className="space-y-4">
      <ImportCustomersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => load()}
      />
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import Customers
        </Button>
        <ExportMenu
          filenameBase="customers"
          getRows={getExportRows}
          count={selected.size > 0 ? selected.size : undefined}
          label={selected.size > 0 ? `Export selected (${selected.size})` : "Export"}
        />
      </div>


      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Order Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {allSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Product" /></SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Search products…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-8"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <SelectItem value="all">All products</SelectItem>
                {filteredProducts.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

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

            <Select value={discountFilter} onValueChange={setDiscountFilter}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All discounts</SelectItem>
                <SelectItem value="with">With discount</SelectItem>
                <SelectItem value="without">No discount</SelectItem>
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Tag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {CUSTOMER_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>{TAG_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Rows</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-sm">
                <strong>{selected.size}</strong> selected
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { setBulkOpen(true); setBulkMessage(""); }}>
                  <Send className="h-4 w-4" /> SMS
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setWaOpen(true); setWaMsg(""); }}
                  disabled={waConfigured === false}
                  title={waConfigured === false ? "WhatsApp not configured" : "Send WhatsApp"}
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTeleOpen(true)}>
                  <PhoneCall className="h-4 w-4" /> Assign Telesales
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                  <ListChecks className="h-4 w-4" /> Assign Task
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  <X className="h-4 w-4" /> Clear
                </Button>
              </div>
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
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Returns</TableHead>
                <TableHead className="text-right">Lifetime Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No customers.</TableCell></TableRow>
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
                      <TagBadges tags={(r as any).tags} details={(r as any).tag_details} size="xs" />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.email ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.total_orders}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.cancelled_orders}</TableCell>
                  <TableCell className="text-right font-medium">৳ {Number(r.total_spent).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 items-center">
                      <CustomerTagPicker phone={r.phone} initialTags={(r as any).tags ?? []} buttonSize="xs" buttonLabel="Tag" showBadgesInline={false} />
                      <Button size="sm" variant="ghost" onClick={() => setProfilePhone(r.phone)} title="View / Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setSmsTo(r); setSmsMessage(""); }}>
                        <Send className="h-4 w-4" /> SMS
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setBlockTarget({ phone: r.phone, name: r.name })}
                        title="Block customer"
                      >
                        <ShieldAlert className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t text-sm">
          <div className="text-muted-foreground">
            {total === 0 ? "0 results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!smsTo} onOpenChange={(o) => !o && setSmsTo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send SMS to {smsTo?.name ?? smsTo?.phone}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{smsTo?.phone}</div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={4} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSmsTo(null)}>Cancel</Button>
            <Button onClick={submitSms} disabled={sending || !smsMessage.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Bulk SMS to {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Use <code>{`{{name}}`}</code> to personalize the message.
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} rows={5} maxLength={1000} placeholder="Hi {{name}}, ..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={submitBulk} disabled={bulkSending || !bulkMessage.trim()}>
              {bulkSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk WhatsApp */}
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

      {/* Assign to Telesales */}
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
            <p className="text-xs text-muted-foreground">
              প্রতিটি সিলেক্টেড কাস্টমারের জন্য আলাদা task তৈরি হবে।
            </p>
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

      {profilePhone && (
        <CustomerProfileDialog
          phone={profilePhone}
          open={!!profilePhone}
          onClose={() => setProfilePhone(null)}
          onUpdated={load}
        />
      )}

      <BlockCustomerDialog
        open={!!blockTarget}
        onOpenChange={(o) => !o && setBlockTarget(null)}
        defaultPhone={blockTarget?.phone}
        allowEdit={false}
        onBlocked={() => setBlockTarget(null)}
      />
    </div>
  );
}
