
CREATE TYPE public.expense_frequency AS ENUM ('one_time','daily','weekly','monthly','yearly','per_order');

CREATE TABLE public.expense_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  amount numeric NOT NULL DEFAULT 0,
  frequency public.expense_frequency NOT NULL DEFAULT 'monthly',
  per_order_amount numeric NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  start_date date NOT NULL DEFAULT (now())::date,
  end_date date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view expense_rules" ON public.expense_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage expense_rules" ON public.expense_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_expense_rules_updated_at
  BEFORE UPDATE ON public.expense_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
