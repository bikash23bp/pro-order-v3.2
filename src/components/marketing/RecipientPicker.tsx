import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { listMarketingRecipients, getRecipientFacets, type Recipient, type RecipientFilters } from "@/lib/marketing.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberBadge } from "@/components/MemberBadge";

type Props = {
  selected: Map<string, Recipient>;
  onSelectedChange: (m: Map<string, Recipient>) => void;
};

const STATUSES = ["all", "processing", "shipped", "delivered", "cancelled", "returned"];

export function RecipientPicker({ selected, onSelectedChange }: Props) {
  const fetchList = useServerFn(listMarketingRecipients);
  const fetchFacets = useServerFn(getRecipientFacets);
  const [rows, setRows] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{ sources: string[]; products: string[] }>({ sources: [], products: [] });
  const [filters, setFilters] = useState<RecipientFilters>({
    q: "", source: "all", product: "all", status: "all", tag: "all", datePreset: "all",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const data = (await fetchList({ data: filters })) as Recipient[];
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load recipients");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchFacets().then((f) => setFacets(f as { sources: string[]; products: string[] })).catch(() => {});
  }, []);
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const allSelectedOnPage = rows.length > 0 && rows.every((r) => selected.has(r.phone));
  const toggleAll = () => {
    const next = new Map(selected);
    if (allSelectedOnPage) rows.forEach((r) => next.delete(r.phone));
    else rows.forEach((r) => next.set(r.phone, r));
    onSelectedChange(next);
  };
  const toggleOne = (r: Recipient) => {
    const next = new Map(selected);
    if (next.has(r.phone)) next.delete(r.phone);
    else next.set(r.phone, r);
    onSelectedChange(next);
  };

  const clearSelection = () => onSelectedChange(new Map());

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={filters.q ?? ""} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Name or phone" className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select value={filters.source ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {facets.sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Product</Label>
            <Select value={filters.product ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, product: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {facets.products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Order Status</Label>
            <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tag</Label>
            <Select value={filters.tag ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, tag: v as RecipientFilters["tag"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="discount">Discount</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="fraud">Fraud (2+ cancels)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Select value={filters.datePreset ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, datePreset: v as RecipientFilters["datePreset"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filters.datePreset === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.customFrom ?? ""} onChange={(e) => setFilters((f) => ({ ...f, customFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.customTo ?? ""} onChange={(e) => setFilters((f) => ({ ...f, customTo: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} matched · ${selected.size} selected`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selected.size === 0}>Clear selection</Button>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="border rounded-md max-h-[420px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelectedOnPage} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead>Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No customers match these filters.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.phone}>
                  <TableCell>
                    <Checkbox checked={selected.has(r.phone)} onCheckedChange={() => toggleOne(r)} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {r.name ?? "—"}
                      <MemberBadge phone={r.phone} />
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{r.total_orders}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
