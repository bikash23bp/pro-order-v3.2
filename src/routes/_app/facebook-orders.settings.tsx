import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Copy, Save, Sparkles, Wifi } from "lucide-react";
import { getFacebookSettings, saveFacebookSettings } from "@/lib/facebook-orders.functions";

export const Route = createFileRoute("/_app/facebook-orders/settings")({
  component: FacebookSettingsTab,
});

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function FacebookSettingsTab() {
  const fetchSettings = useServerFn(getFacebookSettings);
  const saveSettings = useServerFn(saveFacebookSettings);
  const q = useQuery({ queryKey: ["fb-settings"], queryFn: () => fetchSettings() });

  const [form, setForm] = useState({
    access_token: "",
    verify_token: "",
    webhook_secret: "",
    app_id: "",
    app_secret: "",
    enabled: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data?.settings) {
      const s = q.data.settings;
      setForm({
        access_token: s.access_token ?? "",
        verify_token: s.verify_token ?? "",
        webhook_secret: s.webhook_secret ?? "",
        app_id: s.app_id ?? "",
        app_secret: s.app_secret ?? "",
        enabled: !!s.enabled,
      });
    }
  }, [q.data]);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/facebook-page-orders/webhook`
    : "/api/public/facebook-page-orders/webhook";

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({ data: form });
      toast.success("Settings saved");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function generate(field: "verify_token" | "webhook_secret") {
    setForm((f) => ({ ...f, [field]: randomToken() }));
  }

  async function testConnection() {
    try {
      const res = await fetch(`${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(form.verify_token)}&hub.challenge=ping`);
      if (res.ok) toast.success("Webhook reachable & verify token matches");
      else toast.error(`Webhook responded ${res.status}`);
    } catch {
      toast.error("Failed to reach webhook");
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-4 space-y-1">
        <Label className="text-xs uppercase text-muted-foreground">Webhook URL</Label>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => copy(webhookUrl, "Webhook URL")}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Paste this into the Facebook App → Messenger → Webhooks setup. Use the Verify Token below.
        </p>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Integration enabled</h3>
            <p className="text-xs text-muted-foreground">When off, incoming webhooks are logged but no orders are created.</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>App ID</Label>
            <Input value={form.app_id} onChange={(e) => setForm((f) => ({ ...f, app_id: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>App Secret</Label>
            <Input type="password" value={form.app_secret} onChange={(e) => setForm((f) => ({ ...f, app_secret: e.target.value }))} />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Page Access Token</Label>
          <Input value={form.access_token} onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))} className="font-mono text-xs" />
        </div>

        <div className="space-y-1">
          <Label>Verify Token</Label>
          <div className="flex gap-2">
            <Input value={form.verify_token} onChange={(e) => setForm((f) => ({ ...f, verify_token: e.target.value }))} className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => generate("verify_token")}>
              <Sparkles className="h-4 w-4" /> Generate
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Webhook Secret</Label>
          <div className="flex gap-2">
            <Input value={form.webhook_secret} onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))} className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => generate("webhook_secret")}>
              <Sparkles className="h-4 w-4" /> Generate
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> Save Settings
          </Button>
          <Button variant="outline" onClick={testConnection}>
            <Wifi className="h-4 w-4" /> Test Connection
          </Button>
        </div>
      </Card>
    </div>
  );
}
