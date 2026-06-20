import { useState } from "react";
import { Layers, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VariantChooserDialog, type PickerVariant, type PickerProduct } from "./ProductPickerDialog";
import { transformImage } from "@/lib/image-url";

export type RowProduct = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  category_id: string | null;
  has_variants?: boolean;
  variants?: PickerVariant[];
};

export type RowLine = {
  product_id: string;
  quantity: number;
  unit_price: number;
  variant_id?: string | null;
  variant_label?: string | null;
};

export function OrderLineItemRow({
  index,
  line,
  product,
  products,
  variantLabel,
  onProductChange,
  onQuantityChange,
  onPriceChange,
  onVariantChange,
  onRemove,
}: {
  index: number;
  line: RowLine;
  product?: RowProduct;
  products: RowProduct[];
  variantLabel?: string | null;
  onProductChange: (index: number, productId: string) => void;
  onQuantityChange: (index: number, quantity: number) => void;
  onPriceChange: (index: number, price: number) => void;
  onVariantChange?: (index: number, variant: PickerVariant | null) => void;
  onRemove: (index: number) => void;
}) {
  const total = line.quantity * line.unit_price;
  const [variantOpen, setVariantOpen] = useState(false);
  const hasVariants = !!product?.has_variants && (product?.variants?.length ?? 0) > 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 border rounded-lg p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
      {/* Product: image + name/select */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {product?.image_url ? (
          <img
            src={transformImage(product.image_url, { width: 112, height: 112 })}
            alt={product.name}
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 rounded-lg object-cover flex-shrink-0 border"
          />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-muted border flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
            No img
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Select
            value={line.product_id}
            onValueChange={(v) => onProductChange(index, v)}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="truncate">{p.name}</span>{" "}
                  <span className="text-muted-foreground text-xs">
                    (stock {p.stock_quantity})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {(variantLabel ?? line.variant_label) && (
              <span className="text-[11px] text-primary truncate">
                {variantLabel ?? line.variant_label}
              </span>
            )}
            {hasVariants && onVariantChange && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-primary"
                onClick={() => setVariantOpen(true)}
              >
                <Layers className="h-3 w-3" />
                {line.variant_id ? "Change variant" : "Choose variant"}
              </Button>
            )}
          </div>
          {product?.sku && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              SKU: {product.sku}
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap sm:flex-nowrap items-end gap-3 sm:gap-4">
        {/* Quantity */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Qty
          </Label>
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 rounded-r-none"
              onClick={() =>
                onQuantityChange(index, Math.max(1, line.quantity - 1))
              }
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) =>
                onQuantityChange(
                  index,
                  Math.max(1, Number(e.target.value) || 1),
                )
              }
              className="h-9 w-14 text-center rounded-none border-x-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 rounded-l-none"
              onClick={() => onQuantityChange(index, line.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Unit Price */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Price
          </Label>
          <Input
            type="number"
            step="0.01"
            value={line.unit_price}
            onChange={(e) =>
              onPriceChange(index, Number(e.target.value) || 0)
            }
            className="h-9 w-24"
          />
        </div>

        {/* Total */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total
          </Label>
          <span className="h-9 flex items-center text-sm font-semibold tabular-nums min-w-[4rem]">
            ৳{total.toFixed(0)}
          </span>
        </div>

        {/* Delete */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground select-none opacity-0">
            Del
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {variantOpen && hasVariants && product && (
        <VariantChooserDialog
          product={product as PickerProduct}
          selectedIds={new Set(line.variant_id ? [`${product.id}:${line.variant_id}`] : [])}
          onPick={(v) => {
            onVariantChange?.(index, v);
            setVariantOpen(false);
          }}
          onClose={() => setVariantOpen(false)}
        />
      )}
    </div>
  );
}
