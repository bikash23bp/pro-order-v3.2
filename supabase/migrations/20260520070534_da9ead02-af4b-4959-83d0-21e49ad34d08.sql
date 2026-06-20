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
           'date', to_char(merged.d,'YYYY-MM-DD'),
           'spend', merged.spend,
           'revenue', merged.revenue,
           'profit', merged.revenue - merged.spend
         ) ORDER BY merged.d),
         COALESCE(SUM(merged.revenue),0),
         COALESCE(SUM(merged.spend),0)
    INTO v_daily, v_revenue, v_spend
  FROM merged;

  WITH x AS (
    SELECT (rec->>'date')::date AS d,
           (rec->>'spend')::numeric AS spend,
           (rec->>'revenue')::numeric AS revenue
    FROM jsonb_array_elements(COALESCE(v_daily,'[]'::jsonb)) AS rec
  ),
  m AS (
    SELECT to_char(x.d,'YYYY-MM') AS month,
           SUM(x.spend) AS spend,
           SUM(x.revenue) AS revenue
    FROM x
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', m.month, 'spend', m.spend, 'revenue', m.revenue, 'profit', m.revenue - m.spend
  ) ORDER BY m.month) INTO v_monthly FROM m;

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