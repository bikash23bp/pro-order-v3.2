import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Ban } from "lucide-react";

type Reason = { id: string; label: string; active: boolean; sort_order: number };

export function CancelReasonDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onConfirm: (reasonId: string, label: string) => Promise<void> | void;
}) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    supabase
      .from("cancel_reasons")
      .select("id,label,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setReasons((data ?? []) as Reason[]);
        setLoading(false);
      });
  }, [open]);

  const submit = async () => {
    if (!selected) return;
    const label = reasons.find((r) => r.id === selected)?.label ?? "";
    setBusy(true);
    try {
      await onConfirm(selected, label);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-red-500" />Cancel {count > 1 ? `${count} orders` : "order"}</DialogTitle>
          <DialogDescription>কারণটি বেছে নিন। Stock ফেরত যাবে।</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
        ) : reasons.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">
            No active reasons. যান Settings → <b>Cancel Reasons</b>-এ কিছু add করে আসুন।
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-auto">
            {reasons.map((r) => {
              const active = selected === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className={`text-left rounded-md border-2 px-3 py-2 text-sm transition-colors ${
                    active ? "border-red-500 bg-red-500/10 text-foreground" : "border-border hover:bg-muted"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Back</Button>
          <Button variant="destructive" onClick={submit} disabled={!selected || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Confirm cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}