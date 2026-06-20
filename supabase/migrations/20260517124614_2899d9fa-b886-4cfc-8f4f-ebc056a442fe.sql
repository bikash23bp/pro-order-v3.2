CREATE TABLE public.wp_incomplete_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid,
  site_name text,
  fetched int NOT NULL DEFAULT 0,
  created int NOT NULL DEFAULT 0,
  skipped_no_phone int NOT NULL DEFAULT 0,
  skipped_dup int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  marked_imported int NOT NULL DEFAULT 0,
  imported_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wp_incomplete_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view wp_incomplete_sync_logs"
ON public.wp_incomplete_sync_logs
FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert wp_incomplete_sync_logs"
ON public.wp_incomplete_sync_logs
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX wp_incomplete_sync_logs_created_at_idx
ON public.wp_incomplete_sync_logs (created_at DESC);