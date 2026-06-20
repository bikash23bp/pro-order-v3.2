-- Auto-sync cron jobs for WooCommerce orders and WP incomplete orders.
-- Calls public TanStack hooks every 5 minutes via pg_net.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing (idempotent)
DO $$ BEGIN PERFORM cron.unschedule('auto-sync-woo-orders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('auto-sync-wp-incomplete'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Schedule WooCommerce orders sync every 5 minutes
SELECT cron.schedule(
  'auto-sync-woo-orders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1b22ef9e-f639-41ef-a3c4-1e6cd4a47415.lovable.app/api/public/hooks/woo-orders-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Schedule WP incomplete-orders sync every 5 minutes (requires apikey header)
SELECT cron.schedule(
  'auto-sync-wp-incomplete',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1b22ef9e-f639-41ef-a3c4-1e6cd4a47415.lovable.app/api/public/hooks/wp-incomplete-sync',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_2GB3KIYZZUiRGuGcOoCFoA_CWhpO0x7"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);