import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Eye } from "lucide-react";
import { listFacebookWebhookLogs } from "@/lib/facebook-orders.functions";

export const Route = createFileRoute("/_app/facebook-orders/logs")({
  component: FacebookLogsTab,
});

function statusVariant(status: string) {
  if (status === "success") return "default" as const;
  if (status === "error") return "destructive" as const;
  return "secondary" as const;
}

function FacebookLogsTab() {
  const fetchLogs = useServerFn(listFacebookWebhookLogs);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null);

  const logs = useQuery({
    queryKey: ["fb-logs", q, status],
    queryFn: () => fetchLogs({ data: { q: q || undefined, status: status === "all" ? undefined : status } }),
    refetchInterval: 15000,
  });

  const rows = logs.data?.logs ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search event / page…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => logs.refetch()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Page</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>HTTP</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No webhook events yet.</TableCell></TableRow>
            ) : rows.map((l) => (
              <TableRow key={l.id} className={l.status === "error" ? "bg-destructive/5" : undefined}>
                <TableCell className="text-sm">{l.event_type}</TableCell>
                <TableCell className="text-sm">{l.page_name ?? l.page_id ?? "—"}</TableCell>
                <TableCell><Badge variant={statusVariant(l.status)}>{l.status}</Badge></TableCell>
                <TableCell className="text-xs">{l.http_status ?? "—"}</TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate">{l.error ?? ""}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(l as unknown as Record<string, unknown>)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Webhook payload</DialogTitle></DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded max-h-[70vh] overflow-auto">
            {viewing ? JSON.stringify(viewing, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
