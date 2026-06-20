import { createFileRoute } from "@tanstack/react-router";
import { MemberBadge } from "@/components/MemberBadge";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, Search, Globe, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listWebOrders, confirmWebOrders, type WebOrder } from "@/lib/web-orders.functions";
import { syncWooOrders } from "@/lib/woo-sync.functions";
import { getDuplicatePhones } from "@/lib/duplicates.functions";
import { normalizePhoneClient } from "@/lib/duplicates.shared";
import { DuplicateBadge } from "@/components/orders/DuplicateBadge";
import { OrderDetailDialog, type DetailOrder } from "@/components/orders/OrderDetailDialog";
import { EditOrderDialog, type EditableOrder } from "@/components/orders/EditOrderDialog";
import { ExportMenu } from "@/components/ExportMenu";

export const Route = createFileRoute("/_app/web-orders")({
  head: () => ({ meta: [{ title: "Web Orders — OMS" }] }),
  component: WebOrdersPage,
});

function WebOrdersPage() {
  const fetchList = useServerFn(listWebOrders);
  const confirmFn = useServerFn(confirmWebOrders);
  const fetchDupes = useServerFn(getDuplicatePhones);
  const syncFn = useServerFn(syncWooOrders);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<DetailOrder | null>(null);
  const [editing, setEditing] = useState<EditableOrder | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await syncFn({ data: {} });
      toast.success(
        `Synced ${r.created} new order${r.created === 1 ? "" : "s"}` +
        (r.skipped ? ` · ${r.skipped} already imported` : "") +
        (r.failed ? ` · ${r.failed} failed` : ""),
      );
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["web-orders"],
    queryFn: () => fetchList(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const { data: dupes } = useQuery({
    queryKey: ["duplicate-phones"],
    queryFn: () => fetchDupes(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const dupeSet = useMemo(() => new Set(dupes?.phones ?? []), [dupes]);

  // Realtime: refresh when WooCommerce orders arrive and when their line items finish syncing.
  useEffect(() => {
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["web-orders"] });
        qc.invalidateQueries({ queryKey: ["web-orders-stats"] });
      }, 800);
    };
    const ch = supabase
      .channel("web-orders-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: "source=eq.woocommerce" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const order = payload.new as { order_number?: number; status?: string };
            if (order.status === "pending_web") {
              toast.success(`New web order #${order.order_number ?? ""} synced`);
            }
          }
          ping();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        ping,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((o) =>
      o.customer_name.toLowerCase().includes(q) ||
      (o.external_order_id ?? "").toLowerCase().includes(q) ||
      String(o.order_number).includes(q),
    );
  }, [data, search]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allChecked = filtered.length > 0 && filtered.every((o) => selected[o.id]);

  const toggleAll = () => {
    if (allChecked) setSelected({});
    else setSelected(Object.fromEntries(filtered.map((o) => [o.id, true])));
  };

  const handleConfirm = async (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirming(true);
    try {
      const r = await confirmFn({ data: { ids } });
      toast.success(`Confirmed ${r.count} order${r.count === 1 ? "" : "s"}`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  };

  const openDetails = (o: WebOrder) => {
    setOpen({
      id: o.id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      customer_email: null,
      customer_address: o.customer_address,
      status: "pending_web",
      total_amount: o.total_amount,
      delivery_charge: o.delivery_charge,
      discount_amount: o.discount_amount,
      advance_amount: o.advance_amount,
      advance_source_id: o.advance_source_id,
      advance_txn_id: o.advance_txn_id,
      subtotal: o.subtotal,
      consignment_id: o.consignment_id,
      invoice_note: o.invoice_note,
      internal_note: o.internal_note,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6" /> Web Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            WooCommerce orders awaiting confirmation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filenameBase="web-orders"
            getRows={() => filtered.map((o: WebOrder) => ({
              "Order #": o.order_number,
              External: o.external_order_id ?? "",
              Customer: o.customer_name,
              Phone: o.customer_phone,
              Address: o.customer_address,
              Subtotal: Number(o.subtotal).toFixed(2),
              Delivery: Number(o.delivery_charge).toFixed(2),
              Discount: Number(o.discount_amount).toFixed(2),
              Total: Number(o.total_amount).toFixed(2),
              Status: o.status,
              Created: o.created_at,
            }))}
            count={filtered.length}
          />
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync from Web"}
          </Button>
          <Button
            size="sm"
            onClick={() => handleConfirm(selectedIds)}
            disabled={selectedIds.length === 0 || confirming}
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm {selectedIds.length > 0 && `(${selectedIds.length})`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Web Orders</CardTitle>
          <CardDescription>Updates in real time as new WooCommerce webhooks arrive.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, web order ID…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Web ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Sync Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No pending web orders.</TableCell></TableRow>
                ) : filtered.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => openDetails(o)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!selected[o.id]}
                        onCheckedChange={(v) => setSelected((p) => ({ ...p, [o.id]: !!v }))}
                        aria-label="Select row"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      #{o.external_order_id ?? o.order_number}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {o.customer_name}
                        <MemberBadge phone={o.customer_phone} />
                        {(() => {
                          const n = normalizePhoneClient(o.customer_phone || "");
                          return n && dupeSet.has(n) ? <DuplicateBadge /> : null;
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="text-sm truncate">
                        {o.items.length === 0
                          ? <span className="text-muted-foreground">—</span>
                          : o.items.map((it) => `${it.product_name ?? "Item"} ×${it.quantity}`).join(", ")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">৳ {o.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-sky-500/15 text-sky-400 border-sky-500/30">
                        Pending / Web
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({
                            id: o.id,
                            order_number: o.order_number,
                            customer_name: o.customer_name,
                            customer_phone: o.customer_phone,
                            customer_address: o.customer_address,
                            delivery_charge: o.delivery_charge,
                            discount_amount: o.discount_amount,
                            advance_amount: o.advance_amount,
                            advance_source_id: o.advance_source_id,
                            advance_txn_id: o.advance_txn_id,
                            invoice_note: o.invoice_note,
                            internal_note: o.internal_note,
                          })}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirm([o.id])}
                          disabled={confirming}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm
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

      {open && <OrderDetailDialog order={open} onClose={() => setOpen(null)} onEdit={() => setEditing({
        id: open.id,
        order_number: open.order_number,
        customer_name: open.customer_name,
        customer_phone: open.customer_phone,
        customer_address: open.customer_address,
        delivery_charge: open.delivery_charge,
        discount_amount: open.discount_amount,
        advance_amount: open.advance_amount,
        advance_source_id: open.advance_source_id,
        advance_txn_id: open.advance_txn_id,
        invoice_note: open.invoice_note,
        internal_note: open.internal_note,
      })} />}
      {editing && (
        <EditOrderDialog
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["web-orders"] });
            qc.invalidateQueries({ queryKey: ["web-orders-stats"] });
          }}
        />
      )}
    </div>
  );
}
