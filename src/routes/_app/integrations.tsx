import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plug, Save, Copy, Check, Loader2, ShieldCheck, RefreshCw, CheckCircle2, XCircle, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listWooIntegrations, saveWooIntegration, testWooIntegration, deleteWooIntegration,
  getWooLastSync, getWooWebhookLogs, type IntegrationRow,
} from "@/lib/integrations.functions";
import { runWpIncompleteSync } from "@/lib/wp-incomplete-sync.functions";
import { syncWooOrders } from "@/lib/woo-sync.functions";
import { Download, RefreshCcw } from "lucide-react";

type WebhookLog = {
  id: string; status: string; http_status: number;
  action: string | null; external_id: string | null; error: string | null; created_at: string;
};

export const Route = createFileRoute("/_app/integrations")({
  head: () => ({ meta: [{ title: "Integrations — OMS" }] }),
  component: IntegrationsPage,
});

// Unlimited WooCommerce sites can be connected.

function IntegrationsPage() {
  const fetchList = useServerFn(listWooIntegrations);
  const fetchLastSync = useServerFn(getWooLastSync);
  const fetchLogs = useServerFn(getWooWebhookLogs);

  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<IntegrationRow[]>([]);
  const [drafts, setDrafts] = useState<IntegrationRow[]>([]); // unsaved new rows
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [rows, sync, logsRes] = await Promise.all([
        fetchList(), fetchLastSync().catch(() => ({ last_sync: null })),
        fetchLogs().catch(() => ({ logs: [] })),
      ]);
      setSites(rows);
      setLastSync(sync.last_sync);
      setLogs((logsRes.logs ?? []) as WebhookLog[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const loadLogs = async () => {
    setLogsLoading(true);
    try { const r = await fetchLogs(); setLogs(r.logs as WebhookLog[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load logs"); }
    finally { setLogsLoading(false); }
  };

  const totalSites = sites.length + drafts.length;
  const addDraft = () => {
    setDrafts((d) => [...d, {
      id: `draft-${Date.now()}`,
      provider: "woocommerce",
      name: `Site ${totalSites + 1}`,
      site_url: "",
      consumer_key: "",
      consumer_secret: "",
      webhook_secret: "",
      plugin_signature: null,
      enabled: true,
      updated_at: "",
    }]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">Connect unlimited WooCommerce stores. Each site has its own webhook URL.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && <Badge variant="secondary">Last sync: {new Date(lastSync).toLocaleString()}</Badge>}
          <Button onClick={addDraft}>
            <Plus className="h-4 w-4" /> Add Site
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : (
        <div className="space-y-4">
          {sites.map((s) => (
            <SiteCard
              key={s.id} initial={s} isDraft={false}
              onSaved={(row) => setSites((arr) => arr.map((x) => x.id === row.id ? row : x))}
              onDeleted={(id) => setSites((arr) => arr.filter((x) => x.id !== id))}
            />
          ))}
          {drafts.map((d) => (
            <SiteCard
              key={d.id} initial={d} isDraft
              onSaved={(row) => {
                setDrafts((arr) => arr.filter((x) => x.id !== d.id));
                setSites((arr) => [...arr, row]);
              }}
              onDeleted={() => setDrafts((arr) => arr.filter((x) => x.id !== d.id))}
            />
          ))}
          {totalSites === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No sites connected yet. Click <strong>Add Site</strong> to connect your first WooCommerce store.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Event Log</CardTitle>
              <CardDescription>Recent WooCommerce webhook deliveries received by this app.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No webhook events yet.</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {log.status === "success"
                          ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-primary" />Success</Badge>
                          : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Error</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.http_status}</TableCell>
                      <TableCell className="text-xs capitalize">{log.action ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.external_id ?? "—"}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[280px] truncate" title={log.error ?? ""}>{log.error ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SiteCard({ initial, isDraft, onSaved, onDeleted }: {
  initial: IntegrationRow;
  isDraft: boolean;
  onSaved: (r: IntegrationRow) => void;
  onDeleted: (id: string) => void;
}) {
  const save = useServerFn(saveWooIntegration);
  const test = useServerFn(testWooIntegration);
  const del = useServerFn(deleteWooIntegration);
  const syncIncomplete = useServerFn(runWpIncompleteSync);
  const syncOrders = useServerFn(syncWooOrders);

  const [name, setName] = useState(initial.name ?? "");
  const [siteUrl, setSiteUrl] = useState(initial.site_url ?? "");
  const [ck, setCk] = useState(initial.consumer_key ?? "");
  const [cs, setCs] = useState(initial.consumer_secret ?? "");
  const [webhookSecret, setWebhookSecret] = useState<string>(initial.webhook_secret ?? "");
  const [pluginSig, setPluginSig] = useState<string>(initial.plugin_signature ?? "");
  const [savedId, setSavedId] = useState<string | null>(isDraft ? null : initial.id);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingIncomplete, setSyncingIncomplete] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedIncomplete, setCopiedIncomplete] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = webhookSecret ? `${origin}/api/public/webhooks/woocommerce?secret=${webhookSecret}` : "";
  const incompleteCallbackUrl = webhookSecret ? `${origin}/api/public/webhooks/wp-incomplete?secret=${webhookSecret}` : "";

  const onSaveSignature = async () => {
    if (!savedId) return toast.error("Save the site first.");
    await onSave();
  };

  const onSave = async () => {
    if (!name || !siteUrl || !ck || !cs) return toast.error("All fields are required.");
    setBusy(true);
    try {
      const row = await save({ data: {
        id: savedId, name, site_url: siteUrl, consumer_key: ck, consumer_secret: cs,
        plugin_signature: pluginSig.trim() || null,
        enabled: true,
      } });
      setSavedId(row.id);
      setWebhookSecret(row.webhook_secret);
      setPluginSig(row.plugin_signature ?? "");
      toast.success(isDraft && !savedId ? "Site added" : "Site updated");
      onSaved(row);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
    finally { setBusy(false); }
  };

  const onTest = async () => {
    if (!savedId) return toast.error("Save the site first.");
    setTesting(true);
    try {
      const r = await test({ data: { id: savedId } });
      toast.success(`Connected to WooCommerce ${r.version ?? ""}`.trim());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Connection failed"); }
    finally { setTesting(false); }
  };

  const onSyncIncomplete = async () => {
    if (!savedId) return toast.error("Save the site first.");
    setSyncingIncomplete(true);
    try {
      const r = await syncIncomplete({ data: { integration_id: savedId } });
      toast.success(`Incomplete sync: ${r.created ?? 0} created, ${r.skipped_dup ?? 0} dup, ${r.failed ?? 0} failed`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Incomplete sync failed"); }
    finally { setSyncingIncomplete(false); }
  };

  const onSyncOrders = async () => {
    if (!savedId) return toast.error("Save the site first.");
    setSyncingOrders(true);
    try {
      const r = await syncOrders({ data: { integration_id: savedId } });
      toast.success(`Woo orders synced: ${r.created ?? 0} created, ${r.skipped ?? 0} skipped, ${r.failed ?? 0} failed`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Woo sync failed"); }
    finally { setSyncingOrders(false); }
  };

  const onDelete = async () => {
    if (!confirm(`Remove "${name}"? Existing orders from this site will keep their data.`)) return;
    if (!savedId) return onDeleted(initial.id);
    try {
      await del({ data: { id: savedId } });
      toast.success("Site removed");
      onDeleted(savedId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to remove"); }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    toast.success("Webhook URL copied");
  };

  const copyIncompleteCallback = async () => {
    if (!incompleteCallbackUrl) return;
    await navigator.clipboard.writeText(incompleteCallbackUrl);
    setCopiedIncomplete(true); setTimeout(() => setCopiedIncomplete(false), 1500);
    toast.success("Incomplete callback URL copied");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" />{name || "New site"}</CardTitle>
            <CardDescription className="truncate">{siteUrl || "Enter your WooCommerce store URL below"}</CardDescription>
          </div>
          {savedId && webhookSecret && <Badge variant="outline" className="gap-1 shrink-0"><ShieldCheck className="h-3 w-3" />Configured</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Site Name</Label>
            <Input placeholder="Main Store" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website URL</Label>
            <Input placeholder="https://yourstore.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Consumer Key</Label>
            <Input placeholder="ck_..." value={ck} onChange={(e) => setCk(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Consumer Secret</Label>
            <Input type="password" placeholder="cs_..." value={cs} onChange={(e) => setCs(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          <Button variant="secondary" onClick={onTest} disabled={testing || !savedId}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Test Connection
          </Button>
          <Button variant="outline" onClick={onSyncIncomplete} disabled={syncingIncomplete || !savedId || !pluginSig.trim()} title="Sync incomplete orders from plugin">
            {syncingIncomplete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Sync Plugin
          </Button>
          <Button variant="outline" onClick={onSyncOrders} disabled={syncingOrders || !savedId} title="Sync WooCommerce orders">
            {syncingOrders ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Sync Woo Orders
          </Button>
          <Button variant="ghost" className="ml-auto text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>

        {savedId && webhookSecret && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Webhook URL <span className="text-xs text-muted-foreground">(unique to this site)</span></Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Setup in WooCommerce</p>
                <p>1. <span className="font-mono">WooCommerce → Settings → Advanced → Webhooks</span></p>
                <p>2. Add webhooks · Status: <strong>Active</strong> · Topics: <strong>Order created</strong> and <strong>Order updated</strong></p>
                <p>3. Delivery URL: paste the URL above · Secret: <span className="font-mono">{webhookSecret}</span></p>
              </div>
            </div>

            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-base">Incomplete Order Tracker Plugin (v2.1)</Label>
                <a href="/wp-oms-incomplete-order-v2.zip" download>
                  <Button type="button" variant="outline" size="sm">
                    <Download className="h-4 w-4" /> Download Plugin
                  </Button>
                </a>
              </div>
              <div className="space-y-2">
                <Label>Incomplete Callback URL <span className="text-xs text-muted-foreground">(paste into plugin settings)</span></Label>
                <div className="flex gap-2">
                  <Input readOnly value={incompleteCallbackUrl} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyIncompleteCallback}>
                    {copiedIncomplete ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Plugin Signature <span className="text-xs text-muted-foreground">(from WP plugin Settings)</span></Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Paste the signature shown in WP-Admin → OMS Incomplete v2"
                    value={pluginSig}
                    onChange={(e) => setPluginSig(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onSaveSignature}
                    disabled={busy || !savedId}
                    className="sm:w-auto"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Signature
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Install plugin → activate → paste the callback URL in plugin settings → copy the auto-generated signature from plugin settings → paste here → Save.
                </p>
                {!pluginSig.trim() && (
                  <p className="text-xs text-destructive">
                    Plugin signature missing থাকলে auto-sync ও Sync Plugin — দুটোই incomplete order আনতে পারবে না।
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
