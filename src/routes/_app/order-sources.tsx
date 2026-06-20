import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/order-sources")({
  head: () => ({ meta: [{ title: "Order Sources — OMS" }] }),
  component: OrderSourcesPage,
});

type Source = { id: string; name: string; visible: boolean };

function OrderSourcesPage() {
  const [rows, setRows] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("order_sources")
      .select("id,name,visible")
      .order("name");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Source[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const { error } = await supabase.from("order_sources").insert({ name });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Source added");
    setNewName("");
    load();
  };

  const toggle = async (id: string, visible: boolean) => {
    const { error } = await supabase.from("order_sources").update({ visible }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => x.id === id ? { ...x, visible } : x));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this source?")) return;
    const { error } = await supabase.from("order_sources").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Order Sources</h1>
        <p className="text-sm text-muted-foreground">Manage where orders come from (FB, Web, Direct, etc.).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Source</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="Source name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32 text-center">Visible</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No sources yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.visible} onCheckedChange={(v) => toggle(r.id, v)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
