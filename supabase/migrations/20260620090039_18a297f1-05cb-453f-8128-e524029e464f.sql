CREATE INDEX IF NOT EXISTS idx_orders_source_created_at_desc ON public.orders (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_preorder_created_at_desc ON public.orders (created_at DESC) WHERE preorder = true;
CREATE INDEX IF NOT EXISTS idx_orders_source_site_created_at_desc ON public.orders (source_site_id, created_at DESC) WHERE source_site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_courier_created_at_desc ON public.orders (courier_id, created_at DESC) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_by_created_at_desc ON public.orders (created_by, created_at DESC) WHERE created_by IS NOT NULL;
ANALYZE public.orders;
ANALYZE public.order_items;