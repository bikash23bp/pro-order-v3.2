CREATE OR REPLACE FUNCTION public.validate_advance_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.advance_amount, 0) <= 0 THEN
    NEW.advance_source_id := NULL;
    NEW.advance_txn_id := NULL;
  ELSIF TG_OP = 'INSERT' AND NEW.advance_source_id IS NULL THEN
    RAISE EXCEPTION 'Advance payment source is required when advance amount is greater than 0';
  END IF;
  RETURN NEW;
END;
$$;