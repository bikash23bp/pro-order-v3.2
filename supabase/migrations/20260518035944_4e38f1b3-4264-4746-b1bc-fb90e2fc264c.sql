ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_tele_template_desktop text NOT NULL DEFAULT 'tele-table-classic',
  ADD COLUMN IF NOT EXISTS default_tele_template_mobile text NOT NULL DEFAULT 'tele-mobile-stack';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tele_template_desktop text,
  ADD COLUMN IF NOT EXISTS tele_template_mobile text;