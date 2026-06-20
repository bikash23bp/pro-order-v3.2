CREATE TABLE IF NOT EXISTS public.product_external_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'woocommerce',
  source_site_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  external_variant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_site_id, external_product_id, external_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_product_external_refs_product
  ON public.product_external_refs(product_id);

CREATE INDEX IF NOT EXISTS idx_product_external_refs_lookup
  ON public.product_external_refs(source, source_site_id, external_product_id, external_variant_id);

ALTER TABLE public.product_external_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view product external refs" ON public.product_external_refs;
CREATE POLICY "auth view product external refs"
  ON public.product_external_refs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins manage product external refs" ON public.product_external_refs;
CREATE POLICY "admins manage product external refs"
  ON public.product_external_refs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_product_external_refs_updated_at ON public.product_external_refs;
CREATE TRIGGER trg_product_external_refs_updated_at
  BEFORE UPDATE ON public.product_external_refs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();