import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Search, Package, RefreshCw, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncWooProducts } from "@/lib/woo-sync.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProductImageUpload } from "@/components/products/ProductImageUpload";
import { transformImage } from "@/lib/image-url";
import { ProductVariantsManager, type AttributeSchema, type VariantRow } from "@/components/products/ProductVariantsManager";
import { MotherLinksManager } from "@/components/products/MotherLinksManager";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  cost_price: number;
  stock_quantity: number;
  category_id: string | null;
  image_url: string | null;
  status: "active" | "inactive";
  has_variants: boolean;
  use_variant_pricing: boolean;
  variant_attributes: { name: string; values: string[] }[];
  is_mother_product: boolean;
  mother_unit: string | null;
  is_featured: boolean;
};

type Category = { id: string; name: string };

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const { permissions, role } = useAuth();
  const canManageProducts = role === "admin" || role === "business_owner" || !!permissions?.can_manage_products;
  const [rows, setRows] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p, error: pe }, { data: c, error: ce }] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    if (pe) toast.error(pe.message);
    if (ce) toast.error(ce.message);
    setRows((p ?? []) as unknown as Product[]);
    setCategories((c ?? []) as Category[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  const filtered = rows.filter((r) => {
    const matchesQ = r.name.toLowerCase().includes(q.toLowerCase()) || (r.sku ?? "").toLowerCase().includes(q.toLowerCase());
    const matchesCat = catFilter === "all" || r.category_id === catFilter;
    return matchesQ && matchesCat;
  });

  const onDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    load();
  };

  const toggleFeatured = async (p: Product) => {
    const next = !p.is_featured;
    setRows((prev) => prev.map((r) => r.id === p.id ? { ...r, is_featured: next } : r));
    const { error } = await supabase.from("products").update({ is_featured: next } as never).eq("id", p.id);
    if (error) {
      setRows((prev) => prev.map((r) => r.id === p.id ? { ...r, is_featured: !next } : r));
      return toast.error(error.message);
    }
    toast.success(next ? "Marked as featured" : "Removed from featured");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your catalog, pricing, and stock.</p>
        </div>
        {canManageProducts && (
          <div className="flex items-center gap-2">
            <SyncProductsButton onDone={load} />
            <Dialog open={open && !editing} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" />New Product</Button>
              </DialogTrigger>
              <ProductForm editing={null} categories={categories} onClose={() => setOpen(false)} onSaved={load} />
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-muted grid place-items-center overflow-hidden">
                        {r.image_url
                          ? <img src={transformImage(r.image_url, { width: 72, height: 72 })} alt={r.name} width={36} height={36} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          : <Package className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="font-medium">{r.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground font-mono text-xs">{r.sku ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.category_id ? catMap[r.category_id] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-right">৳ {Number(r.price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {r.has_variants ? (
                      <Badge variant="outline" className="text-[10px]">variants</Badge>
                    ) : (
                      <span className={r.stock_quantity < 0 ? "text-destructive font-semibold" : r.stock_quantity === 0 ? "text-destructive" : r.stock_quantity < 10 ? "text-yellow-500" : ""}>
                        {r.stock_quantity}
                      </span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {canManageProducts && (
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleFeatured(r)}
                          title={r.is_featured ? "Remove from featured" : "Add to featured (quick order picker)"}
                        >
                          <Star className={"h-4 w-4 " + (r.is_featured ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
                        </Button>
                        <Dialog open={open && editing?.id === r.id} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
                          <DialogTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          {editing?.id === r.id && (
                            <ProductForm editing={editing} categories={categories} onClose={() => { setOpen(false); setEditing(null); }} onSaved={load} />
                          )}
                        </Dialog>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
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

function ProductForm({
  editing, categories, onClose, onSaved,
}: {
  editing: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [sku, setSku] = useState(editing?.sku ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [price, setPrice] = useState<string>(String(editing?.price ?? "0"));
  const [costPrice, setCostPrice] = useState<string>(String(editing?.cost_price ?? "0"));
  const [stock, setStock] = useState<string>(String(editing?.stock_quantity ?? "0"));
  const [categoryId, setCategoryId] = useState<string>(editing?.category_id ?? "none");
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(editing?.status ?? "active");
  const [saving, setSaving] = useState(false);

  const [hasVariants, setHasVariants] = useState(editing?.has_variants ?? false);
  const [useVariantPricing, setUseVariantPricing] = useState(editing?.use_variant_pricing ?? false);
  const [attrs, setAttrs] = useState<AttributeSchema[]>(editing?.variant_attributes ?? []);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const [isMother, setIsMother] = useState(editing?.is_mother_product ?? false);
  const [motherUnit, setMotherUnit] = useState(editing?.mother_unit ?? "");


  useEffect(() => {
    if (!editing?.id) return;
    setLoadingVariants(true);
    (async () => {
      const { data } = await supabase
        .from("product_variants")
        .select("id, attributes, sku, price, cost_price, stock_quantity, image_url")
        .eq("product_id", editing.id)
        .order("created_at", { ascending: true });
      setVariants(
        ((data ?? []) as unknown as Array<{
          id: string;
          attributes: Record<string, string>;
          sku: string | null;
          price: number | null;
          cost_price: number | null;
          stock_quantity: number;
          image_url: string | null;
        }>).map((v) => ({
          id: v.id,
          attributes: v.attributes ?? {},
          sku: v.sku,
          price: v.price === null ? null : Number(v.price),
          cost_price: v.cost_price === null ? null : Number(v.cost_price),
          stock_quantity: v.stock_quantity,
          image_url: v.image_url,
        })),
      );
      setLoadingVariants(false);
    })();
  }, [editing?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");

    if (hasVariants) {
      if (attrs.length === 0) return toast.error("Add at least one attribute (e.g. Color)");
      if (variants.length === 0) return toast.error("Add at least one variant or click Generate combinations");
      const seen = new Set<string>();
      for (const v of variants) {
        const k = attrs.map((a) => `${a.name}=${v.attributes[a.name] ?? ""}`).join("|");
        if (seen.has(k)) return toast.error("Duplicate variant combinations exist");
        seen.add(k);
      }
    }

    setSaving(true);
    const effectiveUseVariantPricing = hasVariants && useVariantPricing;
    const payload = {
      name: name.trim(),
      sku: sku.trim() || null,
      description: description.trim() || null,
      price: effectiveUseVariantPricing ? 0 : Number(price) || 0,
      cost_price: effectiveUseVariantPricing ? 0 : Number(costPrice) || 0,
      stock_quantity: hasVariants ? 0 : Number(stock) || 0,
      category_id: categoryId === "none" ? null : categoryId,
      image_url: imageUrl.trim() || null,
      status,
      has_variants: hasVariants,
      use_variant_pricing: effectiveUseVariantPricing,
      variant_attributes: hasVariants ? attrs : [],
      is_mother_product: isMother,
      mother_unit: isMother ? (motherUnit.trim() || null) : null,
    };

    let productId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("products").update(payload as never).eq("id", editing.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(payload as never)
        .select("id")
        .single();
      if (error || !data) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
      productId = (data as { id: string }).id;
    }

    if (hasVariants && productId) {
      // Sync variants: delete removed, upsert kept/new
      const { data: existing } = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", productId);
      const keepIds = new Set(variants.filter((v) => v.id).map((v) => v.id!));
      const toDelete = ((existing ?? []) as Array<{ id: string }>)
        .filter((e) => !keepIds.has(e.id))
        .map((e) => e.id);
      if (toDelete.length > 0) {
        await supabase.from("product_variants").delete().in("id", toDelete);
      }
      for (const v of variants) {
        // When per-variant pricing is OFF, fall back to main product price/cost.
        const variantPrice = effectiveUseVariantPricing ? v.price : Number(price) || 0;
        const variantCost = effectiveUseVariantPricing ? (v.cost_price ?? 0) : Number(costPrice) || 0;
        const row = {
          product_id: productId,
          attributes: v.attributes,
          sku: v.sku,
          price: variantPrice,
          cost_price: variantCost,
          stock_quantity: v.stock_quantity,
          image_url: v.image_url,
        };
        if (v.id) {
          await supabase.from("product_variants").update(row as never).eq("id", v.id);
        } else {
          await supabase.from("product_variants").insert(row as never);
        }
      }
    } else if (!hasVariants && productId) {
      // Variants disabled — purge any existing variants
      await supabase.from("product_variants").delete().eq("product_id", productId);
    }

    setSaving(false);
    toast.success(editing ? "Product updated" : "Product created");
    onSaved();
    onClose();
  };

  return (
    <DialogContent className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={sku ?? ""} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!(hasVariants && useVariantPricing) && (
              <>
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                </div>
              </>
            )}
            {!hasVariants && (
              <div className="space-y-2">
                <Label>Stock Quantity</Label>
                <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Product Image</Label>
              <ProductImageUpload value={imageUrl || null} onChange={(v: string | null) => setImageUrl(v ?? "")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="sm:col-span-2 border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Variants</Label>
                  <p className="text-xs text-muted-foreground">
                    Color, Size, Weight ইত্যাদি variant তৈরি করুন
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => {
                      setHasVariants(e.target.checked);
                      if (!e.target.checked) setUseVariantPricing(false);
                    }}
                    className="h-4 w-4"
                  />
                  This product has variants
                </label>
              </div>
              {hasVariants && (
                <>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer bg-muted/30 border rounded px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={useVariantPricing}
                      onChange={(e) => setUseVariantPricing(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>
                      Use per-variant pricing
                      <span className="text-xs text-muted-foreground ml-1">
                        (টিক না দিলে মূল প্রডাক্টের দাম সব ভেরিয়েন্টে যাবে)
                      </span>
                    </span>
                  </label>
                  {loadingVariants ? (
                    <div className="text-xs text-muted-foreground">Loading variants…</div>
                  ) : (
                    <ProductVariantsManager
                      attributes={attrs}
                      variants={variants}
                      onChange={setAttrs}
                      onVariantsChange={setVariants}
                      showPricing={useVariantPricing}
                    />
                  )}
                </>
              )}
            </div>

            {/* Mother product section */}
            <div className="sm:col-span-2 border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Mother Product</Label>
                  <p className="text-xs text-muted-foreground">
                    এই প্রডাক্ট থেকে অন্য sub-product বিক্রির সময় stock কাটা হবে (যেমন বস্তা → কেজি)
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMother}
                    onChange={(e) => setIsMother(e.target.checked)}
                    className="h-4 w-4"
                  />
                  This is a mother product
                </label>
              </div>
              {isMother && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs">Mother Unit (e.g. gram, ml, piece)</Label>
                    <Input
                      value={motherUnit ?? ""}
                      onChange={(e) => setMotherUnit(e.target.value)}
                      placeholder="gram"
                    />
                  </div>
                  {editing?.id ? (
                    <MotherLinksManager motherProductId={editing.id} />
                  ) : (
                    <p className="text-xs text-muted-foreground rounded-md border bg-muted/20 p-3">
                      প্রথমে প্রডাক্টটি Save করুন, তারপর এই ডায়লগে আবার এসে sub-product link করতে পারবেন।
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SyncProductsButton({ onDone }: { onDone: () => void }) {
  const sync = useServerFn(syncWooProducts);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await sync({ data: {} });
      toast.success(`Synced ${r.created + r.updated} products (${r.created} new, ${r.updated} updated${r.failed ? `, ${r.failed} failed` : ""})`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {busy ? "Syncing products…" : "Sync Products from Website"}
    </Button>
  );
}
