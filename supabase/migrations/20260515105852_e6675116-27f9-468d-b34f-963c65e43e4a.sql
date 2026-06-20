
-- App-wide settings (singleton)
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  vip_spend_threshold numeric NOT NULL DEFAULT 10000,
  vip_order_threshold integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view app_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage app_settings" ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- SMS settings (singleton)
CREATE TABLE public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  api_url text,
  api_key text,
  sender_id text,
  enabled boolean NOT NULL DEFAULT false,
  template_confirmed text NOT NULL DEFAULT 'Hi {{name}}, your order #{{order_id}} is confirmed. Thank you for shopping with us!',
  template_shipped text NOT NULL DEFAULT 'Hi {{name}}, your order #{{order_id}} has been handed over to courier. Thank you!',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sms_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage sms_settings" ON public.sms_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- SMS logs
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  error text,
  sent_by uuid,
  trigger text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sms_logs" ON public.sms_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert sms_logs" ON public.sms_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_sms_logs_created ON public.sms_logs (created_at DESC);
CREATE INDEX idx_sms_logs_order ON public.sms_logs (order_id);

-- Customer stats view (aggregated by phone)
CREATE OR REPLACE VIEW public.customer_stats
WITH (security_invoker = on) AS
SELECT
  btrim(customer_phone) AS phone,
  (array_agg(customer_name ORDER BY created_at DESC))[1] AS name,
  (array_agg(customer_email ORDER BY created_at DESC))[1] AS email,
  (array_agg(customer_address ORDER BY created_at DESC))[1] AS address,
  COUNT(*)::int AS total_orders,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_orders,
  COUNT(*) FILTER (WHERE status IN ('cancelled','returned'))::int AS cancelled_orders,
  COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('cancelled','returned')), 0) AS total_spent,
  MAX(created_at) AS last_order_at,
  MIN(created_at) AS first_order_at
FROM public.orders
WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
GROUP BY btrim(customer_phone);
