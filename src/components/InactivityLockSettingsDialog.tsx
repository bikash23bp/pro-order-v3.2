import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  inactivity_lock_enabled: boolean;
  inactivity_lock_seconds: number;
};

export function InactivityLockSettingsDialog() {
  const { user, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, inactivity_lock_enabled, inactivity_lock_seconds")
      .order("full_name", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function update(id: string, patch: Partial<Pick<Row, "inactivity_lock_enabled" | "inactivity_lock_seconds">>) {
    setSavingId(id);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      setRows(prev);
      toast.error(error.message);
    } else {
      toast.success("Updated");
      if (user?.id === id) await refreshProfile();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Lock className="h-4 w-4 mr-1.5" />
          Auto-lock settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inactivity Auto-lock</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="w-24">Enabled</TableHead>
                  <TableHead className="w-32">Seconds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.inactivity_lock_enabled}
                        disabled={savingId === r.id}
                        onCheckedChange={(v) => update(r.id, { inactivity_lock_enabled: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={10}
                          max={86400}
                          value={r.inactivity_lock_seconds}
                          disabled={savingId === r.id}
                          onChange={(e) =>
                            setRows((rs) =>
                              rs.map((x) =>
                                x.id === r.id ? { ...x, inactivity_lock_seconds: Number(e.target.value) || 0 } : x,
                              ),
                            )
                          }
                          className="h-8 w-24"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={savingId === r.id}
                          onClick={() => {
                            const n = Math.max(10, Math.min(86400, Number(r.inactivity_lock_seconds) || 1800));
                            update(r.id, { inactivity_lock_seconds: n });
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Default 1800s = 30 min. Min 10s, max 86400s (24h). Change takes effect after the user's next page load or within ~5 minutes.
        </p>
      </DialogContent>
    </Dialog>
  );
}
