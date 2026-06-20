import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { parseSpreadsheet } from "@/lib/spreadsheet-parse";
import { Search, Loader2, Upload, Download, FileDown, Pencil, Plus, UserPlus, Trash2, Star, Percent, Save, Send, MessageCircle, PhoneCall, ListChecks, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMembershipDiscount, invalidateMembershipDiscount } from "@/hooks/use-membership-phones";
import { listCustomers, type CustomerStat, bulkCreateFollowUpTasks, listFollowUpAssignees } from "@/lib/customers.functions";
import { sendBulkCustomerSms } from "@/lib/sms.functions";
import { sendBulkWhatsapp, getWhatsappSettings } from "@/lib/marketing.functions";
import { listTelesalesStaff, assignSystemCustomersToTelesales } from "@/lib/telesales.functions";
import { downloadCsv } from "@/lib/export-utils";
import { ExportMenu } from "@/components/ExportMenu";
import {
  listMembershipCustomers,
  addMembershipCustomer,
  updateMembershipCustomer,
  removeMembershipCustomer,
  bulkAddMembership,
  importMembershipCustomers,
  type MembershipCustomer,
} from "@/lib/membership.functions";
import { filterMembershipCustomers } from "@/lib/membership-filter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES, DATE_LABEL, type DatePreset } from "./shared";

type MemberForm = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  date_of_birth: string;
  tier: string;
  notes: string;
};

const emptyMember: MemberForm = {
  name: "", phone: "", email: "", address: "", date_of_birth: "", tier: "standard", notes: "",
};

export function MembershipTab() {
  const fetchList = useServerFn(listMembershipCustomers);
  const fetchAll = useServerFn(listCustomers);
  const addFn = useServerFn(addMembershipCustomer);
  const updateFn = useServerFn(updateMembershipCustomer);
  const removeFn = useServerFn(removeMembershipCustomer);
  const bulkFn = useServerFn(bulkAddMembership);
  const importFn = useServerFn(importMembershipCustomers);
  const sendSms = useServerFn(sendBulkCustomerSms);
  const sendWa = useServerFn(sendBulkWhatsapp);
  const fetchWaSettings = useServerFn(getWhatsappSettings);
  const fetchTeleStaff = useServerFn(listTelesalesStaff);
  const assignTele = useServerFn(assignSystemCustomersToTelesales);
  const fetchAssignees = useServerFn(listFollowUpAssignees);
  const createTasks = useServerFn(bulkCreateFollowUpTasks);

  type Staff = { id: string; name: string };
  type Assignee = { id: string; display_name: string; email: string | null; role: string };

  const [rows, setRows] = useState<MembershipCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | "discount" | "cancelled" | "fraud">("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyMember);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [allCust, setAllCust] = useState<CustomerStat[]>([]);
  const [allCustLoading, setAllCustLoading] = useState(false);
  const [allCustQ, setAllCustQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Bulk selection on members table
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);
  const [teleStaff, setTeleStaff] = useState<Staff[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

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
  const [taskTitle, setTaskTitle] = useState("Follow up with member");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchList()); }
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

  const filteredProducts = useMemo(() => {
    const s = productSearch.toLowerCase();
    return allProducts.filter((p) => p.toLowerCase().includes(s)).slice(0, 200);
  }, [allProducts, productSearch]);

  const filtered = useMemo(
    () => filterMembershipCustomers(rows, {
      q, source: sourceFilter, product: productFilter, tag: tagFilter,
      datePreset, customFrom, customTo,
    }),
    [rows, q, sourceFilter, productFilter, tagFilter, datePreset, customFrom, customTo],
  );

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

  const openAdd = () => { setForm(emptyMember); setEditOpen(true); };
  const openEdit = (r: MembershipCustomer) => {
    setForm({
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email ?? "",
      address: r.address ?? "",
      date_of_birth: r.date_of_birth ?? "",
      tier: r.tier ?? "standard",
      notes: r.notes ?? "",
    });
    setEditOpen(true);
  };

  const saveMember = async () => {
    if (!form.phone.trim()) return toast.error("Phone is required");
    setSaving(true);
    try {
      const payload = {
        name: form.name || null,
        phone: form.phone,
        email: form.email || null,
        address: form.address || null,
        date_of_birth: form.date_of_birth || null,
        tier: form.tier || "standard",
        notes: form.notes || null,
      };
      if (form.id) await updateFn({ data: { ...payload, id: form.id } });
      else await addFn({ data: payload });
      toast.success(form.id ? "Member updated" : "Member added");
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const removeMember = async (id: string) => {
    if (!confirm("Remove this membership?")) return;
    try {
      await removeFn({ data: { id } });
      toast.success("Removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const openAssign = async () => {
    setAssignOpen(true);
    setPicked(new Set());
    if (allCust.length === 0) {
      setAllCustLoading(true);
      try {
        const res = await fetchAll({ data: { page: 1, limit: 5000, enrich: false } });
        setAllCust(res.rows);
      }
      catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load customers"); }
      finally { setAllCustLoading(false); }
    }
  };

  const memberPhones = useMemo(() => new Set(rows.map((r) => r.phone.replace(/\D/g, "").slice(-11))), [rows]);
  const filteredAllCust = useMemo(() => {
    const s = allCustQ.toLowerCase();
    return allCust.filter((c) => {
      if (memberPhones.has(c.phone.replace(/\D/g, "").slice(-11))) return false;
      if (!s) return true;
      return (c.name ?? "").toLowerCase().includes(s) || c.phone.includes(allCustQ) || (c.email ?? "").toLowerCase().includes(s);
    }).slice(0, 500);
  }, [allCust, allCustQ, memberPhones]);

  const submitAssign = async () => {
    const items = allCust.filter((c) => picked.has(c.phone));
    if (items.length === 0) return toast.error("Select at least one customer");
    setAssigning(true);
    try {
      const res = await bulkFn({
        data: {
          customers: items.map((c) => ({
            name: c.name, phone: c.phone, email: c.email, address: c.address,
          })),
        },
      });
      toast.success(`Added ${res.inserted} member(s)`);
      setAssignOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    } finally { setAssigning(false); }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { rows } = await parseSpreadsheet(file);
      const norm = (s: string) => s.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_");
      const pick = (r: Record<string, string>, keys: string[]) => {
        for (const k of keys) {
          const v = r[k];
          if (v != null && String(v).trim() !== "") return String(v).trim();
        }
        return "";
      };
      const parsed = rows
        .map((row) => {
          const r: Record<string, string> = {};
          for (const k of Object.keys(row)) r[norm(k)] = row[k];
          return {
            name: pick(r, ["name", "customer", "customer_name", "full_name"]) || null,
            phone: pick(r, ["phone", "mobile", "phone_number", "contact"]),
            email: pick(r, ["email"]) || null,
            address: pick(r, ["address", "location"]) || null,
            date_of_birth: pick(r, ["date_of_birth", "dob", "birthday"]) || null,
          };
        })
        .filter((r) => r.phone);
      if (parsed.length === 0) { toast.error("No valid rows"); setImporting(false); return; }
      const r = await importFn({ data: { rows: parsed } });
      toast.success(`Imported ${r.inserted} member(s) (${r.skipped} skipped)`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally { setImporting(false); }
  };

  const downloadDemo = () => {
    downloadCsv("membership-import-template.csv", [
      { name: "John Doe", phone: "01712345678", email: "john@x.com", address: "Dhaka", date_of_birth: "1990-01-15" },
    ]);
  };

  const getExportRows = () => filtered.map((r) => ({
    Name: r.name ?? "",
    Phone: r.phone,
    Email: r.email ?? "",
    Address: r.address ?? "",
    "Date of Birth": r.date_of_birth ?? "",
    Tier: r.tier,
    "Total Orders": r.total_orders,
    "Total Spent": Number(r.total_spent).toFixed(2),
    "Joined": r.created_at,
  }));

  const resetFilters = () => {
    setSourceFilter("all"); setProductFilter("all"); setDatePreset("all");
    setCustomFrom(""); setCustomTo(""); setTagFilter("all"); setQ("");
  };

  // ----- Auto-discount settings -----
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "business_owner";
  const currentDiscount = useMembershipDiscount();
  const [discEnabled, setDiscEnabled] = useState<boolean>(currentDiscount.enabled);
  const [discPct, setDiscPct] = useState<string>(String(Math.round(currentDiscount.rate * 100)));
  const [discSaving, setDiscSaving] = useState(false);
  useEffect(() => {
    setDiscEnabled(currentDiscount.enabled);
    setDiscPct(String(Math.round(currentDiscount.rate * 100)));
  }, [currentDiscount.enabled, currentDiscount.rate]);

  const saveDiscount = async () => {
    const pct = Number(discPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return toast.error("Percent must be between 0 and 100");
    }
    setDiscSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        membership_discount_enabled: discEnabled,
        membership_discount_rate: +(pct / 100).toFixed(4),
      })
      .eq("id", true);
    setDiscSaving(false);
    if (error) return toast.error(error.message);
    invalidateMembershipDiscount();
    toast.success("Membership discount updated");
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-amber-500" />
            <div className="font-semibold">Auto Membership Discount</div>
            <Badge variant={discEnabled ? "default" : "secondary"} className="ml-1">
              {discEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={discEnabled} onCheckedChange={setDiscEnabled} disabled={!isAdmin} id="disc-enabled" />
              <Label htmlFor="disc-enabled" className="text-sm">Auto-discount enabled</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Discount %</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discPct}
                  onChange={(e) => setDiscPct(e.target.value)}
                  disabled={!isAdmin || !discEnabled}
                  className="w-24 h-9"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[5, 10, 15, 20].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={Number(discPct) === n ? "default" : "outline"}
                  onClick={() => setDiscPct(String(n))}
                  disabled={!isAdmin || !discEnabled}
                >
                  {n}%
                </Button>
              ))}
            </div>
            <Button onClick={saveDiscount} disabled={!isAdmin || discSaving} className="ml-auto">
              {discSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            এই rate নতুন order ও edit-এ membership customer-দের subtotal-এ অটো বসবে। Off থাকলে কোনো auto-discount অ্যাপ্লাই হবে না।
            {!isAdmin && " শুধু admin পরিবর্তন করতে পারবেন।"}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={onImportFile} />
        <Button variant="outline" onClick={openAssign}>
          <UserPlus className="h-4 w-4" /> Assign from Customers
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import
        </Button>
        <Button variant="outline" onClick={downloadDemo}>
          <FileDown className="h-4 w-4" /> CSV Demo
        </Button>
        <ExportMenu filenameBase="membership" getRows={getExportRows} count={filtered.length} />
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Member
        </Button>
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
                  <Input placeholder="Search products…" value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)} className="h-8"
                    onKeyDown={(e) => e.stopPropagation()} />
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

            <Select value={tagFilter} onValueChange={(v) => setTagFilter(v as typeof tagFilter)}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                <SelectItem value="discount">With discount</SelectItem>
                <SelectItem value="cancelled">Has cancelled</SelectItem>
                <SelectItem value="fraud">Possible fraud (2+ cancels)</SelectItem>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-sm"><strong>{selected.size}</strong> selected</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => { setSmsOpen(true); setSmsMsg(""); }}>
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
                <TableHead>Member</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Address</TableHead>
                <TableHead className="hidden lg:table-cell">DOB</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No members yet.</TableCell></TableRow>
              ) : paged.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.phone) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(r.phone)} onCheckedChange={() => toggleOne(r.phone)} aria-label={`Select ${r.name ?? r.phone}`} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.name ?? "—"}
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                        <Star className="h-3 w-3" /> Member
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.email ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">{r.address ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{r.date_of_birth ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.tier}</Badge></TableCell>
                  <TableCell className="text-right">{r.total_orders}</TableCell>
                  <TableCell className="text-right font-medium">৳ {Number(r.total_spent).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeMember(r.id)}>
                        <Trash2 className="h-4 w-4" />
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
            {filtered.length === 0 ? "0 results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit Member" : "Add Membership Customer"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveMember} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {form.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign From Customers Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign Membership from Existing Customers</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Search name, phone, email…" value={allCustQ} onChange={(e) => setAllCustQ(e.target.value)} />
            <div className="border rounded-md max-h-[50vh] overflow-y-auto">
              {allCustLoading ? (
                <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /> Loading customers…</div>
              ) : filteredAllCust.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No matching customers.</div>
              ) : (
                <Table>
                  <TableBody>
                    {filteredAllCust.map((c) => (
                      <TableRow key={c.phone} data-state={picked.has(c.phone) ? "selected" : undefined}>
                        <TableCell className="w-10">
                          <Checkbox checked={picked.has(c.phone)} onCheckedChange={() => {
                            setPicked((prev) => {
                              const n = new Set(prev);
                              if (n.has(c.phone)) n.delete(c.phone); else n.add(c.phone);
                              return n;
                            });
                          }} />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{c.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{c.phone} · {c.total_orders} orders</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{picked.size} selected</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={submitAssign} disabled={assigning || picked.size === 0}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign as Members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk SMS */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>SMS to {selected.size} member(s)</DialogTitle></DialogHeader>
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

      {/* Bulk WhatsApp */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>WhatsApp to {selected.size} member(s)</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>Create follow-up task for {selected.size} member(s)</DialogTitle></DialogHeader>
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
              প্রতিটি সিলেক্টেড মেম্বারের জন্য আলাদা task তৈরি হবে।
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
    </>
  );
}
