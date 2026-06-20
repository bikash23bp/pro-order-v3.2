-- Index to speed up date-based queries and cleanup
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs (created_at);

-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function: delete sms_logs older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_sms_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.sms_logs
  WHERE created_at < now() - INTERVAL '90 days';
$$;

-- Unschedule existing job if present (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-sms-logs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule nightly cleanup at 02:30 UTC
SELECT cron.schedule(
  'cleanup-old-sms-logs',
  '30 2 * * *',
  $$SELECT public.cleanup_old_sms_logs();$$
);
