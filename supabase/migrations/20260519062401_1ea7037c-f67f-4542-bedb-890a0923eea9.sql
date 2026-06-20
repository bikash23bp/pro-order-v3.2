ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS use_variant_pricing boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;