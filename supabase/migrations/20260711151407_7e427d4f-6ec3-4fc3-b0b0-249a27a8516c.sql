
-- 0) Drop dependent policy on order_status_counts first
DROP POLICY IF EXISTS "Users with all order access can view order status counts" ON public.order_status_counts;

-- Replace with simple: authenticated can read counts
CREATE POLICY "Authenticated can view order status counts"
  ON public.order_status_counts FOR SELECT
  TO authenticated
  USING (true);

-- 1) Drop old RLS policies on orders that call can_view_all_orders
DROP POLICY IF EXISTS "Orders read scoped to owner or admin" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders based on permission" ON public.orders;
DROP POLICY IF EXISTS "Users view orders by permission" ON public.orders;

-- 2) Simple fast policy
CREATE POLICY "Authenticated can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

-- 3) Drop function + column (CASCADE any leftover deps)
DROP FUNCTION IF EXISTS public.can_view_all_orders(uuid) CASCADE;
ALTER TABLE public.user_permissions DROP COLUMN IF EXISTS can_view_all_orders CASCADE;

-- 4) Drop duplicate indexes on orders
DROP INDEX IF EXISTS public.idx_orders_status_created_at;
DROP INDEX IF EXISTS public.orders_source_status_idx;
DROP INDEX IF EXISTS public.idx_orders_order_number;
DROP INDEX IF EXISTS public.idx_orders_order_source_id;
DROP INDEX IF EXISTS public.idx_orders_courier_id;
DROP INDEX IF EXISTS public.idx_orders_source_site;
DROP INDEX IF EXISTS public.idx_orders_phone_normalized;
DROP INDEX IF EXISTS public.orders_external_order_id_key;
DROP INDEX IF EXISTS public.uniq_orders_invoice_number;
DROP INDEX IF EXISTS public.idx_orders_order_source_created_at;
DROP INDEX IF EXISTS public.idx_orders_site_created_at;
DROP INDEX IF EXISTS public.idx_orders_courier_created_at;
DROP INDEX IF EXISTS public.idx_orders_oms_sender_created_at;
DROP INDEX IF EXISTS public.idx_orders_customer_email_status;
DROP INDEX IF EXISTS public.idx_orders_woo_site_phone_source_status;

-- 5) Index for user_site_access.user_id
CREATE INDEX IF NOT EXISTS idx_user_site_access_user_id
  ON public.user_site_access(user_id);

-- 6) Reload schema cache
NOTIFY pgrst, 'reload schema';
