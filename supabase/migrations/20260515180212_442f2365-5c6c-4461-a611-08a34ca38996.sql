-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Admins upload product-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update product-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete product-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Fraud checker API key
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bdcourier_api_key text;

-- Order extras
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_method text;