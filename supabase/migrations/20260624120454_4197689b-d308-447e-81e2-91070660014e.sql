-- Make order_number allocation atomic and self-healing.
-- This prevents stale/restored sequences from causing
-- duplicate key errors on orders_order_number_key.

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
  -- Serialize order-number allocation so concurrent inserts cannot race.
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
  -- Keep manually supplied unique order numbers untouched.
  IF NEW.order_number IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.orders WHERE order_number = NEW.order_number
     ) THEN
    RETURN NEW;
  END IF;

  -- Missing or already-used order number: allocate the next safe value.
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