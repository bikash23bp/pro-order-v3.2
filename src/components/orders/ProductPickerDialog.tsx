import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, Package, Layers, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transformImage } from "@/lib/image-url";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type PickerVariant = {
  id: string;
  product_id: string;
  attributes: Record<string, string>;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
  image_url: string | null;
};

export type PickerProduct = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  category_id: string | null;
  has_variants?: boolean;
  is_featured?: boolean;
  variants?: PickerVariant[];
};

type Category = { id: string; name: string };

export function ProductPickerDialog({
  open,
  onClose,
  products: providedProducts,
  selectedIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional pre-loaded products. If omitted, the dialog fetches its own. */
  products?: PickerProduct[];
  /** Set of unique line identifiers — `${product_id}` or `${product_id}:${variant_id}` */
  selectedIds: Set<string>;
  onAdd: (product: PickerProduct, variant?: PickerVariant) => void;
}) {
  const [internal, setInternal] = useState<PickerProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [variantOf, setVariantOf] = useState<PickerProduct | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: cats } = await supabase.from("categories").select("id, name").eq("status", "active").order("name");
      setCategories((cats ?? []) as Category[]);
      if (!providedProducts) {
        setLoading(true);
        const { data } = await supabase
          .from("products")
          .select("id, name, sku, price, stock_quantity, image_url, category_id, has_variants, is_featured, product_variants(id, product_id, attributes, sku, price, stock_quantity, image_url, status)")
          .eq("status", "active")
          .order("name");
        const rows = ((data ?? []) as unknown as Array<PickerProduct & { product_variants?: PickerVariant[] }>).map((p) => ({
          ...p,
          variants: (p.product_variants ?? []).filter((v: PickerVariant & { status?: string }) => (v as { status?: string }).status !== "inactive"),
        }));
        setInternal(rows);
        setLoading(false);
      }
    })();
  }, [open, providedProducts]);

  const products = providedProducts ?? internal;

  const hasAnyFeatured = useMemo(() => products.some((p) => p.is_featured), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (featuredOnly && hasAnyFeatured && !p.is_featured) return false;
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, categoryId, featuredOnly, hasAnyFeatured]);

  const handleCardClick = (p: PickerProduct) => {
    if (p.has_variants && (p.variants?.length ?? 0) > 0) {
      setVariantOf(p);
    } else {
      onAdd(p);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-3 p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Select Products</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-2 px-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by name or SKU…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={featuredOnly ? "default" : "outline"}
              onClick={() => setFeaturedOnly((v) => !v)}
              disabled={!hasAnyFeatured}
              title={hasAnyFeatured ? "Toggle featured-only" : "No featured products yet — mark some from Products page"}
              className="gap-1"
            >
              <Star className={"h-4 w-4 " + (featuredOnly ? "fill-current" : "")} />
              Featured
            </Button>
          </div>

          <div className="px-6 text-xs text-muted-foreground flex items-center justify-between">
            <span>{filtered.length} product{filtered.length === 1 ? "" : "s"}</span>
            {selectedIds.size > 0 && (
              <span className="text-primary">{selectedIds.size} in order</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-2">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading products…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No products match.</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                {filtered.map((p) => {
                  const variantCount = p.has_variants ? (p.variants?.length ?? 0) : 0;
                  const totalStock = variantCount > 0
                    ? p.variants!.reduce((s, v) => s + (v.stock_quantity ?? 0), 0)
                    : p.stock_quantity;
                  const selected = selectedIds.has(p.id) ||
                    (variantCount > 0 && p.variants!.some((v) => selectedIds.has(`${p.id}:${v.id}`)));
                  const out = totalStock <= 0;
                  return (
                    <div
                      key={p.id}
                      className={
                        "group relative rounded-md border bg-card overflow-hidden flex flex-col transition " +
                        (selected ? "border-primary ring-1 ring-primary/40" : "hover:border-primary/50")
                      }
                    >
                      <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden relative">
                        {p.image_url ? (
                          <img src={transformImage(p.image_url, { width: 240, height: 240 })} alt={p.name} width={120} height={120} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-7 w-7 text-muted-foreground/40" />
                        )}
                        {variantCount > 0 && (
                          <Badge variant="outline" className="absolute top-1 left-1 bg-background/80 text-[9px] px-1 py-0 gap-0.5 h-4">
                            <Layers className="h-2.5 w-2.5" /> {variantCount}
                          </Badge>
                        )}
                      </div>
                      <div className="p-1.5 flex flex-col gap-0.5 flex-1">
                        <div className="text-[11px] font-medium line-clamp-2 leading-tight min-h-[2.2em]">{p.name}</div>
                        <div className="flex items-center justify-between mt-auto pt-0.5">
                          <span className="text-xs font-semibold">৳{Number(p.price).toFixed(0)}</span>
                          <span
                            className={
                              "text-[9px] font-medium " +
                              (out ? "text-red-400" : totalStock < 5 ? "text-amber-400" : "text-emerald-400")
                            }
                          >
                            {totalStock}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? "secondary" : "default"}
                          onClick={() => handleCardClick(p)}
                          className="mt-1 h-6 px-1.5 text-[10px]"
                        >
                          {selected ? (
                            <><Check className="h-3 w-3" /> {variantCount > 0 ? "More" : "Added"}</>
                          ) : variantCount > 0 ? (
                            <><Plus className="h-3 w-3" /> Variant</>
                          ) : (
                            <><Plus className="h-3 w-3" /> Add</>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-6 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {variantOf && (
        <VariantChooserDialog
          product={variantOf}
          selectedIds={selectedIds}
          onPick={(v) => {
            onAdd(variantOf, v);
          }}
          onClose={() => setVariantOf(null)}
        />
      )}
    </>
  );
}

export function VariantChooserDialog({
  product,
  selectedIds,
  onPick,
  onClose,
}: {
  product: PickerProduct;
  selectedIds: Set<string>;
  onPick: (v: PickerVariant) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose variant — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
          {(product.variants ?? []).map((v) => {
            const selected = selectedIds.has(`${product.id}:${v.id}`);
            const out = v.stock_quantity <= 0;
            const price = v.price ?? product.price;
            const img = v.image_url ?? product.image_url;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v)}
                className={
                  "rounded-lg border p-2 text-left flex flex-col gap-1 hover:border-primary transition " +
                  (selected ? "border-primary ring-1 ring-primary/40" : "")
                }
              >
                <div className="aspect-square bg-muted/40 rounded overflow-hidden flex items-center justify-center">
                  {img ? <img src={transformImage(img, { width: 240, height: 240 })} width={120} height={120} loading="lazy" decoding="async" className="h-full w-full object-cover" alt="" /> : <Package className="h-8 w-8 text-muted-foreground/40" />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(v.attributes).map(([k, val]) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">{val}</Badge>
                  ))}
                </div>
                {v.sku && <div className="text-[10px] font-mono text-muted-foreground">{v.sku}</div>}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">৳{Number(price).toFixed(0)}</span>
                  <span className={out ? "text-red-400" : v.stock_quantity < 5 ? "text-amber-400" : "text-emerald-400"}>
                    Stock: {v.stock_quantity}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
