CREATE OR REPLACE FUNCTION public.validate_advance_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.advance_amount, 0) <= 0 THEN
    NEW.advance_source_id := NULL;
    NEW.advance_txn_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;