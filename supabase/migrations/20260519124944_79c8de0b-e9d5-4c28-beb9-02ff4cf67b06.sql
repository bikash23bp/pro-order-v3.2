
ALTER PUBLICATION supabase_realtime DROP TABLE public.staff_activity_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.staff_sessions;
DROP TABLE IF EXISTS public.staff_activity_logs;
DROP TABLE IF EXISTS public.staff_sessions;
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS live_monitoring_enabled;
