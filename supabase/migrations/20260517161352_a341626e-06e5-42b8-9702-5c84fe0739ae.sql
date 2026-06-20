ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_order_template_desktop text NOT NULL DEFAULT 'card-premium',
  ADD COLUMN IF NOT EXISTS default_order_template_mobile  text NOT NULL DEFAULT 'mobile-stack';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS order_template_desktop text,
  ADD COLUMN IF NOT EXISTS order_template_mobile  text;