CREATE OR REPLACE FUNCTION public.clear_telesales_assignments(_staff uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'business_owner'::app_role))
  THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _staff IS NULL THEN
    DELETE FROM public.telesales_assignments WHERE id IS NOT NULL;
  ELSE
    DELETE FROM public.telesales_assignments WHERE assigned_to = _staff;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;