ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_web';
CREATE INDEX IF NOT EXISTS orders_source_status_idx ON public.orders (source, status);