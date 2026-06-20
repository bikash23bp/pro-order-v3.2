import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendBulkCustomerSms } from "@/lib/sms.functions";
import { RecipientPicker } from "@/components/marketing/RecipientPicker";
import { MessageComposer } from "@/components/marketing/MessageComposer";
import type { Recipient } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_app/marketing/sms")({
  head: () => ({ meta: [{ title: "Bulk SMS — Marketing" }] }),
  component: SmsTab,
});

function SmsTab() {
  const sendBulk = useServerFn(sendBulkCustomerSms);
  const [selected, setSelected] = useState<Map<string, Recipient>>(new Map());

  const onSend = async (message: string) => {
    const contacts = Array.from(selected.values()).map((r) => ({ phone: r.phone, name: r.name }));
    try {
      const res = (await sendBulk({ data: { message, contacts } })) as { sent: number; failed: number; total: number };
      toast.success(`Sent ${res.sent} · Failed ${res.failed}`);
      setSelected(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  };

  const first = Array.from(selected.values())[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <RecipientPicker selected={selected} onSelectedChange={setSelected} />
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Uses the SMS gateway from <Link to="/sms-settings" className="underline">SMS Settings</Link>.
        </div>
        <MessageComposer
          channel="sms"
          selectedCount={selected.size}
          onSend={onSend}
          sampleName={first?.name}
        />
      </div>
    </div>
  );
}
