CREATE TABLE public.membership_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL UNIQUE,
  email text,
  address text,
  date_of_birth date,
  tier text NOT NULL DEFAULT 'standard',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view membership_customers" ON public.membership_customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth create membership_customers" ON public.membership_customers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth update membership_customers" ON public.membership_customers
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "admins delete membership_customers" ON public.membership_customers
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER membership_customers_set_updated_at
  BEFORE UPDATE ON public.membership_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_membership_customers_phone ON public.membership_customers(phone);