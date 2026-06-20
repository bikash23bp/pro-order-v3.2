import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getWhatsappSettings, sendBulkWhatsapp, type Recipient } from "@/lib/marketing.functions";
import { RecipientPicker } from "@/components/marketing/RecipientPicker";
import { MessageComposer } from "@/components/marketing/MessageComposer";

export const Route = createFileRoute("/_app/marketing/whatsapp")({
  head: () => ({ meta: [{ title: "Bulk WhatsApp — Marketing" }] }),
  component: WhatsappTab,
});

function WhatsappTab() {
  const getSettings = useServerFn(getWhatsappSettings);
  const sendBulk = useServerFn(sendBulkWhatsapp);
  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getSettings().then((s: any) => setConfigured(!!(s?.enabled && s?.api_url && s?.api_token))).catch(() => setConfigured(false));
  }, []);

  const onSend = async (message: string) => {
    const recipients = Array.from(selected.values()).map((r) => ({ phone: r.phone, name: r.name }));
    try {
      const res = (await sendBulk({ data: { message, recipients } })) as { sent: number; failed: number; total: number };
      toast.success(`Sent ${res.sent} · Failed ${res.failed}`);
      setSelected(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  };

  const first = Array.from(selected.values())[0];
  const disabled = configured === false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <RecipientPicker selected={selected} onSelectedChange={setSelected} />
      <div className="space-y-4">
        {disabled && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            WhatsApp API is not configured. <Link to="/marketing/settings" className="underline font-medium">Open settings</Link>.
          </div>
        )}
        <MessageComposer
          channel="whatsapp"
          selectedCount={selected.size}
          disabled={disabled}
          disabledReason={disabled ? "Configure WhatsApp API in settings before sending." : undefined}
          onSend={onSend}
          sampleName={first?.name}
        />
      </div>
    </div>
  );
}
