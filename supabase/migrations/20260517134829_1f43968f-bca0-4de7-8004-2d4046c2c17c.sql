-- Task status enum
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('pending', 'on_hold', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  status public.task_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "admins manage tasks" ON public.tasks;
CREATE POLICY "admins manage tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "users view own tasks" ON public.tasks;
CREATE POLICY "users view own tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid());

DROP POLICY IF EXISTS "users create tasks" ON public.tasks;
CREATE POLICY "users create tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid());

DROP POLICY IF EXISTS "assignee update own tasks" ON public.tasks;
CREATE POLICY "assignee update own tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid())
  WITH CHECK (assigned_to = auth.uid() OR assigned_by = auth.uid());

-- Trigger: maintain updated_at + completed_at
CREATE OR REPLACE FUNCTION public.tasks_set_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_timestamps ON public.tasks;
CREATE TRIGGER tasks_set_timestamps
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_set_timestamps();

-- Enable realtime
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;