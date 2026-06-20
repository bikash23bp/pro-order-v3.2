-- 1) Column on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_paid_marketing boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_orders_is_paid_marketing
  ON public.orders (is_paid_marketing);

-- 2) Update get_profit_loss to expose paid vs organic breakdown
CREATE OR REPLACE FUNCTION public.get_profit_loss(p_from text, p_to text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := p_from::timestamptz;
  v_to   timestamptz := p_to::timestamptz;
  v_from_date date := v_from::date;
  v_to_date   date := v_to::date;
  v_revenue_total   numeric := 0;
  v_revenue_paid    numeric := 0;
  v_revenue_organic numeric := 0;
  v_orders_paid     integer := 0;
  v_orders_organic  integer := 0;
  v_spend_bdt   numeric := 0;
  v_daily       jsonb;
  v_monthly     jsonb;
BEGIN
  -- Revenue split paid vs organic (revenue statuses only)
  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE is_paid_marketing), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE NOT is_paid_marketing), 0),
    COALESCE(COUNT(*) FILTER (WHERE is_paid_marketing), 0),
    COALESCE(COUNT(*) FILTER (WHERE NOT is_paid_marketing), 0)
  INTO v_revenue_total, v_revenue_paid, v_revenue_organic, v_orders_paid, v_orders_organic
  FROM public.orders
  WHERE created_at >= v_from
    AND created_at <= v_to
    AND status IN ('processing','ready_to_ship','shipped','completed');

  -- Ad spend
  SELECT COALESCE(SUM(spend_bdt), 0)
    INTO v_spend_bdt
  FROM public.meta_ad_expenses
  WHERE expense_date >= v_from_date AND expense_date <= v_to_date;

  -- Daily series: revenue (paid + organic), spend
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.date), '[]'::jsonb)
    INTO v_daily
  FROM (
    SELECT day::date::text AS date,
           COALESCE(rev.revenue, 0)         AS revenue,
           COALESCE(rev.paid_revenue, 0)    AS paid_revenue,
           COALESCE(rev.organic_revenue, 0) AS organic_revenue,
           COALESCE(sp.spend, 0)            AS spend,
           COALESCE(rev.revenue, 0) - COALESCE(sp.spend, 0)        AS profit,
           COALESCE(rev.paid_revenue, 0) - COALESCE(sp.spend, 0)   AS paid_profit
    FROM generate_series(v_from_date, v_to_date, '1 day') AS day
    LEFT JOIN (
      SELECT created_at::date AS d,
             SUM(total_amount) AS revenue,
             SUM(total_amount) FILTER (WHERE is_paid_marketing) AS paid_revenue,
             SUM(total_amount) FILTER (WHERE NOT is_paid_marketing) AS organic_revenue
      FROM public.orders
      WHERE created_at >= v_from AND created_at <= v_to
        AND status IN ('processing','ready_to_ship','shipped','completed')
      GROUP BY 1
    ) rev ON rev.d = day::date
    LEFT JOIN (
      SELECT expense_date AS d, SUM(spend_bdt) AS spend
      FROM public.meta_ad_expenses
      WHERE expense_date >= v_from_date AND expense_date <= v_to_date
      GROUP BY 1
    ) sp ON sp.d = day::date
  ) d;

  -- Monthly aggregate
  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb)
    INTO v_monthly
  FROM (
    SELECT to_char(day, 'YYYY-MM') AS month,
           SUM(revenue)::numeric          AS revenue,
           SUM(paid_revenue)::numeric     AS paid_revenue,
           SUM(organic_revenue)::numeric  AS organic_revenue,
           SUM(spend)::numeric            AS spend,
           SUM(revenue - spend)::numeric  AS profit,
           SUM(paid_revenue - spend)::numeric AS paid_profit
    FROM (
      SELECT day,
             COALESCE(rev.revenue, 0) AS revenue,
             COALESCE(rev.paid_revenue, 0) AS paid_revenue,
             COALESCE(rev.organic_revenue, 0) AS organic_revenue,
             COALESCE(sp.spend, 0) AS spend
      FROM generate_series(v_from_date, v_to_date, '1 day') AS day
      LEFT JOIN (
        SELECT created_at::date AS d,
               SUM(total_amount) AS revenue,
               SUM(total_amount) FILTER (WHERE is_paid_marketing) AS paid_revenue,
               SUM(total_amount) FILTER (WHERE NOT is_paid_marketing) AS organic_revenue
        FROM public.orders
        WHERE created_at >= v_from AND created_at <= v_to
          AND status IN ('processing','ready_to_ship','shipped','completed')
        GROUP BY 1
      ) rev ON rev.d = day::date
      LEFT JOIN (
        SELECT expense_date AS d, SUM(spend_bdt) AS spend
        FROM public.meta_ad_expenses
        WHERE expense_date >= v_from_date AND expense_date <= v_to_date
        GROUP BY 1
      ) sp ON sp.d = day::date
    ) base
    GROUP BY to_char(day, 'YYYY-MM')
  ) m;

  RETURN jsonb_build_object(
    'revenue',          v_revenue_total,
    'paidRevenue',      v_revenue_paid,
    'organicRevenue',   v_revenue_organic,
    'paidOrders',       v_orders_paid,
    'organicOrders',    v_orders_organic,
    'spend',            v_spend_bdt,
    'netProfit',        v_revenue_total - v_spend_bdt,
    'paidNetProfit',    v_revenue_paid  - v_spend_bdt,
    'roi',              CASE WHEN v_spend_bdt > 0 THEN ((v_revenue_total - v_spend_bdt) / v_spend_bdt) * 100 ELSE 0 END,
    'trueRoas',         CASE WHEN v_spend_bdt > 0 THEN (v_revenue_paid / v_spend_bdt) * 100 ELSE 0 END,
    'cpa',              CASE WHEN v_orders_paid > 0 THEN v_spend_bdt / v_orders_paid ELSE 0 END,
    'daily',            v_daily,
    'monthly',          v_monthly
  );
END;
$$;