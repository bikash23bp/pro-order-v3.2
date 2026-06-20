ALTER TABLE public.product_external_refs
  ALTER COLUMN external_variant_id SET DEFAULT '',
  ALTER COLUMN external_variant_id SET NOT NULL;

UPDATE public.product_external_refs
SET external_variant_id = ''
WHERE external_variant_id IS NULL;