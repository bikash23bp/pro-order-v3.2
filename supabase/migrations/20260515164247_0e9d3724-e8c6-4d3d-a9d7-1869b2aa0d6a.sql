CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL,
  http_status integer NOT NULL,
  action text,
  external_id text,
  error text,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_provider ON public.webhook_logs (provider);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view webhook_logs"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (true);
