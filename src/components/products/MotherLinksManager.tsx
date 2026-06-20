import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type ProductOption = { id: string; name: string; sku: string | null };

type Link = {
  id: string;
  sub_product_id: string;
  sub_variant_id: string | null;
  consume_quantity: number;
};

export function MotherLinksManager({ motherProductId }: { motherProductId: string }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [subId, setSubId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: l, error: le }, { data: p, error: pe }] = await Promise.all([
      supabase
        .from("product_mother_links")
        .select("id, sub_product_id, sub_variant_id, consume_quantity")
        .eq("mother_product_id", motherProductId)
        .order("created_at", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, sku")
        .eq("status", "active")
        .neq("id", motherProductId)
        .order("name"),
    ]);
    if (le) toast.error(le.message);
    if (pe) toast.error(pe.message);
    setLinks((l ?? []) as Link[]);
    setProducts((p ?? []) as ProductOption[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [motherProductId]);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const linkedIds = new Set(links.map((l) => l.sub_product_id));
  const available = products.filter((p) => !linkedIds.has(p.id));

  const addLink = async () => {
    if (!subId) return toast.error("Sub-product বেছে নিন");
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return toast.error("Consume quantity > 0");
    setAdding(true);
    const { error } = await supabase.from("product_mother_links").insert({
      mother_product_id: motherProductId,
      sub_product_id: subId,
      consume_quantity: q,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    setSubId(""); setQty("1");
    load();
  };

  const updateQty = async (id: string, value: string) => {
    const q = Number(value);
    if (!Number.isFinite(q) || q <= 0) return;
    const { error } = await supabase
      .from("product_mother_links")
      .update({ consume_quantity: q })
      .eq("id", id);
    if (error) toast.error(error.message);
  };

  const removeLink = async (id: string) => {
    if (!confirm("এই লিংকটি মুছে দিতে চান?")) return;
    const { error } = await supabase.from("product_mother_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Sub-products (এই মাদার থেকে কাটা হবে)</Label>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {!loading && links.length === 0 && (
        <p className="text-xs text-muted-foreground">এখনো কোনো sub-product লিংক করা হয়নি।</p>
      )}
      {links.map((l) => {
        const p = productMap[l.sub_product_id];
        return (
          <div key={l.id} className="flex items-center gap-2">
            <div className="flex-1 text-sm">
              <div className="font-medium">{p?.name ?? "(unknown)"}</div>
              {p?.sku && <div className="text-[11px] text-muted-foreground font-mono">{p.sku}</div>}
            </div>
            <Input
              type="number"
              step="0.001"
              defaultValue={String(l.consume_quantity)}
              onBlur={(e) => updateQty(l.id, e.target.value)}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-8">/unit</span>
            <Button type="button" size="icon" variant="ghost" onClick={() => removeLink(l.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t">
        <Select value={subId} onValueChange={setSubId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Sub-product বেছে নিন…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value="__none" disabled>সব প্রডাক্ট ইতিমধ্যে লিংক করা</SelectItem>
            ) : available.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.sku ? ` · ${p.sku}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.001"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-24"
          placeholder="Qty"
        />
        <Button type="button" size="sm" onClick={addLink} disabled={adding || !subId}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        উদাহরণ: ১ pcs sub-product বিক্রি হলে এই মাদার থেকে কত unit (যেমন gram/ml) কাটা হবে।
      </p>
    </div>
  );
}
