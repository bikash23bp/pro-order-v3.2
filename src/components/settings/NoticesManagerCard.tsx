import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Notice = { id: string; message: string; active: boolean; created_at: string };

export function NoticesManagerCard() {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("notices")
      .select("id, message, active, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message.includes("does not exist")
        ? "notices টেবিল নেই — নিচের SQL আপনার Supabase-এ চালান।"
        : error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as Notice[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newMsg.trim()) return;
    setAdding(true);
    const { error } = await (supabase as any)
      .from("notices")
      .insert({ message: newMsg.trim(), active: true });
    setAdding(false);
    if (error) return toast.error(error.message);
    setNewMsg("");
    toast.success("Notice added");
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await (supabase as any)
      .from("notices").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateMsg = async (id: string, message: string) => {
    const { error } = await (supabase as any)
      .from("notices").update({ message }).eq("id", id);
    if (error) return toast.error(error.message);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this notice?")) return;
    const { error } = await (supabase as any)
      .from("notices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Notices (Marquee)</CardTitle>
        <CardDescription>হেডারের নিচে যে চলমান নোটিস দেখাবে। Active করলে দেখাবে, off করলে হাইড।</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="নতুন নোটিস লিখুন..."
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          />
          <Button onClick={add} disabled={adding || !newMsg.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">কোনো notice নেই।</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Switch checked={n.active} onCheckedChange={(v) => toggle(n.id, v)} />
                <Input
                  defaultValue={n.message}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== n.message) updateMsg(n.id, v);
                  }}
                  className="flex-1"
                />
                <Button size="icon" variant="ghost" onClick={() => remove(n.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
