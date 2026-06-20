import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { listOmsDestinations } from "@/lib/oms-endpoints.functions";
import { forwardOrder } from "@/lib/oms-forward.functions";

export function ForwardOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  orderNumber: number;
}) {
  const listFn = useServerFn(listOmsDestinations);
  const fwdFn = useServerFn(forwardOrder);
  const q = useQuery({
    queryKey: ["oms-destinations-active"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);

  const toggle = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }));

  const submit = async () => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return toast.error("Select at least one destination");
    setSending(true);
    try {
      const r = await fwdFn({ data: { orderId, destinationIds: ids } });
      const ok = r.results.filter((x) => x.ok).length;
      const fail = r.results.length - ok;
      if (ok > 0) toast.success(`Forwarded to ${ok} OMS`);
      if (fail > 0) {
        for (const f of r.results.filter((x) => !x.ok)) {
          toast.error(`${f.destination_name}: ${f.error ?? "Failed"}`);
        }
      }
      if (fail === 0) onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Forward failed");
    } finally {
      setSending(false);
    }
  };

  const dests = (q.data ?? []).filter((d) => d.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forward Order #{orderNumber}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : dests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            কোনো active destination নেই। প্রথমে Settings → OMS Endpoints-এ destination যোগ করুন।
          </p>
        ) : (
          <div className="space-y-2">
            <Label>Select destinations</Label>
            {dests.map((d) => (
              <label key={d.id} className="flex items-center gap-3 border rounded-md p-3 cursor-pointer hover:bg-accent">
                <Checkbox checked={!!selected[d.id]} onCheckedChange={() => toggle(d.id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{d.url}</div>
                </div>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={sending || dests.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
