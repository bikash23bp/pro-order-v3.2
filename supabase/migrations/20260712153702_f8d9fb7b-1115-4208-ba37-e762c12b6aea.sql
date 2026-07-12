CREATE INDEX IF NOT EXISTS idx_orders_phone_normalized_created_at
  ON public.orders (phone_normalized, created_at DESC)
  WHERE phone_normalized IS NOT NULL;

NOTIFY pgrst, 'reload schema';