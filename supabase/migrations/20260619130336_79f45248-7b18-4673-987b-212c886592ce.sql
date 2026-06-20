-- 1) Per-partner default courier on inbound settings
ALTER TABLE public.oms_inbound_settings
  ADD COLUMN IF NOT EXISTS default_courier_id uuid NULL REFERENCES public.couriers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oms_inbound_default_courier
  ON public.oms_inbound_settings(default_courier_id);

-- 2) Helpful indexes for the new Orders filters (OMS sender + staff)
CREATE INDEX IF NOT EXISTS idx_orders_oms_sender_name
  ON public.orders(oms_sender_name)
  WHERE oms_sender_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by
  ON public.orders(created_by)
  WHERE created_by IS NOT NULL;