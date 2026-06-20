
CREATE TABLE public.order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  changed_by uuid,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_history_order_id ON public.order_history(order_id, created_at DESC);

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view order_history"
  ON public.order_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth insert order_history"
  ON public.order_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.orders_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
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
$$;

DROP TRIGGER IF EXISTS orders_log_history_trg ON public.orders;
CREATE TRIGGER orders_log_history_trg
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_log_history();
