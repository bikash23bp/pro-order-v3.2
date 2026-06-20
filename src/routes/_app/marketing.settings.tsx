import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { getWhatsappSettings, saveWhatsappSettings } from "@/lib/marketing.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/marketing/settings")({
  head: () => ({ meta: [{ title: "Marketing settings" }] }),
  component: SettingsTab,
});

function SettingsTab() {
  const fetchSettings = useServerFn(getWhatsappSettings);
  const save = useServerFn(saveWhatsappSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [senderName, setSenderName] = useState("");

  useEffect(() => {
    fetchSettings().then((s: any) => {
      if (s) {
        setEnabled(!!s.enabled);
        setApiUrl(s.api_url ?? "");
        setApiToken(s.api_token ?? "");
        setPhoneNumberId(s.phone_number_id ?? "");
        setSenderName(s.sender_name ?? "");
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: {
        enabled,
        api_url: apiUrl.trim(),
        api_token: apiToken.trim(),
        phone_number_id: phoneNumberId.trim(),
        sender_name: senderName.trim(),
      }});
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>WhatsApp API</CardTitle>
        <CardDescription>
          Compatible with Meta Cloud API and most WhatsApp providers. The endpoint will receive
          a JSON POST with a Bearer token.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Enable WhatsApp messaging</Label>
                <p className="text-xs text-muted-foreground">Required to send bulk WhatsApp messages.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2">
              <Label>API URL</Label>
              <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://graph.facebook.com/v20.0" />
              <p className="text-xs text-muted-foreground">For Meta Cloud API, the phone number ID is appended automatically.</p>
            </div>
            <div className="space-y-2">
              <Label>API Token</Label>
              <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Bearer token" />
            </div>
            <div className="space-y-2">
              <Label>Phone Number ID (optional)</Label>
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" />
            </div>
            <div className="space-y-2">
              <Label>Sender display name (optional)</Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="My Shop" />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
