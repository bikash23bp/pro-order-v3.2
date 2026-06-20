ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preorder_date date;
CREATE INDEX IF NOT EXISTS idx_orders_preorder_date ON public.orders (preorder_date) WHERE preorder = true;