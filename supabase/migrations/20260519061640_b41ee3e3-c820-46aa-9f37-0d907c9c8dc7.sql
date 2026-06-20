
ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.couriers
  DROP CONSTRAINT IF EXISTS couriers_kind_check;
ALTER TABLE public.couriers
  ADD CONSTRAINT couriers_kind_check CHECK (kind IN ('api', 'local'));

-- only one row can be marked default
CREATE UNIQUE INDEX IF NOT EXISTS couriers_one_default_idx
  ON public.couriers (is_default) WHERE is_default = true;

-- storage bucket for courier logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('courier-logos', 'courier-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Courier logos are publicly viewable" ON storage.objects;
CREATE POLICY "Courier logos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'courier-logos');

DROP POLICY IF EXISTS "Admins upload courier logos" ON storage.objects;
CREATE POLICY "Admins upload courier logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'courier-logos' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update courier logos" ON storage.objects;
CREATE POLICY "Admins update courier logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'courier-logos' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete courier logos" ON storage.objects;
CREATE POLICY "Admins delete courier logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'courier-logos' AND public.has_role(auth.uid(), 'admin'::app_role));
