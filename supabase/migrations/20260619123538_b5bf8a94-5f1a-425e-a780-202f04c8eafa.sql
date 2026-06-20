
CREATE TABLE public.oms_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  api_token text NOT NULL,
  auto_forward boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_destinations TO authenticated;
GRANT ALL ON public.oms_destinations TO service_role;
ALTER TABLE public.oms_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oms_dest_admin_all" ON public.oms_destinations
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR public.has_role(auth.uid(), 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "oms_dest_authenticated_read" ON public.oms_destinations
  FOR SELECT TO authenticated
  USING (active = true);

CREATE TABLE public.oms_inbound_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name text NOT NULL,
  api_token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oms_inbound_settings TO authenticated;
GRANT ALL ON public.oms_inbound_settings TO service_role;
ALTER TABLE public.oms_inbound_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oms_inbound_admin_all" ON public.oms_inbound_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR public.has_role(auth.uid(), 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE TABLE public.oms_forward_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  destination_id uuid,
  destination_name text,
  direction text NOT NULL,
  status text NOT NULL,
  http_status integer,
  remote_order_no text,
  error_message text,
  payload_excerpt text,
  response_excerpt text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.oms_forward_logs TO authenticated;
GRANT ALL ON public.oms_forward_logs TO service_role;
ALTER TABLE public.oms_forward_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oms_logs_admin_read" ON public.oms_forward_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR public.has_role(auth.uid(), 'manager')
    OR created_by = auth.uid()
  );

CREATE POLICY "oms_logs_authenticated_insert" ON public.oms_forward_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS oms_sender_name text,
  ADD COLUMN IF NOT EXISTS oms_sender_order_no text;

CREATE TRIGGER trg_oms_destinations_updated_at
  BEFORE UPDATE ON public.oms_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_oms_inbound_settings_updated_at
  BEFORE UPDATE ON public.oms_inbound_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_manage_oms_endpoints boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_forward_orders boolean NOT NULL DEFAULT false;
