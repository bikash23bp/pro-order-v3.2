-- =============================================================
-- Audit project performance indexes for high-volume orders/telesales/reviews
-- Safe to run multiple times.
-- =============================================================

-- Telesales exact tab counts + newest-first paging
CREATE INDEX IF NOT EXISTS idx_telesales_assignments_updated_at
  ON public.telesales_assignments (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_assigned_updated_at
  ON public.telesales_assignments (assigned_to, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_assigned_action
  ON public.telesales_assignments (assigned_to, last_action)
  WHERE last_action IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_assigned_order
  ON public.telesales_assignments (assigned_to, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_status_action
  ON public.telesales_assignments (status, last_action);

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_customer_id
  ON public.telesales_assignments (customer_id);

-- Telesales search join target
CREATE INDEX IF NOT EXISTS idx_imported_customers_phone
  ON public.imported_customers (phone);

-- Review badges/log lookups
CREATE INDEX IF NOT EXISTS idx_customer_reviews_phone_created_at
  ON public.customer_reviews (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_reviews_order_created_at
  ON public.customer_reviews (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;

-- Order page common filters + newest-first paging
CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized
  ON public.orders (phone_normalized);

CREATE INDEX IF NOT EXISTS idx_orders_order_source_created_at
  ON public.orders (order_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_site_created_at
  ON public.orders (source_site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_courier_created_at
  ON public.orders (courier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_oms_sender_created_at
  ON public.orders (oms_sender_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_forwarded_created_at
  ON public.orders (forwarded_to_partner_at, created_at DESC)
  WHERE forwarded_to_partner_at IS NOT NULL;

ANALYZE public.telesales_assignments;
ANALYZE public.imported_customers;
ANALYZE public.customer_reviews;
ANALYZE public.orders;