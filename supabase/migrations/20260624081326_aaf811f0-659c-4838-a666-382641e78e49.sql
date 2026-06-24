-- Keep the order number sequence ahead of all existing orders.
SELECT setval(
  'public.orders_order_number_seq',
  COALESCE((SELECT MAX(order_number) FROM public.orders), 0) + 1,
  false
);

-- Defensive trigger: if a restored/stale sequence ever proposes an already-used
-- order number, repair the sequence and assign the next unique value before the
-- unique constraint can fail.
CREATE OR REPLACE FUNCTION public.assign_unique_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
  v_max bigint;
  v_attempts integer := 0;
BEGIN
  IF NEW.order_number IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.orders WHERE order_number = NEW.order_number
     ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.orders_order_number_seq'));

  SELECT COALESCE(MAX(order_number), 0) INTO v_max FROM public.orders;
  PERFORM setval('public.orders_order_number_seq', v_max + 1, false);

  LOOP
    v_next := nextval('public.orders_order_number_seq');
    v_attempts := v_attempts + 1;

    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_next) THEN
      NEW.order_number := v_next;
      RETURN NEW;
    END IF;

    IF v_attempts > 1000 THEN
      RAISE EXCEPTION 'Could not allocate a unique order number' USING ERRCODE = '23505';
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_unique_order_number ON public.orders;
CREATE TRIGGER trg_assign_unique_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_unique_order_number();

-- Speed up the customer_stats view used by the customer list.
CREATE INDEX IF NOT EXISTS idx_orders_customer_stats_phone_created
ON public.orders ((btrim(customer_phone)), created_at DESC)
INCLUDE (customer_name, customer_email, customer_address, status, total_amount, customer_type)
WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> '';

ANALYZE public.orders;