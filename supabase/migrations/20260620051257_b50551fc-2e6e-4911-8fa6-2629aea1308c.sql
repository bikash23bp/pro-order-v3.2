CREATE INDEX IF NOT EXISTS idx_orders_phone_created_at_desc
  ON public.orders (phone_normalized, created_at DESC)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_email_status
  ON public.orders (lower(btrim(customer_email)), status)
  WHERE customer_email IS NOT NULL AND btrim(customer_email) <> '';

CREATE INDEX IF NOT EXISTS idx_orders_shipped_consignment_updated
  ON public.orders (updated_at DESC, id)
  WHERE status = 'shipped' AND consignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_external_source_site_order
  ON public.orders (source, source_site_id, external_order_id)
  WHERE external_order_id IS NOT NULL;