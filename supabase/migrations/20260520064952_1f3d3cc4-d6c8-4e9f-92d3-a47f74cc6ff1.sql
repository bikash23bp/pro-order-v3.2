
-- Expense overview: last 30 days totals + per-day series, plus today and lifetime totals.
CREATE OR REPLACE FUNCTION public.get_expense_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_from  date := v_today - INTERVAL '29 days';
  v_total_spend numeric := 0;
  v_today_spend numeric := 0;
  v_total_revenue numeric := 0;
  v_today_revenue numeric := 0;
  v_daily jsonb;
BEGIN
  SELECT COALESCE(SUM(spend_bdt),0) INTO v_total_spend FROM meta_ad_expenses;
  SELECT COALESCE(SUM(spend_bdt),0) INTO v_today_spend FROM meta_ad_expenses WHERE expense_date = v_today;
  SELECT COALESCE(SUM(total_amount),0) INTO v_total_revenue FROM orders;
  SELECT COALESCE(SUM(total_amount),0) INTO v_today_revenue FROM orders WHERE created_at >= v_today::timestamp;

  WITH days AS (
    SELECT generate_series(v_from, v_today, INTERVAL '1 day')::date AS d
  ),
  sp AS (
    SELECT expense_date AS d, SUM(spend_bdt) AS spend
    FROM meta_ad_expenses WHERE expense_date >= v_from GROUP BY expense_date
  ),
  rv AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS d, SUM(total_amount) AS revenue
    FROM orders WHERE created_at >= v_from::timestamp GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d,'YYYY-MM-DD'),
    'spend', COALESCE(sp.spend,0),
    'revenue', COALESCE(rv.revenue,0)
  ) ORDER BY days.d) INTO v_daily
  FROM days LEFT JOIN sp ON sp.d = days.d LEFT JOIN rv ON rv.d = days.d;

  RETURN jsonb_build_object(
    'todaySpendBdt', v_today_spend,
    'totalSpendBdt', v_total_spend,
    'todayRevenue',  v_today_revenue,
    'totalRevenue',  v_total_revenue,
    'netProfit',     v_total_revenue - v_total_spend,
    'roi',           CASE WHEN v_total_spend > 0 THEN ((v_total_revenue - v_total_spend) / v_total_spend) * 100 ELSE 0 END,
    'daily',         COALESCE(v_daily,'[]'::jsonb)
  );
END;
$$;

-- P&L: daily + monthly aggregates within a date range.
CREATE OR REPLACE FUNCTION public.get_profit_loss(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily jsonb;
  v_monthly jsonb;
  v_revenue numeric := 0;
  v_spend numeric := 0;
BEGIN
  WITH sp AS (
    SELECT expense_date AS d, SUM(spend_bdt) AS spend
    FROM meta_ad_expenses
    WHERE expense_date BETWEEN p_from AND p_to
    GROUP BY expense_date
  ),
  rv AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS d, SUM(total_amount) AS revenue
    FROM orders
    WHERE created_at >= p_from::timestamp AND created_at < (p_to + INTERVAL '1 day')::timestamp
    GROUP BY 1
  ),
  merged AS (
    SELECT COALESCE(sp.d, rv.d) AS d,
           COALESCE(sp.spend,0) AS spend,
           COALESCE(rv.revenue,0) AS revenue
    FROM sp FULL OUTER JOIN rv ON sp.d = rv.d
  )
  SELECT jsonb_agg(jsonb_build_object(
           'date', to_char(d,'YYYY-MM-DD'),
           'spend', spend,
           'revenue', revenue,
           'profit', revenue - spend
         ) ORDER BY d),
         COALESCE(SUM(revenue),0),
         COALESCE(SUM(spend),0)
    INTO v_daily, v_revenue, v_spend
  FROM merged;

  WITH m AS (
    SELECT to_char(d::date,'YYYY-MM') AS month,
           SUM(spend) AS spend, SUM(revenue) AS revenue
    FROM jsonb_to_recordset(COALESCE(v_daily,'[]'::jsonb)) AS x(date text, spend numeric, revenue numeric, profit numeric)
    CROSS JOIN LATERAL (SELECT x.date::date AS d, x.spend, x.revenue) y
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', month, 'spend', spend, 'revenue', revenue, 'profit', revenue - spend
  ) ORDER BY month) INTO v_monthly FROM m;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'spend', v_spend,
    'netProfit', v_revenue - v_spend,
    'roi', CASE WHEN v_spend > 0 THEN ((v_revenue - v_spend)/v_spend)*100 ELSE 0 END,
    'daily', COALESCE(v_daily,'[]'::jsonb),
    'monthly', COALESCE(v_monthly,'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_expense_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_profit_loss(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profit_loss(date, date) TO authenticated;
