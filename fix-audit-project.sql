-- Run this ONCE on the AUDIT project (aecaylmfhggcmekzuwcu) SQL Editor.

-- 1) Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2) Table & sequence privileges (RLS still enforces row-level rules)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES                ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT                 ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES                ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3) Future tables get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- 4) Super-admin email fallback inside has_role (matches main project)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = (SELECT auth.uid())
    AND lower(auth.jwt() ->> 'email') = 'bikash23bp@gmail.com'
    AND _role IN ('admin', 'business_owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 5) Fix duplicate order number errors on the audit project.
--    Run this if order creation shows:
--    duplicate key value violates unique constraint "orders_order_number_key"
CREATE OR REPLACE FUNCTION public.next_unique_order_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next integer;
  v_max integer;
  v_attempts integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.orders_order_number_seq'));

  SELECT COALESCE(MAX(order_number), 0) INTO v_max FROM public.orders;
  PERFORM setval('public.orders_order_number_seq', v_max + 1, false);

  LOOP
    v_next := nextval('public.orders_order_number_seq')::integer;
    v_attempts := v_attempts + 1;

    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_next) THEN
      RETURN v_next;
    END IF;

    IF v_attempts > 1000 THEN
      RAISE EXCEPTION 'Could not allocate a unique order number' USING ERRCODE = '23505';
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT public.next_unique_order_number();

CREATE OR REPLACE FUNCTION public.assign_unique_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.orders WHERE order_number = NEW.order_number
     ) THEN
    RETURN NEW;
  END IF;

  NEW.order_number := public.next_unique_order_number();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_unique_order_number ON public.orders;
CREATE TRIGGER trg_assign_unique_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_unique_order_number();

SELECT setval(
  'public.orders_order_number_seq',
  COALESCE((SELECT MAX(order_number) FROM public.orders), 0) + 1,
  false
);

REVOKE ALL ON FUNCTION public.next_unique_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_unique_order_number() FROM anon;
REVOKE ALL ON FUNCTION public.next_unique_order_number() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_unique_order_number() TO service_role;

REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM anon;
REVOKE ALL ON FUNCTION public.assign_unique_order_number() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_unique_order_number() TO service_role;
