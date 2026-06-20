import { createFileRoute, Link } from "@tanstack/react-router";
import { MemberBadge } from "@/components/MemberBadge";
import { useEffect, useMemo, useState } from "react";
import { Phone, FileText, CalendarClock, CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExportMenu } from "@/components/ExportMenu";

type Row = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: string;
  total_amount: number;
  created_at: string;
  preorder_date: string | null;
  source: string | null;
  order_source_id: string | null;
  order_sources: { name: string } | null;
};

export const Route = createFileRoute("/_app/preorders")({
  head: () => ({ meta: [{ title: "Pre-Orders — OMS" }] }),
  component: PreOrdersPage,
});

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PreOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<"all" | "due" | "upcoming" | "unscheduled">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState<Date | undefined>(undefined);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, customer_phone, customer_address, status, total_amount, created_at, preorder_date, source, order_source_id, order_sources(name)")
      .eq("preorder", true)
      .order("preorder_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase.from("order_sources").select("id,name").eq("visible", true).order("name");
      setSources((data ?? []) as { id: string; name: string }[]);
    })();
  }, []);

  const today = todayISO();
  const dueCount = useMemo(
    () => rows.filter((r) => r.preorder_date && r.preorder_date <= today).length,
    [rows, today],
  );

  const filtered = useMemo(() => {
    let list = sourceFilter === "all" ? rows : rows.filter((r) => r.order_source_id === sourceFilter);
    if (dueFilter === "due") list = list.filter((r) => r.preorder_date && r.preorder_date <= today);
    else if (dueFilter === "upcoming") list = list.filter((r) => r.preorder_date && r.preorder_date > today);
    else if (dueFilter === "unscheduled") list = list.filter((r) => !r.preorder_date);
    return list;
  }, [rows, sourceFilter, dueFilter, today]);

  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const toggleAllVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach((id) => next.add(id));
      else visibleIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const bulkUpdate = async (date: string | null) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase.from("orders").update({ preorder_date: date }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(date ? `Set due date for ${ids.length} order(s)` : `Cleared due date for ${ids.length} order(s)`);
    setSelected(new Set());
    setBulkDate(undefined);
    setDatePopoverOpen(false);
    await load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-violet-500" /> Pre-Orders
          {dueCount > 0 && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/40 animate-pulse">
              {dueCount} due today
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">Advance orders waiting to be fulfilled. Orders highlighted in amber are due today or overdue.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">All pre-orders ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as typeof dueFilter)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Due filter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="due">Due / Overdue</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="unscheduled">No date set</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ExportMenu
              filenameBase="preorders"
              count={filtered.length}
              getRows={() => filtered.map((r: Row) => ({
                "Order #": r.order_number,
                Customer: r.customer_name,
                Phone: r.customer_phone,
                Address: r.customer_address,
                Status: r.status,
                Source: r.order_sources?.name ?? r.source ?? "",
                Total: Number(r.total_amount).toFixed(2),
                "Pre-order Date": r.preorder_date ?? "",
                Created: r.created_at,
              }))}
            />
          </div>
        </CardHeader>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-y bg-muted/40 px-4 py-2">
            <div className="text-sm font-medium">{selected.size} selected</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" disabled={bulkBusy}>
                    <CalendarIcon className="h-4 w-4" />
                    {bulkDate ? bulkDate.toLocaleDateString() : "Set due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={bulkDate}
                    onSelect={(d) => setBulkDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  <div className="flex justify-end gap-2 border-t p-2">
                    <Button size="sm" variant="ghost" onClick={() => { setBulkDate(undefined); setDatePopoverOpen(false); }}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!bulkDate || bulkBusy} onClick={() => bulkDate && bulkUpdate(toISODate(bulkDate))}>
                      Apply to {selected.size}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkUpdate(null)}>
                Clear dates
              </Button>
              <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4" /> Deselect
              </Button>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={(c) => toggleAllVisible(c === true)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No pre-orders yet.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const digits = (r.customer_phone || "").replace(/\D/g, "");
                const isDue = !!(r.preorder_date && r.preorder_date <= today);
                const isOverdue = !!(r.preorder_date && r.preorder_date < today);
                const isChecked = selected.has(r.id);
                return (
                  <TableRow key={r.id} className={isDue ? "bg-amber-500/10 hover:bg-amber-500/15" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(c) => toggleOne(r.id, c === true)}
                        aria-label={`Select order ${r.order_number}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono">#{r.order_number}</TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">{r.customer_name}<MemberBadge phone={r.customer_phone} /></span>
                      <div className="text-xs text-muted-foreground line-clamp-1">{r.customer_address}</div>
                    </TableCell>
                    <TableCell>
                      <a href={digits ? `tel:${digits}` : undefined} className="inline-flex items-center gap-1 text-sm hover:text-primary">
                        <Phone className="h-3 w-3" /> {r.customer_phone}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.order_sources?.name ?? r.source ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">৳ {Number(r.total_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      {r.preorder_date ? (
                        <Badge variant="outline" className={isOverdue
                          ? "bg-red-500/15 text-red-500 border-red-500/40"
                          : isDue
                            ? "bg-amber-500/15 text-amber-500 border-amber-500/40"
                            : "bg-violet-500/15 text-violet-500 border-violet-500/30"}>
                          {new Date(r.preorder_date).toLocaleDateString()}
                          {isOverdue ? " · overdue" : isDue ? " · today" : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" asChild>
                        <Link to="/orders/$orderId/invoice" params={{ orderId: r.id }}>
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
