
CREATE OR REPLACE FUNCTION public.protect_inactivity_lock_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.inactivity_lock_enabled IS DISTINCT FROM OLD.inactivity_lock_enabled
      OR NEW.inactivity_lock_seconds IS DISTINCT FROM OLD.inactivity_lock_seconds)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = auth.uid() AND up.can_manage_inactivity_lock = true
     ) THEN
    NEW.inactivity_lock_enabled := OLD.inactivity_lock_enabled;
    NEW.inactivity_lock_seconds := OLD.inactivity_lock_seconds;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE POLICY "lock managers update inactivity fields on profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_permissions up
    WHERE up.user_id = (SELECT auth.uid()) AND up.can_manage_inactivity_lock = true
  ));
