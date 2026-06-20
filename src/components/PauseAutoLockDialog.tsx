import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Coffee } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const PAUSE_KEY = "inactivity_lock_pause_until";
const PAUSE_REASON_KEY = "inactivity_lock_pause_reason";

export function getPauseUntil(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PAUSE_KEY);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= Date.now()) {
    localStorage.removeItem(PAUSE_KEY);
    localStorage.removeItem(PAUSE_REASON_KEY);
    return null;
  }
  return n;
}

export function getPauseReason(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PAUSE_REASON_KEY);
}

export function clearPause() {
  localStorage.removeItem(PAUSE_KEY);
  localStorage.removeItem(PAUSE_REASON_KEY);
  window.dispatchEvent(new Event("inactivity-pause-changed"));
}

const REASONS = [
  { value: "Lunch break", label: "Lunch break" },
  { value: "Outside work", label: "Outside work" },
  { value: "Meeting", label: "Meeting" },
  { value: "Prayer", label: "Prayer" },
  { value: "Short break", label: "Short break" },
  { value: "custom", label: "Custom…" },
];

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function PauseAutoLockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState("Lunch break");
  const [customReason, setCustomReason] = useState("");
  const [duration, setDuration] = useState<number>(60);
  const [saving, setSaving] = useState(false);

  async function handlePause() {
    const finalReason = reason === "custom" ? customReason.trim() : reason;
    if (!finalReason) return toast.error("Please enter a reason");
    if (!user?.id) return;
    if (duration < 1 || duration > 600) return toast.error("Duration must be 1–600 minutes");

    setSaving(true);
    const expiresAt = new Date(Date.now() + duration * 60_000);
    const { error } = await supabase.from("inactivity_lock_pauses").insert({
      user_id: user.id,
      reason: finalReason,
      duration_minutes: duration,
      expires_at: expiresAt.toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);

    localStorage.setItem(PAUSE_KEY, String(expiresAt.getTime()));
    localStorage.setItem(PAUSE_REASON_KEY, finalReason);
    window.dispatchEvent(new Event("inactivity-pause-changed"));
    toast.success(`Auto-lock paused for ${duration} min`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-4 w-4" /> Pause auto-lock
          </DialogTitle>
          <DialogDescription>
            Going out for a bit? Set a reason and duration — auto-lock will stay off until time is up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === "custom" && (
              <Input
                placeholder="Type your reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={120}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={duration === d ? "default" : "outline"}
                  onClick={() => setDuration(d)}
                >
                  {d}m
                </Button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </div>
          <Button onClick={handlePause} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
            Pause auto-lock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
