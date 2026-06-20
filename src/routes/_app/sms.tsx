import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { sendCustomSms, listSmsLogs } from "@/lib/sms.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/sms")({
  head: () => ({ meta: [{ title: "SMS — OMS" }] }),
  component: SmsPanel,
});

type LogRow = {
  id: string; phone: string; message: string; status: string;
  error: string | null; trigger: string; created_at: string;
  order_id: string | null;
};

function SmsPanel() {
  const sendSms = useServerFn(sendCustomSms);
  const fetchLogs = useServerFn(listSmsLogs);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setLogs((await fetchLogs()) as LogRow[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const onSend = async () => {
    if (!phone.trim() || !message.trim()) return;
    setSending(true);
    try {
      await sendSms({ data: { phone: phone.trim(), message: message.trim() } });
      toast.success("SMS sent");
      setMessage("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SMS Panel</h1>
        <p className="text-sm text-muted-foreground">Send custom SMS messages and review delivery history.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Compose</CardTitle>
          <CardDescription>Send a one-off SMS to any phone number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} />
            <div className="text-xs text-muted-foreground text-right">{message.length}/1000</div>
          </div>
          <Button onClick={onSend} disabled={sending || !phone.trim() || !message.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send SMS
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle>Recent SMS</CardTitle>
            <CardDescription>Last 200 messages sent from this app.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No SMS sent yet.</TableCell></TableRow>
              ) : logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{l.phone}</TableCell>
                  <TableCell className="max-w-xs truncate" title={l.message}>{l.message}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{l.trigger}</Badge></TableCell>
                  <TableCell>
                    {l.status === "sent" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30" variant="outline">Sent</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30" title={l.error ?? ""}>Failed</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
