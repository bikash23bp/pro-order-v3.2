-- Sentinel UUID for system/automated actions
-- 00000000-0000-0000-0000-000000000000 represents "system"

-- 1) Backfill existing NULL changed_by rows to the system sentinel
UPDATE public.order_history
   SET changed_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE changed_by IS NULL;

-- 2) Update trigger function to fall back to system sentinel instead of NULL
CREATE OR REPLACE FUNCTION public.orders_log_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_system CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  v_actor uuid := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by, v_system);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_history(order_id, changed_by, event_type, to_value)
    VALUES (NEW.id, v_actor, 'created', NEW.status::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.order_history(order_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'status_changed', OLD.status::text, NEW.status::text);
    END IF;
    IF COALESCE(NEW.invoice_note,'') IS DISTINCT FROM COALESCE(OLD.invoice_note,'') THEN
      INSERT INTO public.order_history(order_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'invoice_note_changed', LEFT(COALESCE(OLD.invoice_note,''), 500), LEFT(COALESCE(NEW.invoice_note,''), 500));
    END IF;
    IF COALESCE(NEW.internal_note,'') IS DISTINCT FROM COALESCE(OLD.internal_note,'') THEN
      INSERT INTO public.order_history(order_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'internal_note_changed', LEFT(COALESCE(OLD.internal_note,''), 500), LEFT(COALESCE(NEW.internal_note,''), 500));
    END IF;
    IF (NEW.customer_name IS DISTINCT FROM OLD.customer_name)
       OR (NEW.customer_phone IS DISTINCT FROM OLD.customer_phone)
       OR (NEW.customer_address IS DISTINCT FROM OLD.customer_address)
       OR (NEW.total_amount IS DISTINCT FROM OLD.total_amount) THEN
      INSERT INTO public.order_history(order_id, changed_by, event_type, to_value)
      VALUES (NEW.id, v_actor, 'edited', NULL);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- 3) Enforce NOT NULL with system default going forward
ALTER TABLE public.order_history
  ALTER COLUMN changed_by SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  ALTER COLUMN changed_by SET NOT NULL;
