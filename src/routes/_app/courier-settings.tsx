import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Truck, Save, Loader2, ShieldCheck, Plus, Trash2, Star, Clock, Copy } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/courier-settings")({
  head: () => ({ meta: [{ title: "Courier API Keys — OMS" }] }),
  component: CourierSettingsPage,
});

type ProviderId = "steadfast" | "pathao" | "redx";

const PROVIDERS: { id: ProviderId; label: string; defaultUrl: string; multi: boolean }[] = [
  { id: "steadfast", label: "Steadfast", defaultUrl: "https://portal.packzy.com/api/v1", multi: true },
  { id: "pathao", label: "Pathao", defaultUrl: "https://api-hermes.pathao.com", multi: true },
  { id: "redx", label: "RedX", defaultUrl: "https://openapi.redx.com.bd/v1.0.0-beta", multi: true },
];

type Row = {
  id?: string;
  name: string;
  provider: ProviderId;
  api_key: string;
  secret_key: string;
  base_url: string;
  status: "active" | "inactive";
  is_default: boolean;
};

function emptyRow(p: { id: ProviderId; label: string; defaultUrl: string }, index: number): Row {
  return {
    name: index === 0 ? p.label : `${p.label} ${index + 1}`,
    provider: p.id,
    api_key: "",
    secret_key: "",
    base_url: p.defaultUrl,
    status: "active",
    is_default: index === 0,
  };
}

function CourierSettingsPage() {
  const { isAdmin } = useAuth();
  const [accountsByProvider, setAccountsByProvider] = useState<Record<ProviderId, Row[]>>({
    steadfast: [],
    pathao: [],
    redx: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = async () => {
    const { data, error } = await supabase.rpc("get_courier_credentials");
    if (error) toast.error(error.message);
    const map: Record<ProviderId, Row[]> = { steadfast: [], pathao: [], redx: [] };
    for (const c of (data ?? []) as any[]) {
      const provider = (c.provider ?? c.name ?? "").toLowerCase();
      const pid: ProviderId | null =
        provider.includes("steadfast") || provider.includes("packzy") ? "steadfast"
        : provider.includes("pathao") ? "pathao"
        : provider.includes("redx") ? "redx"
        : null;
      if (!pid) continue;
      map[pid].push({
        id: c.id,
        name: c.name ?? "",
        provider: pid,
        api_key: c.api_key ?? "",
        secret_key: c.secret_key ?? "",
        base_url: c.base_url ?? PROVIDERS.find((p) => p.id === pid)!.defaultUrl,
        status: (c.status as "active" | "inactive") ?? "active",
        is_default: !!c.is_default,
      });
    }
    // Ensure at least one editable row per provider
    for (const p of PROVIDERS) {
      if (map[p.id].length === 0) map[p.id].push(emptyRow(p, 0));
    }
    setAccountsByProvider(map);
  };

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, []);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader><CardTitle>Admins only</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You need admin access to configure courier credentials. <Link to="/settings" className="underline">Go to Settings</Link>
        </CardContent>
      </Card>
    );
  }

  const update = (pid: ProviderId, idx: number, patch: Partial<Row>) =>
    setAccountsByProvider((prev) => {
      const copy = [...prev[pid]];
      copy[idx] = { ...copy[idx], ...patch };
      return { ...prev, [pid]: copy };
    });

  const addAccount = (pid: ProviderId) => {
    setAccountsByProvider((prev) => {
      const meta = PROVIDERS.find((p) => p.id === pid)!;
      return { ...prev, [pid]: [...prev[pid], emptyRow(meta, prev[pid].length)] };
    });
  };

  const save = async (pid: ProviderId, idx: number) => {
    const r = accountsByProvider[pid][idx];
    const key = `${pid}:${idx}`;
    setSaving(key);
    const payload: any = {
      name: r.name.trim() || PROVIDERS.find((p) => p.id === pid)!.label,
      provider: pid,
      api_key: r.api_key.trim() || null,
      secret_key: r.secret_key.trim() || null,
      base_url: r.base_url.trim() || null,
      status: r.status,
      is_default: r.is_default,
    };
    // If marking as default, unset other defaults for the same provider.
    if (r.is_default) {
      await (supabase as any)
        .from("couriers")
        .update({ is_default: false })
        .eq("provider", pid)
        .neq("id", r.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data, error } = r.id
      ? await (supabase as any).from("couriers").update(payload).eq("id", r.id).select("id").maybeSingle()
      : await (supabase as any).from("couriers").insert(payload).select("id").maybeSingle();
    setSaving(null);
    if (error) return toast.error(error.message);
    if (data?.id) update(pid, idx, { id: data.id });
    toast.success(`${r.name} saved`);
    await reload();
  };

  const remove = async (pid: ProviderId, idx: number) => {
    const r = accountsByProvider[pid][idx];
    if (!r.id) {
      // Just drop locally
      setAccountsByProvider((prev) => {
        const arr = prev[pid].filter((_, i) => i !== idx);
        const meta = PROVIDERS.find((p) => p.id === pid)!;
        return { ...prev, [pid]: arr.length ? arr : [emptyRow(meta, 0)] };
      });
      return;
    }
    if (!confirm(`Delete ${r.name}? This cannot be undone.`)) return;
    setDeleting(r.id);
    const { error } = await supabase.from("couriers").delete().eq("id", r.id);
    setDeleting(null);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    await reload();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Courier API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Configure one or more accounts per courier. Mark one as default for bulk "Send to Courier".
        </p>
      </div>

      <BDCourierFraudCard />

      <AutoSyncSetupCard />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        PROVIDERS.map((p) => {
          const list = accountsByProvider[p.id];
          return (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />{p.label}
                  </CardTitle>
                  <CardDescription>
                    Provider ID: <code className="text-xs">{p.id}</code> · {list.length} account{list.length === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => addAccount(p.id)}>
                  <Plus className="h-4 w-4" /> Add account
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {list.map((r, idx) => {
                  const key = `${p.id}:${idx}`;
                  return (
                    <div key={r.id ?? `new-${idx}`} className="rounded-md border p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={r.name}
                            onChange={(e) => update(p.id, idx, { name: e.target.value })}
                            placeholder="Account label"
                            className="h-8 w-56"
                          />
                          {r.is_default && (
                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                              <Star className="h-3 w-3 fill-primary" /> default
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(p.id, idx)}
                          disabled={deleting === r.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deleting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>API Key</Label>
                          <Input
                            type="password"
                            value={r.api_key}
                            onChange={(e) => update(p.id, idx, { api_key: e.target.value })}
                            placeholder="Enter API key"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Secret Key</Label>
                          <Input
                            type="password"
                            value={r.secret_key}
                            onChange={(e) => update(p.id, idx, { secret_key: e.target.value })}
                            placeholder="Enter secret key"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Base URL</Label>
                        <Input
                          value={r.base_url}
                          onChange={(e) => update(p.id, idx, { base_url: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={r.status === "active"}
                              onCheckedChange={(v) => update(p.id, idx, { status: v ? "active" : "inactive" })}
                            />
                            <Label>Active</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={r.is_default}
                              onCheckedChange={(v) => update(p.id, idx, { is_default: v })}
                            />
                            <Label>Default for {p.label}</Label>
                          </div>
                        </div>
                        <Button onClick={() => save(p.id, idx)} disabled={saving === key}>
                          {saving === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function BDCourierFraudCard() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.rpc("get_bdcourier_api_key").then(({ data }) => {
      setApiKey((data as string) ?? "");
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ bdcourier_api_key: apiKey.trim() || null })
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("BDCourier fraud checker key saved");
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Fraud Checker (BDCourier)
        </CardTitle>
        <CardDescription>
          Used by the order panel fraud check. Get your API key from{" "}
          <a href="https://app.bdcourier.com/api" target="_blank" rel="noreferrer" className="underline text-primary">
            app.bdcourier.com/api
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>BDCourier API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={loading}
            placeholder="Paste your BDCourier API key"
          />
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function AutoSyncSetupCard() {
  const defaultOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const [appUrl, setAppUrl] = useState(defaultOrigin);
  const [intervalMin, setIntervalMin] = useState(15);

  const cleanUrl = appUrl.trim().replace(/\/+$/, "");
  const schedule = intervalMin <= 1 ? "* * * * *" : `*/${intervalMin} * * * *`;

  const sql = useMemo(() => {
    return `-- Run this ONCE in your Supabase SQL editor
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('courier-status-sync-every-${intervalMin}min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'courier-status-sync-every-${intervalMin}min',
  '${schedule}',
  $cron$
  SELECT net.http_post(
    url := '${cleanUrl}/api/public/hooks/courier-status-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);`;
  }, [cleanUrl, intervalMin, schedule]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      toast.success("SQL copied — paste it in your Supabase SQL editor");
    } catch {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Auto-sync Courier Status (Returned / Delivered)
        </CardTitle>
        <CardDescription>
          Schedules a job in your own database that pings this app every few minutes to pull courier
          delivery status. URL is auto-filled from this browser — change it if your published app lives
          on a different domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,160px] gap-3">
          <div className="space-y-2">
            <Label>App URL</Label>
            <Input
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://your-app.lovable.app"
            />
          </div>
          <div className="space-y-2">
            <Label>Interval (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Math.max(1, Math.min(60, Number(e.target.value) || 15)))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Generated SQL</Label>
          <Textarea value={sql} readOnly rows={12} className="font-mono text-xs" />
        </div>
        <div className="flex justify-end">
          <Button onClick={copy} variant="default">
            <Copy className="h-4 w-4" /> Copy SQL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
