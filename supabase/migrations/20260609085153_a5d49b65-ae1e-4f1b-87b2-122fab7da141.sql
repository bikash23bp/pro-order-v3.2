ALTER TABLE public.telesales_assignments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_taken_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_telesales_assignments_order_id
  ON public.telesales_assignments(order_id);