
CREATE OR REPLACE FUNCTION public.get_repeat_phones_v2()
RETURNS TABLE(phone_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_phones AS (
    SELECT right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 8) AS k
      FROM public.orders WHERE customer_phone IS NOT NULL
    UNION ALL
    SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 8)
      FROM public.imported_customers WHERE phone IS NOT NULL
    UNION ALL
    SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 8)
      FROM public.membership_customers WHERE phone IS NOT NULL
  ),
  order_counts AS (
    SELECT right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 8) AS k, count(*) AS c
      FROM public.orders WHERE customer_phone IS NOT NULL
      GROUP BY 1
  )
  SELECT DISTINCT k FROM (
    SELECT k FROM order_counts WHERE c >= 2 AND length(k) >= 7
    UNION
    SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 8) AS k
      FROM public.imported_customers WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 7
    UNION
    SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 8) AS k
      FROM public.membership_customers WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 7
  ) u WHERE length(k) >= 7;
$$;

GRANT EXECUTE ON FUNCTION public.get_repeat_phones_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_duplicate_active_phones_v2()
RETURNS TABLE(phone_key text, phone_normalized text, customer_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (
    SELECT
      right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 8) AS k,
      phone_normalized,
      lower(trim(customer_email)) AS email
    FROM public.orders
    WHERE status IN ('pending_web','pending','ready_order','processing','ready_to_ship','shipped','no_response','hold','fraud','incomplete')
  ),
  dup_phone_keys AS (
    SELECT k FROM active WHERE k IS NOT NULL AND length(k) >= 7 GROUP BY k HAVING count(*) >= 2
  ),
  dup_emails AS (
    SELECT email FROM active WHERE email IS NOT NULL AND email <> '' GROUP BY email HAVING count(*) >= 2
  )
  SELECT a.k, a.phone_normalized, a.email
    FROM active a
   WHERE a.k IN (SELECT k FROM dup_phone_keys)
      OR a.email IN (SELECT email FROM dup_emails);
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_v2() TO authenticated;
