import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listExpenses, syncAllMetaAccounts } from "@/lib/meta-ads.functions";

export const Route = createFileRoute("/_app/expenses/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listExpenses);
  const syncAll = useServerFn(syncAllMetaAccounts);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["expenses", from, to, search],
    queryFn: () => listFn({ data: { from: from || undefined, to: to || undefined, search: search || undefined, limit: 200 } }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncAll(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.accounts} account(s), ${r.inserted} rows`);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    if (!rows?.length) return;
    const headers = ["Date", "Account", "Campaign", "Spend USD", "USD Rate", "Spend BDT", "Synced At"];
    const csv = [headers.join(","), ...rows.map((r) => [
      r.expense_date, JSON.stringify(r.account_name), JSON.stringify(r.campaign_name ?? ""),
      r.spend_usd, r.usd_rate, r.spend_bdt, r.synced_at,
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meta-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground block">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground block">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <div className="flex-1 min-w-48"><label className="text-xs text-muted-foreground block">Search campaign</label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Campaign name…" /></div>
          <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}><RefreshCw className="h-4 w-4" /> Refresh Sync</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}><Download className="h-4 w-4" /> Export CSV</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">USD</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">BDT</TableHead>
              <TableHead>Synced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && (rows?.length ?? 0) === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No expenses yet.</TableCell></TableRow>}
            {rows?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.expense_date}</TableCell>
                <TableCell>{r.account_name}</TableCell>
                <TableCell className="text-xs">{r.campaign_name ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">${r.spend_usd.toFixed(2)}</TableCell>
                <TableCell className="text-right">{r.usd_rate}</TableCell>
                <TableCell className="text-right font-mono">৳ {r.spend_bdt.toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.synced_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
