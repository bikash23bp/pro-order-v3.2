ALTER TABLE public.wp_incomplete_sync_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wp_incomplete_sync_logs;