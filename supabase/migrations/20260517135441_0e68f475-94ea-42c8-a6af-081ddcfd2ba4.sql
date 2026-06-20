
CREATE TABLE IF NOT EXISTS public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  changed_by uuid,
  event_type text NOT NULL CHECK (event_type IN ('created','status_changed','reassigned','updated')),
  from_value text,
  to_value text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id, created_at DESC);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view task_history for involved" ON public.task_history
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (t.assigned_to = auth.uid() OR t.assigned_by = auth.uid())
    )
  );

CREATE POLICY "insert task_history when involved" ON public.task_history
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (t.assigned_to = auth.uid() OR t.assigned_by = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.tasks_log_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_log_history ON public.tasks;
CREATE TRIGGER trg_tasks_log_history
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_log_history();

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_history;
