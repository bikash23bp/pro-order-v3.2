import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldAlert, ShieldOff, Search, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBlockedCustomers, unblockCustomer, bulkUnblockCustomers } from "@/lib/blocked-customers.functions";
import { BlockCustomerDialog } from "@/components/customers/BlockCustomerDialog";
import { CustomerProfileDialog } from "@/components/customers/CustomerProfileDialog";
import { ExportMenu } from "@/components/ExportMenu";

export const Route = createFileRoute("/_app/customers/blocked")({
  component: BlockedCustomersPage,
});

type Row = Awaited<ReturnType<typeof listBlockedCustomers>>[number];

function BlockedCustomersPage() {
  const list = useServerFn(listBlockedCustomers);
  const unblock = useServerFn(unblockCustomer);
  const bulkUnblock = useServerFn(bulkUnblockCustomers);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [profileRow, setProfileRow] = useState<Row | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    try {
      const data = await list({ data: { search: q || undefined } });
      setRows(data);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const onUnblock = async (id: string) => {
    if (!confirm("Unblock this customer? They will be able to place orders again.")) return;
    try {
      await unblock({ data: { id } });
      toast.success("Customer unblocked");
      void load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock");
    }
  };

  const onBulkUnblock = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Unblock ${ids.length} customer(s)?`)) return;
    setBulkBusy(true);
    try {
      const r = await bulkUnblock({ data: { ids } });
      toast.success(`Unblocked ${r.removed} customer(s)`);
      void load(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="h-5 w-5" /> Blocked Customers
          </CardTitle>
          <div className="flex items-center gap-2">
            <ExportMenu
              filenameBase="blocked-customers"
              count={rows.length}
              getRows={() => rows.map((r: any) => ({
                Name: r.name ?? "",
                Phone: r.phone ?? "",
                Reason: r.reason ?? "",
                "Blocked At": r.blocked_at ?? r.created_at ?? "",
              }))}
            />
            <Button onClick={() => setAddOpen(true)} variant="destructive" size="sm">
              <Plus className="h-4 w-4" /> Block customer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            onSubmit={(e) => { e.preventDefault(); void load(search); }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search phone or reason…"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-sm"><strong>{selected.size}</strong> selected</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="destructive" onClick={onBulkUnblock} disabled={bulkBusy}>
                  <ShieldOff className="h-4 w-4" /> {bulkBusy ? "Unblocking…" : `Unblock ${selected.size}`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No blocked customers</TableCell></TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                      </TableCell>
                      <TableCell className="font-mono">
                        {r.phone_normalized ? (
                          <button
                            type="button"
                            onClick={() => setProfileRow(r)}
                            className="text-primary hover:underline"
                          >
                            {r.phone_normalized}
                          </button>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.ip_address ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="whitespace-normal text-left">
                          {r.reason}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.blocked_by_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => onUnblock(r.id)}>
                          <ShieldOff className="h-4 w-4" /> Unblock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <BlockCustomerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onBlocked={() => void load(search)}
      />

      {profileRow?.phone_normalized && (
        <CustomerProfileDialog
          phone={profileRow.phone_normalized}
          open={!!profileRow}
          onClose={() => setProfileRow(null)}
          blockedInfo={{
            reason: profileRow.reason,
            blocked_by_name: profileRow.blocked_by_name,
            blocked_at: profileRow.created_at,
          }}
        />
      )}
    </div>
  );
}
