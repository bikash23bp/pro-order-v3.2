import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Phone, MessageSquare, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { sendCustomSms } from "@/lib/sms.functions";

// Normalize BD phone number to international format (8801XXXXXXXXX) without +
function toIntlBd(raw: string): string {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("88")) return digits;
  if (digits.startsWith("0")) return "88" + digits.slice(1);
  if (digits.startsWith("1") && digits.length === 10) return "88" + digits;
  return digits;
}

export function PhoneContactButtons({
  phone,
  customerName,
  orderId,
  orderNumber,
}: {
  phone: string;
  customerName?: string;
  orderId?: string;
  orderNumber?: number;
}) {
  const [smsOpen, setSmsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const sendSms = useServerFn(sendCustomSms);

  const trimmed = (phone || "").trim();
  const disabled = !trimmed;
  const intl = toIntlBd(trimmed);

  const presets = [
    `Hi ${customerName ?? ""}, your order${orderNumber ? ` #${orderNumber}` : ""} has been confirmed. Thank you!`.trim(),
    `Hi ${customerName ?? ""}, your order${orderNumber ? ` #${orderNumber}` : ""} has been shipped via courier.`.trim(),
    `Hi ${customerName ?? ""}, please confirm your order${orderNumber ? ` #${orderNumber}` : ""}. Reply YES to proceed.`.trim(),
  ];

  const submitSms = async () => {
    if (!message.trim() || !trimmed) return;
    setSending(true);
    try {
      await sendSms({
        data: {
          phone: trimmed,
          message: message.trim(),
          order_id: orderId ?? null,
          trigger: "manual_edit",
        },
      });
      toast.success("SMS sent");
      setSmsOpen(false);
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8"
          asChild={!disabled}
          disabled={disabled}
          title="Call"
        >
          {disabled ? (
            <span><Phone className="h-4 w-4" /></span>
          ) : (
            <a href={`tel:${trimmed}`}><Phone className="h-4 w-4" /></a>
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 text-emerald-500 hover:text-emerald-400"
          asChild={!disabled}
          disabled={disabled}
          title="WhatsApp"
        >
          {disabled ? (
            <span><MessageCircle className="h-4 w-4" /></span>
          ) : (
            <a href={`https://wa.me/${intl}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 text-sky-500 hover:text-sky-400"
          disabled={disabled}
          onClick={() => setSmsOpen(true)}
          title="Send SMS"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send SMS to {trimmed}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {presets.map((p, i) => (
                <Button
                  key={i}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-[11px] h-7"
                  onClick={() => setMessage(p)}
                >
                  Preset {i + 1}
                </Button>
              ))}
            </div>
            <Textarea
              rows={5}
              placeholder="Type your message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground text-right">
              {message.length}/500
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSms} disabled={sending || !message.trim()}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
