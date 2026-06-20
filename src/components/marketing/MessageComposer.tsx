import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { listTemplates, type MessageTemplate } from "@/lib/marketing.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  channel: "whatsapp" | "sms";
  selectedCount: number;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (message: string) => Promise<void>;
  sampleName?: string | null;
};

export function MessageComposer({ channel, selectedCount, disabled, disabledReason, onSend, sampleName }: Props) {
  const fetchTemplates = useServerFn(listTemplates);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("custom");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchTemplates({ data: { channel } })
      .then((t) => setTemplates(t as MessageTemplate[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
  }, [channel]);

  useEffect(() => {
    if (templateId === "custom") return;
    const t = templates.find((x) => x.id === templateId);
    if (t) setMessage(t.body);
  }, [templateId, templates]);

  const preview = message.replace(/\{\{name\}\}/g, sampleName || "Customer");
  const canSend = !disabled && selectedCount > 0 && message.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try { await onSend(message.trim()); } finally { setSending(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose message</CardTitle>
        <CardDescription>
          Use <code className="text-xs">{"{{name}}"}</code> and <code className="text-xs">{"{{phone}}"}</code> as placeholders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">— Custom message —</SelectItem>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea
            rows={6}
            maxLength={4000}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setTemplateId("custom"); }}
            placeholder={`Write your ${channel === "whatsapp" ? "WhatsApp" : "SMS"} message…`}
          />
          <div className="text-xs text-muted-foreground text-right">{message.length}/4000</div>
        </div>
        {preview && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Preview</div>
            <div className="whitespace-pre-wrap">{preview}</div>
          </div>
        )}
        {disabled && disabledReason && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
            {disabledReason}
          </div>
        )}
        <Button onClick={handleSend} disabled={!canSend} className="w-full">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send to {selectedCount} customer{selectedCount === 1 ? "" : "s"}
        </Button>
      </CardContent>
    </Card>
  );
}
