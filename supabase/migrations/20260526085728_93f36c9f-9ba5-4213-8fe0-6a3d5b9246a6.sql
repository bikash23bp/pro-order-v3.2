DROP VIEW IF EXISTS public.incomplete_orders;
CREATE VIEW public.incomplete_orders AS
SELECT * FROM public.orders
WHERE status = 'processing'
  AND preorder IS NOT TRUE;