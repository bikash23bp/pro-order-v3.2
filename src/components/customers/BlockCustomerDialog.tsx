import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { blockCustomer, getMyIp } from "@/lib/blocked-customers.functions";
import { ShieldAlert, Globe } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string;
  defaultIp?: string;
  onBlocked?: () => void;
  /** When true, allow editing phone/ip fields. When false, fields are read-only. */
  allowEdit?: boolean;
};

export function BlockCustomerDialog({ open, onOpenChange, defaultPhone, defaultIp, onBlocked, allowEdit = true }: Props) {
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [ip, setIp] = useState(defaultIp ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ipBusy, setIpBusy] = useState(false);
  const block = useServerFn(blockCustomer);
  const fetchMyIp = useServerFn(getMyIp);

  const useMyIp = async () => {
    setIpBusy(true);
    try {
      const r = await fetchMyIp();
      if (!r.ip) return toast.error("Could not detect your IP");
      setIp(r.ip);
      toast.success(`Using your current IP: ${r.ip}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to detect IP");
    } finally {
      setIpBusy(false);
    }
  };

  // Sync when opened with new defaults
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setPhone(defaultPhone ?? "");
      setIp(defaultIp ?? "");
      setReason("");
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!reason.trim()) return toast.error("Reason is required");
    if (!phone.trim() && !ip.trim()) return toast.error("Provide a phone or IP");
    setBusy(true);
    try {
      await block({ data: { phone: phone.trim() || undefined, ip: ip.trim() || undefined, reason: reason.trim() } });
      toast.success("Customer blocked");
      onOpenChange(false);
      onBlocked?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to block");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="h-5 w-5" /> Block Customer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bc-phone">Phone number</Label>
            <Input
              id="bc-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              readOnly={!allowEdit && !!defaultPhone}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="bc-ip">IP address (optional)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={useMyIp} disabled={ipBusy} className="h-6 px-2 text-xs">
                <Globe className="h-3 w-3" /> {ipBusy ? "Detecting…" : "Use my IP"}
              </Button>
            </div>
            <Input
              id="bc-ip"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="e.g. 103.x.x.x"
              readOnly={!allowEdit && !!defaultIp}
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can block by phone, IP, or both. Either alone is enough.
            </p>
          </div>
          <div>
            <Label htmlFor="bc-reason" className="text-red-600">
              Reason for blocking <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="bc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. হয়রানি করিয়েছে, fake order, abusive…"
              rows={3}
              maxLength={500}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              This reason will be shown in red whenever this customer tries to place a new order.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Blocking…" : "Block customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
