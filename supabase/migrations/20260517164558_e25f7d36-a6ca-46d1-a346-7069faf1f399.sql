ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS membership_discount_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS membership_discount_rate numeric NOT NULL DEFAULT 0.10;