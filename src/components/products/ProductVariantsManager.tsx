import { useMemo, useState } from "react";
import { Plus, Trash2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProductImageUpload } from "@/components/products/ProductImageUpload";

export type AttributeSchema = { name: string; values: string[] };
export type VariantRow = {
  id?: string; // existing variant id (DB)
  attributes: Record<string, string>;
  sku: string | null;
  price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  image_url: string | null;
};

export function ProductVariantsManager({
  attributes,
  variants,
  onChange,
  onVariantsChange,
  showPricing = true,
}: {
  attributes: AttributeSchema[];
  variants: VariantRow[];
  onChange: (attrs: AttributeSchema[]) => void;
  onVariantsChange: (variants: VariantRow[]) => void;
  /** When false, hides per-variant Price + Cost inputs (main product pricing is in use). */
  showPricing?: boolean;
}) {
  const [newAttrName, setNewAttrName] = useState("");
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const addAttribute = () => {
    const name = newAttrName.trim();
    if (!name) return;
    if (attributes.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...attributes, { name, values: [] }]);
    setNewAttrName("");
  };

  const removeAttribute = (idx: number) => {
    const removed = attributes[idx];
    onChange(attributes.filter((_, i) => i !== idx));
    // strip from existing variants
    onVariantsChange(
      variants.map((v) => {
        const { [removed.name]: _, ...rest } = v.attributes;
        return { ...v, attributes: rest };
      }),
    );
  };

  const addValue = (attrIdx: number) => {
    const attr = attributes[attrIdx];
    const draft = (valueDrafts[attr.name] ?? "").trim();
    if (!draft) return;
    if (attr.values.includes(draft)) return;
    const next = attributes.map((a, i) => (i === attrIdx ? { ...a, values: [...a.values, draft] } : a));
    onChange(next);
    setValueDrafts((d) => ({ ...d, [attr.name]: "" }));
  };

  const removeValue = (attrIdx: number, val: string) => {
    const next = attributes.map((a, i) =>
      i === attrIdx ? { ...a, values: a.values.filter((v) => v !== val) } : a,
    );
    onChange(next);
  };

  const variantKey = (attrs: Record<string, string>) =>
    attributes.map((a) => `${a.name}=${attrs[a.name] ?? ""}`).join("|");

  const generateCombinations = () => {
    if (attributes.length === 0 || attributes.some((a) => a.values.length === 0)) return;
    const combos: Record<string, string>[] = [{}];
    for (const a of attributes) {
      const next: Record<string, string>[] = [];
      for (const c of combos) for (const v of a.values) next.push({ ...c, [a.name]: v });
      combos.splice(0, combos.length, ...next);
    }
    const existing = new Map(variants.map((v) => [variantKey(v.attributes), v]));
    const merged = combos.map((attrs) => {
      const key = variantKey(attrs);
      const prev = existing.get(key);
      return (
        prev ?? {
          attributes: attrs,
          sku: null,
          price: null,
          cost_price: null,
          stock_quantity: 0,
          image_url: null,
        }
      );
    });
    onVariantsChange(merged);
  };

  const addEmptyVariant = () => {
    const blank: Record<string, string> = {};
    for (const a of attributes) blank[a.name] = a.values[0] ?? "";
    onVariantsChange([
      ...variants,
      { attributes: blank, sku: null, price: null, cost_price: null, stock_quantity: 0, image_url: null },
    ]);
  };

  const removeVariant = (idx: number) => {
    onVariantsChange(variants.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, patch: Partial<VariantRow>) => {
    onVariantsChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const updateVariantAttr = (idx: number, name: string, value: string) => {
    onVariantsChange(
      variants.map((v, i) => (i === idx ? { ...v, attributes: { ...v.attributes, [name]: value } } : v)),
    );
  };

  const dupeKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    variants.forEach((v, i) => {
      const k = variantKey(v.attributes);
      if (seen.has(k)) {
        dupes.add(i);
        dupes.add(seen.get(k)!);
      } else seen.set(k, i);
    });
    return dupes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, attributes]);

  return (
    <div className="space-y-4 border rounded-lg p-3 bg-muted/20">
      {/* Attributes builder */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Attributes</Label>
        <p className="text-xs text-muted-foreground">
          যেমন: Color → Red, Blue, Black. ইচ্ছেমত attribute যোগ করুন।
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="Attribute name (Color, Size, Weight…)"
            value={newAttrName}
            onChange={(e) => setNewAttrName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAttribute();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addAttribute}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {attributes.map((a, i) => (
            <div key={a.name} className="rounded border bg-background/40 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{a.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeAttribute(i)}
                  title="Remove attribute"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.values.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1 pr-1">
                    {v}
                    <button
                      type="button"
                      onClick={() => removeValue(i, v)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={`Add ${a.name} value…`}
                  value={valueDrafts[a.name] ?? ""}
                  onChange={(e) => setValueDrafts((d) => ({ ...d, [a.name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addValue(i);
                    }
                  }}
                  className="h-8"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => addValue(i)}>
                  Add value
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Variants list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Variants ({variants.length})</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={generateCombinations}
              disabled={attributes.length === 0 || attributes.some((a) => a.values.length === 0)}
              title="Generate all attribute combinations"
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate combinations
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addEmptyVariant}
              disabled={attributes.length === 0}
            >
              <Plus className="h-3.5 w-3.5" /> Add variant
            </Button>
          </div>
        </div>

        {variants.length === 0 ? (
          <div className="text-xs text-muted-foreground border rounded p-3 text-center">
            No variants yet. Add attributes & values, then click <em>Generate combinations</em>.
          </div>
        ) : (
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div
                key={i}
                className={
                  "rounded border bg-background/40 p-2 space-y-2 " +
                  (dupeKeys.has(i) ? "border-destructive" : "")
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  {attributes.map((a) => (
                    <div key={a.name} className="flex flex-col gap-0.5">
                      <Label className="text-[10px] uppercase text-muted-foreground">{a.name}</Label>
                      <select
                        value={v.attributes[a.name] ?? ""}
                        onChange={(e) => updateVariantAttr(i, a.name, e.target.value)}
                        className="h-8 rounded border bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {a.values.map((val) => (
                          <option key={val} value={val}>
                            {val}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">SKU</Label>
                    <Input
                      className="h-8 w-28"
                      value={v.sku ?? ""}
                      onChange={(e) => updateVariant(i, { sku: e.target.value || null })}
                      placeholder="SKU"
                    />
                  </div>
                  {showPricing && (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-[10px] uppercase text-muted-foreground">Sell Price</Label>
                        <Input
                          className="h-8 w-24"
                          type="number"
                          step="0.01"
                          value={v.price ?? ""}
                          onChange={(e) =>
                            updateVariant(i, { price: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <Label className="text-[10px] uppercase text-muted-foreground">Cost</Label>
                        <Input
                          className="h-8 w-24"
                          type="number"
                          step="0.01"
                          value={v.cost_price ?? ""}
                          onChange={(e) =>
                            updateVariant(i, { cost_price: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          placeholder="—"
                        />
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Stock</Label>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      value={v.stock_quantity}
                      onChange={(e) => updateVariant(i, { stock_quantity: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeVariant(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Variant image (optional)</Label>
                  <ProductImageUpload
                    value={v.image_url}
                    onChange={(url) => updateVariant(i, { image_url: url })}
                  />
                </div>
                {dupeKeys.has(i) && (
                  <div className="text-xs text-destructive">Duplicate attribute combination</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function variantLabel(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([, v]) => v)
    .filter(Boolean)
    .join(" / ");
}
