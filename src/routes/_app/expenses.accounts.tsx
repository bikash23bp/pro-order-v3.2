import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listMetaAccounts, saveMetaAccount, testMetaConnection, deleteMetaAccount, toggleMetaAccount, syncMetaAccount, syncAllMetaAccounts,
} from "@/lib/meta-ads.functions";

export const Route = createFileRoute("/_app/expenses/accounts")({
  component: AccountsPage,
});

const statusVariant = (s: string): { label: string; cls: string } => {
  switch (s) {
    case "connected": return { label: "Connected", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
    case "invalid_token": return { label: "Invalid Token", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
    case "expired": return { label: "Expired Token", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    case "permission_error": return { label: "Permission Error", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
    case "error": return { label: "Error", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
    default: return { label: "Untested", cls: "bg-muted text-muted-foreground" };
  }
};

function AccountsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMetaAccounts);
  const toggleFn = useServerFn(toggleMetaAccount);
  const deleteFn = useServerFn(deleteMetaAccount);
  const syncFn = useServerFn(syncMetaAccount);
  const syncAllFn = useServerFn(syncAllMetaAccounts);

  const { data: accounts, isLoading } = useQuery({ queryKey: ["meta-accounts"], queryFn: () => fetchList() });

  const onToggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-accounts"] }),
  });
  const onDelete = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Account deleted"); qc.invalidateQueries({ queryKey: ["meta-accounts"] }); },
  });
  const onSync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Synced ${res.inserted} rows (${res.status})`);
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      qc.invalidateQueries({ queryKey: ["expense-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const onSyncAll = useMutation({
    mutationFn: () => syncAllFn(),
    onSuccess: (res) => {
      toast.success(`Synced ${res.accounts} account(s), ${res.inserted} rows`);
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      qc.invalidateQueries({ queryKey: ["expense-overview"] });
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{accounts?.length ?? 0} connected account(s)</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onSyncAll.mutate()} disabled={onSyncAll.isPending}>
              <RefreshCw className={`h-4 w-4 ${onSyncAll.isPending ? "animate-spin" : ""}`} />
              {onSyncAll.isPending ? "Syncing…" : "Sync Now"}
            </Button>
            <AddAccountDialog onSaved={() => qc.invalidateQueries({ queryKey: ["meta-accounts"] })} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ad Account</TableHead>
              <TableHead>USD Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && (accounts?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No accounts yet. Click "Add Meta Ads Account" to connect.</TableCell></TableRow>
            )}
            {accounts?.map((a) => {
              const sv = statusVariant(a.status);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell className="font-mono text-xs">act_{a.ad_account_id}</TableCell>
                  <TableCell>{a.usd_rate}</TableCell>
                  <TableCell><Badge variant="outline" className={sv.cls}>{sv.label}</Badge></TableCell>
                  <TableCell><Switch checked={a.active} onCheckedChange={(v) => onToggle.mutate({ id: a.id, active: v })} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "Never"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => onSync.mutate(a.id)} disabled={onSync.isPending}>
                      <RefreshCw className="h-3 w-3" /> Sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this account?")) onDelete.mutate(a.id); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddAccountDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    account_name: "",
    app_id: "",
    app_secret: "",
    access_token: "",
    ad_account_id: "",
    usd_rate: 110,
    active: true,
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const testFn = useServerFn(testMetaConnection);
  const saveFn = useServerFn(saveMetaAccount);

  const testMut = useMutation({
    mutationFn: () => testFn({ data: { access_token: form.access_token, ad_account_id: form.ad_account_id } }),
    onSuccess: (r) => {
      if (r.ok) setTestResult({ ok: true, msg: `Connected${r.accountName ? ` — ${r.accountName}` : ""}${r.currency ? ` (${r.currency})` : ""}` });
      else setTestResult({ ok: false, msg: `${r.status}: ${r.message}` });
    },
    onError: (e: Error) => setTestResult({ ok: false, msg: e.message }),
  });

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: (r) => {
      toast.success(`Account saved (${r.status})`);
      setOpen(false);
      setForm({ account_name: "", app_id: "", app_secret: "", access_token: "", ad_account_id: "", usd_rate: 110, active: true });
      setTestResult(null);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Add Meta Ads Account</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Connect Meta Ads Account</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Account Name"><Input value={form.account_name} onChange={(e) => update("account_name", e.target.value)} placeholder="My Brand Ads" /></Field>
          <Field label="App ID"><Input value={form.app_id} onChange={(e) => update("app_id", e.target.value)} /></Field>
          <Field label="App Secret"><Input type="password" value={form.app_secret} onChange={(e) => update("app_secret", e.target.value)} /></Field>
          <Field label="Access Token"><Input type="password" value={form.access_token} onChange={(e) => update("access_token", e.target.value)} placeholder="Long-lived system user token" /></Field>
          <Field label='Ad Account ID (without "act_")'><Input value={form.ad_account_id} onChange={(e) => update("ad_account_id", e.target.value.replace(/^act_/i, ""))} placeholder="1234567890" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="USD → BDT Rate"><Input type="number" value={form.usd_rate} onChange={(e) => update("usd_rate", Number(e.target.value))} /></Field>
            <Field label="Active"><div className="flex items-center h-9"><Switch checked={form.active} onCheckedChange={(v) => update("active", v)} /></div></Field>
          </div>
          {testResult && (
            <div className={`text-xs px-3 py-2 rounded-md border ${testResult.ok ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-rose-500/10 text-rose-600 border-rose-500/30"}`}>
              {testResult.msg}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !form.access_token || !form.ad_account_id}>
            <Wand2 className="h-4 w-4" /> Test Connection
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
