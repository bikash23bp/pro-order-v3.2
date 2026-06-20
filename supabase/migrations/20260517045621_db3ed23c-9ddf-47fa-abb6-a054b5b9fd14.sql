
CREATE TABLE public.meta_ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  app_id text NOT NULL,
  app_secret text NOT NULL,
  access_token text NOT NULL,
  ad_account_id text NOT NULL,
  usd_rate numeric NOT NULL DEFAULT 110,
  status text NOT NULL DEFAULT 'untested',
  active boolean NOT NULL DEFAULT true,
  account_currency text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage meta_ads_accounts"
  ON public.meta_ads_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER meta_ads_accounts_set_updated_at
  BEFORE UPDATE ON public.meta_ads_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meta_ad_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.meta_ads_accounts(id) ON DELETE CASCADE,
  campaign_id text,
  campaign_name text,
  spend_usd numeric NOT NULL DEFAULT 0,
  usd_rate numeric NOT NULL DEFAULT 110,
  spend_bdt numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, expense_date)
);

CREATE INDEX meta_ad_expenses_date_idx ON public.meta_ad_expenses (expense_date DESC);
CREATE INDEX meta_ad_expenses_account_idx ON public.meta_ad_expenses (account_id);

ALTER TABLE public.meta_ad_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view meta_ad_expenses"
  ON public.meta_ad_expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage meta_ad_expenses"
  ON public.meta_ad_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
