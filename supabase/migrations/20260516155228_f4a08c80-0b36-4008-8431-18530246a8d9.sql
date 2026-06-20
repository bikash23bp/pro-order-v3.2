
-- Facebook settings (singleton)
CREATE TABLE public.facebook_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  access_token text,
  verify_token text,
  webhook_secret text,
  app_id text,
  app_secret text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.facebook_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage facebook_settings" ON public.facebook_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "auth view facebook_settings" ON public.facebook_settings
  FOR SELECT TO authenticated USING (true);

-- Connected Facebook pages
CREATE TABLE public.facebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL UNIQUE,
  page_name text NOT NULL,
  access_token text,
  status text NOT NULL DEFAULT 'active',
  token_status text NOT NULL DEFAULT 'valid',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage facebook_pages" ON public.facebook_pages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "auth view facebook_pages" ON public.facebook_pages
  FOR SELECT TO authenticated USING (true);

-- Webhook logs
CREATE TABLE public.facebook_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT 'unknown',
  page_id text,
  page_name text,
  payload jsonb,
  response jsonb,
  status text NOT NULL DEFAULT 'received',
  http_status integer,
  error text,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.facebook_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view facebook_webhook_logs" ON public.facebook_webhook_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert facebook_webhook_logs" ON public.facebook_webhook_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_fb_webhook_logs_created ON public.facebook_webhook_logs (created_at DESC);
CREATE INDEX idx_fb_webhook_logs_status ON public.facebook_webhook_logs (status);

-- updated_at triggers
CREATE TRIGGER trg_fb_settings_updated_at
  BEFORE UPDATE ON public.facebook_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fb_pages_updated_at
  BEFORE UPDATE ON public.facebook_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
