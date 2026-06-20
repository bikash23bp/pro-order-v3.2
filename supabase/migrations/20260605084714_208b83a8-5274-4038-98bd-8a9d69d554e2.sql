-- Add plugin_signature column to integrations for WP OMS Incomplete Order v2 plugin
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS plugin_signature text;

CREATE INDEX IF NOT EXISTS idx_integrations_plugin_signature
  ON public.integrations(plugin_signature) WHERE plugin_signature IS NOT NULL;

-- Ensure 'completed' incomplete orders skipping works: add helpful index on external+source
CREATE INDEX IF NOT EXISTS idx_orders_incomplete_dedup
  ON public.orders(source, source_site_id, external_order_id)
  WHERE source = 'woocommerce_incomplete';