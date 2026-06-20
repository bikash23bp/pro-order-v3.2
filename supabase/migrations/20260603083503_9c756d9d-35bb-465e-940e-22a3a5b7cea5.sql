-- Add 'incomplete' status to order_status enum; reschedule WP incomplete sync to every minute.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'incomplete';

-- Reschedule WP incomplete sync cron to every minute
DO $$ BEGIN PERFORM cron.unschedule('auto-sync-wp-incomplete'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'auto-sync-wp-incomplete',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1b22ef9e-f639-41ef-a3c4-1e6cd4a47415.lovable.app/api/public/hooks/wp-incomplete-sync',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_2GB3KIYZZUiRGuGcOoCFoA_CWhpO0x7"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);