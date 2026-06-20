ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS return_delivery_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_packing_cost numeric NOT NULL DEFAULT 0;