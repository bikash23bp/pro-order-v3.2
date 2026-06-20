-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup of webhook_logs older than 24 hours
SELECT cron.schedule(
  'cleanup-webhook-logs-24h',
  '0 */6 * * *',  -- Every 6 hours
  $$
    DELETE FROM public.webhook_logs
    WHERE created_at < NOW() - INTERVAL '24 hours';
  $$
);

-- Also schedule cleanup for wp_incomplete_sync_logs older than 24 hours
SELECT cron.schedule(
  'cleanup-wp-sync-logs-24h',
  '0 */6 * * *',  -- Every 6 hours
  $$
    DELETE FROM public.wp_incomplete_sync_logs
    WHERE created_at < NOW() - INTERVAL '24 hours';
  $$
);