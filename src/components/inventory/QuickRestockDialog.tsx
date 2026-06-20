import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { listSuppliers, listWarehouses, createPurchase } from "@/lib/inventory.functions";
import { supabase } from "@/integrations/supabase/client";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number | null;
  has_variants: boolean;
};
type Variant = {
  id: string;
  product_id: string;
  sku: string | null;
  attributes: Record<string, any>;
  cost_price: number | null;
};
type Item = {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_cost: number;
};

const fmt = (n: number) => "৳" + Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });

const variantLabel = (v: Variant) =>
  Object.values(v.attributes || {}).filter(Boolean).join(" / ") || v.sku || "Variant";

export function QuickRestockDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const fnSuppliers = useServerFn(listSuppliers);
  const fnWh = useServerFn(listWarehouses);
  const fnCreate = useServerFn(createPurchase);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({});
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paid, setPaid] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    fnSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
    fnWh().then(setWarehouses).catch(() => setWarehouses([]));
    supabase
      .from("products")
      .select("id, name, sku, cost_price, has_variants")
      .eq("status", "active")
      .order("name")
      .then((res) => setProducts((res.data ?? []) as Product[]));
  }, [open, fnSuppliers, fnWh]);

  const ensureVariants = async (productId: string) => {
    if (variantsByProduct[productId]) return variantsByProduct[productId];
    const { data } = await supabase
      .from("product_variants")
      .select("id, product_id, sku, attributes, cost_price")
      .eq("product_id", productId)
      .eq("status", "active");
    const list = ((data ?? []) as Variant[]);
    setVariantsByProduct((m) => ({ ...m, [productId]: list }));
    return list;
  };

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const reset = () => { setSupplierId(""); setWarehouseId(""); setPaid(0); setItems([]); };
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  const pickProduct = async (idx: number, productId: string) => {
    const p = productMap[productId];
    const c = [...items];
    c[idx] = {
      ...c[idx],
      product_id: productId,
      variant_id: null,
      unit_cost: c[idx].unit_cost || Number(p?.cost_price ?? 0),
    };
    setItems(c);
    setOpenPicker(null);
    if (p?.has_variants) await ensureVariants(productId);
  };

  const pickVariant = (idx: number, variantId: string) => {
    const c = [...items];
    const productId = c[idx].product_id;
    const v = (variantsByProduct[productId] ?? []).find((x) => x.id === variantId);
    c[idx] = {
      ...c[idx],
      variant_id: variantId,
      unit_cost: v?.cost_price ? Number(v.cost_price) : c[idx].unit_cost,
    };
    setItems(c);
  };

  const save = async () => {
    if (!supplierId || items.length === 0 || items.some((i) => !i.product_id)) {
      toast.error("Supplier ও কমপক্ষে একটি product দরকার");
      return;
    }
    // Validate: products with variants must have variant_id
    for (const it of items) {
      const p = productMap[it.product_id];
      if (p?.has_variants && !it.variant_id) {
        toast.error(`${p.name} — variant সিলেক্ট করুন`);
        return;
      }
    }
    setSaving(true);
    try {
      await fnCreate({
        data: {
          supplier_id: supplierId,
          warehouse_id: warehouseId || undefined,
          discount: 0,
          paid_amount: paid,
          items: items
            .filter((i) => i.product_id)
            .map((i) => ({
              product_id: i.product_id,
              variant_id: i.variant_id || null,
              quantity: i.quantity,
              unit_cost: i.unit_cost,
            })),
        },
      });
      toast.success("Restock সম্পন্ন হয়েছে");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Quick Restock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Items</Label>
            {items.map((it, idx) => {
              const p = productMap[it.product_id];
              const variants = it.product_id ? variantsByProduct[it.product_id] ?? [] : [];
              return (
                <div key={idx} className="mt-2 space-y-2 border rounded-md p-2">
                  <div className="grid grid-cols-12 gap-2">
                    <Popover open={openPicker === idx} onOpenChange={(o) => setOpenPicker(o ? idx : null)}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className={cn("col-span-6 justify-between font-normal", !it.product_id && "text-muted-foreground")}
                        >
                          <span className="truncate">{p ? p.name : "Search product..."}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                        <Command
                          filter={(value, search) => {
                            const prod = products.find((x) => x.id === value);
                            const hay = `${prod?.name ?? ""} ${prod?.sku ?? ""}`.toLowerCase();
                            return hay.includes(search.toLowerCase()) ? 1 : 0;
                          }}
                        >
                          <CommandInput placeholder="Search by name or SKU..." />
                          <CommandList>
                            <CommandEmpty>No product found.</CommandEmpty>
                            <CommandGroup>
                              {products.map((pp) => (
                                <CommandItem key={pp.id} value={pp.id} onSelect={() => pickProduct(idx, pp.id)}>
                                  <Check className={cn("mr-2 h-4 w-4", it.product_id === pp.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span>{pp.name}</span>
                                    {pp.sku && <span className="text-[10px] text-muted-foreground">{pp.sku}</span>}
                                  </div>
                                  {pp.has_variants && <span className="ml-auto text-[10px] text-muted-foreground">variants</span>}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Input type="number" placeholder="Qty" className="col-span-2" value={it.quantity || ""}
                      onChange={(e) => { const c = [...items]; c[idx].quantity = Number(e.target.value); setItems(c); }} />
                    <Input type="number" placeholder="Cost" className="col-span-3" value={it.unit_cost || ""}
                      onChange={(e) => { const c = [...items]; c[idx].unit_cost = Number(e.target.value); setItems(c); }} />
                    <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {p?.has_variants && (
                    <div className="pl-1">
                      <Select value={it.variant_id ?? ""} onValueChange={(v) => pickVariant(idx, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={variants.length ? "Select variant..." : "Loading variants..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {variantLabel(v)}{v.sku ? ` (${v.sku})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="mt-2"
              onClick={() => setItems([...items, { product_id: "", variant_id: null, quantity: 1, unit_cost: 0 }])}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
          <div className="flex justify-between items-end">
            <div><Label>Paid Now</Label><Input type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} className="w-32" /></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{fmt(subtotal)}</p></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Purchase"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
