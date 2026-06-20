import { createFileRoute } from "@tanstack/react-router";
import { MemberBadge } from "@/components/MemberBadge";
import { CustomerTagPicker } from "@/components/customers/CustomerTagPicker";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, DownloadCloud, Pencil, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listIncompleteOrders, type IncompleteOrder } from "@/lib/incomplete-orders.functions";
import { runWpIncompleteSync } from "@/lib/wp-incomplete-sync.functions";
import { EditOrderDialog, type EditableOrder } from "@/components/orders/EditOrderDialog";
import { ExportMenu } from "@/components/ExportMenu";

export const Route = createFileRoute("/_app/incomplete-orders")({
  head: () => ({ meta: [{ title: "Incomplete Orders — OMS" }] }),
  component: IncompleteOrdersPage,
});

const REASON_LABEL: Record<string, string> = {
  address: "No address",
  phone: "Bad phone",
  items: "No items",
  total: "Zero total",
};

function IncompleteOrdersPage() {
  const fetchList = useServerFn(listIncompleteOrders);
  const runPluginSync = useServerFn(runWpIncompleteSync);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditableOrder | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handlePluginSync = async () => {
    setSyncing(true);
    try {
      const s = await runPluginSync({ data: {} });
      toast.success(
        `Plugin sync: +${s.created} new, ${s.skipped_no_phone} no-phone, ${s.skipped_dup} duplicate (${s.fetched} fetched)`,
      );
      qc.invalidateQueries({ queryKey: ["incomplete-orders"] });
      qc.invalidateQueries({ queryKey: ["incomplete-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plugin sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["incomplete-orders"],
    queryFn: () => fetchList(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  useEffect(() => {
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["incomplete-orders"] });
        qc.invalidateQueries({ queryKey: ["incomplete-stats"] });
      }, 800);
    };
    const ch = supabase
      .channel("incomplete-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (o: IncompleteOrder) =>
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.includes(q) ||
        String(o.order_number).includes(q),
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-amber-500" /> Incomplete Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Orders missing essential information — fix to move them into the main pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            filenameBase="incomplete-orders"
            getRows={() => filtered.map((o: IncompleteOrder) => ({
              "Order #": o.order_number,
              Customer: o.customer_name,
              Phone: o.customer_phone,
              Address: o.customer_address,
              Missing: (o.missing_fields ?? []).map((r: string) => REASON_LABEL[r] ?? r).join("; "),
              Total: Number(o.total_amount ?? 0).toFixed(2),
              Created: o.created_at,
            }))}
            count={filtered.length}
          />
          <Button variant="outline" size="sm" onClick={handlePluginSync} disabled={syncing}>
            <DownloadCloud className={`h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Plugin"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>
            Auto-detected when an order is missing an address, phone, items, or has a zero total.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, phone, order #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Missing</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">All clear — no incomplete orders.</TableCell></TableRow>
                ) : filtered.map((o: IncompleteOrder) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">#{o.order_number}</TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center gap-1.5">
                        {o.customer_name || <span className="text-muted-foreground italic">No name</span>}
                        <MemberBadge phone={o.customer_phone} />
                      </div>
                      <div className="text-xs text-muted-foreground">{o.customer_phone || "—"}</div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {(o.items?.length ?? 0) === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No items</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {o.items.slice(0, 3).map((it, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              {it.image_url ? (
                                <img src={it.image_url} alt="" className="h-7 w-7 rounded object-cover border" />
                              ) : (
                                <div className="h-7 w-7 rounded bg-muted border" />
                              )}
                              <span className="truncate">
                                {it.product_name ?? "—"}{it.variant_name ? ` (${it.variant_name})` : ""} ×{it.quantity}
                              </span>
                            </div>
                          ))}
                          {o.items.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{o.items.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {o.missing_fields.map((f) => (
                          <Badge key={f} variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                            {REASON_LABEL[f] ?? f}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">৳ {Number(o.total_amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{o.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {o.customer_phone && (
                          <CustomerTagPicker phone={o.customer_phone} buttonSize="xs" buttonLabel="Tag" showBadgesInline={false} />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({
                            id: o.id,
                            order_number: o.order_number,
                            customer_name: o.customer_name,
                            customer_phone: o.customer_phone,
                            customer_address: o.customer_address,
                            delivery_charge: 0,
                            discount_amount: 0,
                            advance_amount: 0,
                            invoice_note: null,
                            internal_note: null,
                          })}
                        >
                          <Pencil className="h-4 w-4" /> Fix
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditOrderDialog
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["incomplete-orders"] });
            qc.invalidateQueries({ queryKey: ["incomplete-stats"] });
          }}
        />
      )}
    </div>
  );
}
