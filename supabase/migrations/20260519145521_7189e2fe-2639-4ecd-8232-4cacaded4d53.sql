
ALTER TABLE public.sms_settings
  ADD COLUMN IF NOT EXISTS enabled_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enabled_shipped boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enabled_web_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_web_order text NOT NULL DEFAULT 'Hi {{name}}, we received your order #{{order_id}}. We will confirm shortly. Thank you!',
  ADD COLUMN IF NOT EXISTS template_single_default text NOT NULL DEFAULT 'Hi {{name}}, thank you for shopping with us.',
  ADD COLUMN IF NOT EXISTS template_bulk_default text NOT NULL DEFAULT 'Hi {{name}}, special offer just for you!';
