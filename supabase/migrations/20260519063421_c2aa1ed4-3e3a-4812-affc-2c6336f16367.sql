DROP INDEX IF EXISTS public.order_items_order_product_key;
CREATE UNIQUE INDEX order_items_order_product_variant_key
  ON public.order_items (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));