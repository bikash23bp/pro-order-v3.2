CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm ON public.orders USING gin (customer_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm ON public.orders USING gin (customer_phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized_trgm ON public.orders USING gin (phone_normalized extensions.gin_trgm_ops) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_trgm ON public.orders USING gin (customer_email extensions.gin_trgm_ops) WHERE customer_email IS NOT NULL;

ANALYZE public.orders;