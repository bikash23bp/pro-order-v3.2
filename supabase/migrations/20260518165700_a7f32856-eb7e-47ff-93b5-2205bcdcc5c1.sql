ALTER TABLE public.expense_rules
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS per_order_pct numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expense_rules_assigned_user ON public.expense_rules(assigned_user_id);