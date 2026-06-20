import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Eye } from "lucide-react";
import { listFacebookOrders, listFacebookPages } from "@/lib/facebook-orders.functions";

export const Route = createFileRoute("/_app/facebook-orders/orders")({
  component: FacebookOrdersTab,
});

function FacebookOrdersTab() {
  const fetchOrders = useServerFn(listFacebookOrders);
  const fetchPages = useServerFn(listFacebookPages);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [pageId, setPageId] = useState<string>("all");
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null);

  const orders = useQuery({
    queryKey: ["fb-orders", q, status, pageId],
    queryFn: () => fetchOrders({
      data: {
        q: q || undefined,
        status: status === "all" ? undefined : status,
        page_id: pageId === "all" ? undefined : pageId,
      },
    }),
    refetchInterval: 15000,
  });

  const pages = useQuery({ queryKey: ["fb-pages"], queryFn: () => fetchPages() });

  const queryClient = useQueryClient();
  useEffect(() => {
    let scheduled = false;
    const invalidate = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        queryClient.invalidateQueries({ queryKey: ["fb-orders"] });
      }, 800);
    };
    const channel = supabase
      .channel("fb-orders-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: "source=eq.facebook" },
        (payload) => {
          invalidate();
          const row = payload.new as { order_number?: string; customer_name?: string };
          toast.success(`New Facebook order #${row.order_number ?? ""}`, {
            description: row.customer_name ?? undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: "source=eq.facebook" },
        (payload) => {
          invalidate();
          const oldRow = payload.old as { status?: string; order_number?: number };
          const newRow = payload.new as { status?: string; order_number?: number };
          if (oldRow?.status && newRow?.status && oldRow.status !== newRow.status) {
            toast.info(`Order #${newRow.order_number ?? ""} → ${newRow.status}`);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders", filter: "source=eq.facebook" },
        (payload) => {
          invalidate();
          const oldRow = payload.old as { order_number?: number };
          toast.warning(`Facebook order #${oldRow?.order_number ?? ""} deleted`);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  const rows = useMemo(() => orders.data?.orders ?? [], [orders.data]);

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending_web">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready_to_ship">Ready to ship</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pageId} onValueChange={setPageId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Facebook Page" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pages</SelectItem>
            {(pages.data?.pages ?? []).map((p) => (
              <SelectItem key={p.id} value={p.page_id}>{p.page_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => orders.refetch()} className="ml-auto">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No Facebook orders yet.</TableCell></TableRow>
            ) : rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">#{o.order_number}</TableCell>
                <TableCell>{o.customer_name}</TableCell>
                <TableCell className="font-mono text-xs">{o.customer_phone}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{o.invoice_note ?? "—"}</TableCell>
                <TableCell>{Number(o.total_amount).toFixed(2)}</TableCell>
                <TableCell><Badge variant="secondary">{o.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(o as unknown as Record<string, unknown>)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Order details</DialogTitle></DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto">
            {viewing ? JSON.stringify(viewing, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
