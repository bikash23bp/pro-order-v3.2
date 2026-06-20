
CREATE OR REPLACE FUNCTION public.count_orders_by_phone(p_phone text, p_exclude_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.orders
  WHERE phone_normalized = NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 11), '')
    AND phone_normalized IS NOT NULL
    AND (p_exclude_id IS NULL OR id <> p_exclude_id);
$$;
