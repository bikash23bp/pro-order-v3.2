ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS forwarded_to_partner_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_forwarded_to_partner_at
  ON public.orders (forwarded_to_partner_at DESC)
  WHERE forwarded_to_partner_at IS NOT NULL;

UPDATE public.orders o
SET forwarded_to_partner_at = sub.first_success_at
FROM (
  SELECT order_id, MIN(created_at) AS first_success_at
  FROM public.oms_forward_logs
  WHERE direction = 'outbound' AND status = 'success' AND order_id IS NOT NULL
  GROUP BY order_id
) sub
WHERE o.id = sub.order_id AND o.forwarded_to_partner_at IS NULL;