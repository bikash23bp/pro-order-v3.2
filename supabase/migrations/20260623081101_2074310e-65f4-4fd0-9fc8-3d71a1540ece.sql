ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS phone_key8 text
  GENERATED ALWAYS AS (NULLIF(right(regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 8), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_orders_active_phone_key8
  ON public.orders (phone_key8)
  WHERE status IN ('pending_web','pending','ready_order','processing','ready_to_ship','shipped','no_response','hold','fraud','incomplete')
    AND phone_key8 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_active_email_lower
  ON public.orders (lower(trim(customer_email)))
  WHERE status IN ('pending_web','pending','ready_order','processing','ready_to_ship','shipped','no_response','hold','fraud','incomplete')
    AND customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tab_counts_common
  ON public.orders (created_at DESC, status, source, preorder)
  INCLUDE (total_amount, order_source_id, source_site_id, courier_id, oms_sender_name, created_by, advance_amount);

CREATE INDEX IF NOT EXISTS idx_orders_preorder_due
  ON public.orders (preorder_date)
  WHERE preorder = true AND preorder_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_duplicate_active_phones_v2()
RETURNS TABLE(phone_key text, phone_normalized text, customer_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (
    SELECT
      phone_key8 AS k,
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
GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_v2() TO service_role;