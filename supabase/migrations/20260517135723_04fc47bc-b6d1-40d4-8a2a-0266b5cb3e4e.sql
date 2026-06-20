
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_history REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_history;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
