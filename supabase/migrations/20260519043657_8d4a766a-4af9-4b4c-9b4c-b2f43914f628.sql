
CREATE TABLE public.blocked_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text,
  ip_address inet,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 500),
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone_normalized IS NOT NULL OR ip_address IS NOT NULL)
);

CREATE UNIQUE INDEX blocked_customers_phone_uniq ON public.blocked_customers (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE UNIQUE INDEX blocked_customers_ip_uniq ON public.blocked_customers (ip_address) WHERE ip_address IS NOT NULL;

ALTER TABLE public.blocked_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view blocked_customers" ON public.blocked_customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage blocked_customers" ON public.blocked_customers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff with manage_orders can insert blocked_customers" ON public.blocked_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_manage_orders = true)
  );

CREATE POLICY "staff with manage_orders can delete blocked_customers" ON public.blocked_customers
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = auth.uid() AND up.can_manage_orders = true)
  );

CREATE TRIGGER trg_blocked_customers_updated_at
  BEFORE UPDATE ON public.blocked_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 11), '');
$$;

CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone text)
RETURNS TABLE(blocked boolean, reason text, blocked_by uuid, blocked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, b.reason, b.blocked_by, b.created_at
  FROM public.blocked_customers b
  WHERE b.phone_normalized IS NOT NULL
    AND b.phone_normalized = public.normalize_phone(p_phone)
  LIMIT 1;
$$;
