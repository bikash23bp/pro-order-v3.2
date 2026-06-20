CREATE TABLE public.oms_inbound_product_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.oms_inbound_settings(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (sender_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_inbound_product_access TO authenticated;
GRANT ALL ON public.oms_inbound_product_access TO service_role;

ALTER TABLE public.oms_inbound_product_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage oms inbound product access"
  ON public.oms_inbound_product_access
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'business_owner'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'business_owner'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE INDEX idx_oms_inbound_product_access_sender ON public.oms_inbound_product_access(sender_id);
CREATE INDEX idx_oms_inbound_product_access_product ON public.oms_inbound_product_access(product_id);