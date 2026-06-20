-- Cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.webhook_logs WHERE created_at < now() - INTERVAL '90 days';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_wp_incomplete_sync_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.wp_incomplete_sync_logs WHERE created_at < now() - INTERVAL '30 days';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.whatsapp_logs WHERE created_at < now() - INTERVAL '90 days';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_telesales_call_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.telesales_call_logs WHERE created_at < now() - INTERVAL '180 days';
$$;

-- Helpful indexes for fast time-based purges
CREATE INDEX IF NOT EXISTS idx_facebook_webhook_logs_created_at ON public.facebook_webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_wp_incomplete_sync_logs_created_at ON public.wp_incomplete_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON public.whatsapp_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_telesales_call_logs_created_at ON public.telesales_call_logs(created_at);

-- Schedule pg_cron jobs (daily at 03:00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-facebook-webhook-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-wp-incomplete-sync-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-webhook-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-sms-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-whatsapp-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-telesales-call-logs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('cleanup-facebook-webhook-logs', '0 3 * * *',
  $$SELECT public.cleanup_old_facebook_webhook_logs();$$);
SELECT cron.schedule('cleanup-wp-incomplete-sync-logs', '5 3 * * *',
  $$SELECT public.cleanup_old_wp_incomplete_sync_logs();$$);
SELECT cron.schedule('cleanup-webhook-logs', '10 3 * * *',
  $$SELECT public.cleanup_old_webhook_logs();$$);
SELECT cron.schedule('cleanup-sms-logs', '15 3 * * *',
  $$SELECT public.cleanup_old_sms_logs();$$);
SELECT cron.schedule('cleanup-whatsapp-logs', '20 3 * * *',
  $$SELECT public.cleanup_old_whatsapp_logs();$$);
SELECT cron.schedule('cleanup-telesales-call-logs', '25 3 * * *',
  $$SELECT public.cleanup_old_telesales_call_logs();$$);