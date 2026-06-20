-- whatsapp_settings singleton
CREATE TABLE public.whatsapp_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  api_url text,
  api_token text,
  phone_number_id text,
  sender_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_settings_singleton CHECK (id = true)
);
INSERT INTO public.whatsapp_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage whatsapp_settings" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "auth view whatsapp_settings" ON public.whatsapp_settings
  FOR SELECT TO authenticated USING (true);

-- message_templates
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms')),
  name text NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_templates_channel_idx ON public.message_templates(channel);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view message_templates" ON public.message_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth create message_templates" ON public.message_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owners update message_templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "owners delete message_templates" ON public.message_templates
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER message_templates_set_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- whatsapp_logs
CREATE TABLE public.whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  customer_name text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  error text,
  batch_id uuid,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_logs_batch_idx ON public.whatsapp_logs(batch_id);
CREATE INDEX whatsapp_logs_created_idx ON public.whatsapp_logs(created_at DESC);
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view whatsapp_logs" ON public.whatsapp_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert whatsapp_logs" ON public.whatsapp_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);