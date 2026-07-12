import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Plus, Save, Trash2, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Reason = {
  id: string;
  label: string;
  active: boolean;
  sort_order: number;
};

export function CancelReasonsCard() {
  const [rows, setRows] = useState<Reason[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cancel_reasons")
      .select("id,label,active,sort_order")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Reason[]);
  };

  useEffect(() => { void load(); }, []);

  const addReason = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    const nextOrder = (rows[rows.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("cancel_reasons").insert({ label, sort_order: nextOrder });
    setAdding(false);
    if (error) return toast.error(error.message);
    setNewLabel("");
    toast.success("Reason added");
    void load();
  };

  const updateRow = async (id: string, patch: Partial<Reason>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("cancel_reasons").update(patch).eq("id", id);
    if (error) { toast.error(error.message); void load(); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this reason? Existing orders keep it as a plain reference and will show 'No reason'.")) return;
    const { error } = await supabase.from("cancel_reasons").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[idx];
    const b = rows[j];
    const next = rows.slice();
    next[idx] = { ...a, sort_order: b.sort_order };
    next[j] = { ...b, sort_order: a.sort_order };
    setRows(next);
    await Promise.all([
      supabase.from("cancel_reasons").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("cancel_reasons").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ban className="h-4 w-4" />Cancel Reasons</CardTitle>
        <CardDescription>
          অর্ডার Cancel দিলে কারণ জিজ্ঞেস করা হবে। এখানে যা যা যোগ করবেন, ঠিক তাই লিস্টে দেখাবে ও Orders পেইজের Cancelled টপবারে সাব-ফিল্টার হিসেবে ভাগ হবে।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="New reason (e.g. Phone Off)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addReason(); }}
          />
          <Button onClick={addReason} disabled={adding || !newLabel.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add
          </Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No reasons yet. Add some above.</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  className="flex-1"
                  value={r.label}
                  onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.label) void updateRow(r.id, { label: v }); }}
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Active</span>
                  <Switch checked={r.active} onCheckedChange={(v) => void updateRow(r.id, { active: v })} />
                </div>
                <Button size="icon" variant="ghost" onClick={() => void deleteRow(r.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Save className="h-3 w-3" />লেবেল edit করে অন্য জায়গায় ক্লিক করলেই save হয়ে যাবে।
        </p>
      </CardContent>
    </Card>
  );
}