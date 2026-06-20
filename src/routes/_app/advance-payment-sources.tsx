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

export const Route = createFileRoute("/_app/advance-payment-sources")({
  head: () => ({ meta: [{ title: "Advance Payment Sources — OMS" }] }),
  component: AdvancePaymentSourcesPage,
});

type Source = {
  id: string;
  name: string;
  visible: boolean;
  requires_txn_id: boolean;
  sort_order: number;
};

function AdvancePaymentSourcesPage() {
  const [rows, setRows] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newRequiresTxn, setNewRequiresTxn] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("advance_payment_sources")
      .select("id,name,visible,requires_txn_id,sort_order")
      .order("sort_order")
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
    const nextOrder = (rows[rows.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("advance_payment_sources").insert({
      name,
      requires_txn_id: newRequiresTxn,
      sort_order: nextOrder,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Payment source added");
    setNewName("");
    setNewRequiresTxn(false);
    load();
  };

  const toggleVisible = async (id: string, visible: boolean) => {
    const { error } = await supabase.from("advance_payment_sources").update({ visible }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => x.id === id ? { ...x, visible } : x));
  };

  const toggleRequiresTxn = async (id: string, requires_txn_id: boolean) => {
    const { error } = await supabase.from("advance_payment_sources").update({ requires_txn_id }).eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => x.id === id ? { ...x, requires_txn_id } : x));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this payment source?")) return;
    const { error } = await supabase.from("advance_payment_sources").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Advance Payment Sources</h1>
        <p className="text-sm text-muted-foreground">
          কাস্টমার এডভান্স কিসে দিল (Cash, bKash, Nagad, Bank ইত্যাদি) — এখান থেকে manage করুন।
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Source</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. bKash, Nagad, Bank Transfer"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button onClick={add} disabled={adding || !newName.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={newRequiresTxn} onCheckedChange={setNewRequiresTxn} />
            Transaction ID বাধ্যতামূলক করা হোক
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-44 text-center">Requires Txn ID</TableHead>
                <TableHead className="w-32 text-center">Visible</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No sources yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.requires_txn_id} onCheckedChange={(v) => toggleRequiresTxn(r.id, v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.visible} onCheckedChange={(v) => toggleVisible(r.id, v)} />
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
