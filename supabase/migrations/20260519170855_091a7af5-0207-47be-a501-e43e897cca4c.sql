-- Indexes for fast debugging queries
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_created_at
  ON public.facebook_webhook_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_page_event_created
  ON public.facebook_webhook_logs (page_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_status_created
  ON public.facebook_webhook_logs (status, created_at DESC);

-- Cleanup function: delete facebook_webhook_logs older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_facebook_webhook_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.facebook_webhook_logs
  WHERE created_at < now() - INTERVAL '30 days';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_facebook_webhook_logs()
  FROM PUBLIC, anon, authenticated;

-- Schedule nightly cleanup at 02:45 UTC (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-facebook-webhook-logs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-facebook-webhook-logs',
  '45 2 * * *',
  $$SELECT public.cleanup_old_facebook_webhook_logs();$$
);
