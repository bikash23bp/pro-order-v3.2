ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.tasks_log_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(task_id, changed_by, event_type, to_value)
    VALUES (NEW.id, COALESCE(v_actor, NEW.assigned_by), 'created', NEW.status::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.task_history(task_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'status_changed', OLD.status::text, NEW.status::text);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.task_history(task_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'reassigned', OLD.assigned_to::text, NEW.assigned_to::text);
    END IF;
    IF COALESCE(NEW.notes,'') IS DISTINCT FROM COALESCE(OLD.notes,'') THEN
      INSERT INTO public.task_history(task_id, changed_by, event_type, from_value, to_value)
      VALUES (NEW.id, v_actor, 'note_updated', LEFT(COALESCE(OLD.notes,''), 200), LEFT(COALESCE(NEW.notes,''), 200));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;