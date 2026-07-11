
-- 1. Audit log table for Clear Assignments actions
CREATE TABLE public.telesales_clear_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_staff uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL = all
  deleted_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telesales_clear_audit TO authenticated;
GRANT ALL ON public.telesales_clear_audit TO service_role;

ALTER TABLE public.telesales_clear_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view clear audit"
  ON public.telesales_clear_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'business_owner'::app_role));

CREATE INDEX telesales_clear_audit_created_at_idx ON public.telesales_clear_audit(created_at DESC);

-- 2. Update clear function to record audit row
CREATE OR REPLACE FUNCTION public.clear_telesales_assignments(_staff uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.telesales_clear_audit (cleared_by, target_staff, deleted_count)
  VALUES (auth.uid(), _staff, n);
  RETURN n;
END; $function$;
