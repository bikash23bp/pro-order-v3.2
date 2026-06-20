import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Loader2, MessageSquare } from "lucide-react";
import { getSmsSettings, saveSmsSettings } from "@/lib/sms.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/sms-settings")({
  head: () => ({ meta: [{ title: "SMS Settings — OMS" }] }),
  component: SmsSettingsPage,
});

type TplKey =
  | "template_confirmed"
  | "template_shipped"
  | "template_web_order"
  | "template_single_default"
  | "template_bulk_default";

type EnKey = "enabled_confirmed" | "enabled_shipped" | "enabled_web_order";

const AUTO_TEMPLATES: Array<{
  title: string;
  description: string;
  tplKey: TplKey;
  enKey: EnKey;
}> = [
  {
    title: "Web order received",
    description: "Sent automatically when a new order arrives from your website.",
    tplKey: "template_web_order",
    enKey: "enabled_web_order",
  },
  {
    title: "Order confirmed",
    description: "Sent when an order moves to Completed/Confirmed.",
    tplKey: "template_confirmed",
    enKey: "enabled_confirmed",
  },
  {
    title: "Order shipped (handed to courier)",
    description: "Sent when an order is handed over to courier.",
    tplKey: "template_shipped",
    enKey: "enabled_shipped",
  },
];

const MANUAL_TEMPLATES: Array<{ title: string; description: string; tplKey: TplKey }> = [
  {
    title: "Single message default",
    description: "Pre-filled when you send an SMS to one customer.",
    tplKey: "template_single_default",
  },
  {
    title: "Bulk message default",
    description: "Pre-filled when you send a bulk marketing SMS.",
    tplKey: "template_bulk_default",
  },
];

function SmsSettingsPage() {
  const fetchFn = useServerFn(getSmsSettings);
  const saveFn = useServerFn(saveSmsSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [senderId, setSenderId] = useState("");
  const [enabled, setEnabled] = useState(false);

  const [tpl, setTpl] = useState<Record<TplKey, string>>({
    template_confirmed: "",
    template_shipped: "",
    template_web_order: "",
    template_single_default: "",
    template_bulk_default: "",
  });
  const [en, setEn] = useState<Record<EnKey, boolean>>({
    enabled_confirmed: true,
    enabled_shipped: true,
    enabled_web_order: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const r = (await fetchFn()) as Record<string, unknown> | null;
        if (r) {
          setApiUrl((r.api_url as string) ?? "");
          setApiKey((r.api_key as string) ?? "");
          setSenderId((r.sender_id as string) ?? "");
          setEnabled(!!r.enabled);
          setTpl({
            template_confirmed: (r.template_confirmed as string) ?? "",
            template_shipped: (r.template_shipped as string) ?? "",
            template_web_order: (r.template_web_order as string) ?? "",
            template_single_default: (r.template_single_default as string) ?? "",
            template_bulk_default: (r.template_bulk_default as string) ?? "",
          });
          setEn({
            enabled_confirmed: r.enabled_confirmed !== false,
            enabled_shipped: r.enabled_shipped !== false,
            enabled_web_order: !!r.enabled_web_order,
          });
        }
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
      finally { setLoading(false); }
    })();
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveFn({ data: {
        api_url: apiUrl.trim(),
        api_key: apiKey.trim(),
        sender_id: senderId.trim(),
        enabled,
        ...tpl,
        ...en,
      } });
      toast.success("SMS settings saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SMS Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your SMS gateway and notification templates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Gateway</CardTitle>
          <CardDescription>HTTP gateway endpoint and credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Enable SMS</div>
              <div className="text-xs text-muted-foreground">Master switch. When off, no SMS (auto or manual) will be sent.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-2">
            <Label>API URL</Label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.example.com/sendsms" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="••••••" />
            </div>
            <div className="space-y-2">
              <Label>Sender ID</Label>
              <Input value={senderId} onChange={(e) => setSenderId(e.target.value)} placeholder="MyShop" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={!enabled ? "opacity-60" : ""}>
        <CardHeader>
          <CardTitle>Auto-notification templates</CardTitle>
          <CardDescription>
            {enabled
              ? <>Use <code>{"{{name}}"}</code> and <code>{"{{order_id}}"}</code> as placeholders. Toggle off any template you don't want sent.</>
              : <span className="text-amber-500">Master switch is OFF — no auto SMS will be sent regardless of these toggles.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {AUTO_TEMPLATES.map((t) => {
            const isOn = en[t.enKey] && enabled;
            return (
              <div key={t.tplKey} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                  <Switch
                    checked={en[t.enKey]}
                    disabled={!enabled}
                    onCheckedChange={(v) => setEn((s) => ({ ...s, [t.enKey]: v }))}
                  />
                </div>
                <Textarea
                  rows={3}
                  value={tpl[t.tplKey]}
                  disabled={!isOn}
                  onChange={(e) => setTpl((s) => ({ ...s, [t.tplKey]: e.target.value }))}
                  maxLength={1000}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual message templates</CardTitle>
          <CardDescription>
            Default text pre-filled in the manual SMS composer. Use <code>{"{{name}}"}</code> as placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {MANUAL_TEMPLATES.map((t) => (
            <div key={t.tplKey} className="space-y-2">
              <Label>{t.title}</Label>
              <Textarea
                rows={3}
                value={tpl[t.tplKey]}
                onChange={(e) => setTpl((s) => ({ ...s, [t.tplKey]: e.target.value }))}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save changes
      </Button>
    </div>
  );
}
