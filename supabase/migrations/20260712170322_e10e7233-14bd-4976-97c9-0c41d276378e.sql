CREATE TABLE public.courier_sync_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
  provider TEXT,
  consignment_id TEXT,
  delivery_status TEXT,
  old_status TEXT,
  new_status TEXT,
  old_courier_status TEXT,
  new_courier_status TEXT,
  changed BOOLEAN NOT NULL DEFAULT false,
  ok BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_courier_sync_audit_order_created ON public.courier_sync_audit(order_id, created_at DESC);
CREATE INDEX idx_courier_sync_audit_created ON public.courier_sync_audit(created_at DESC);

GRANT SELECT ON public.courier_sync_audit TO authenticated;
GRANT ALL ON public.courier_sync_audit TO service_role;

ALTER TABLE public.courier_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view courier sync audit"
  ON public.courier_sync_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));