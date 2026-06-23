DROP POLICY IF EXISTS "Orders read scoped to owner or admin" ON public.orders;

CREATE POLICY "Orders read scoped to owner or admin"
ON public.orders
FOR SELECT
TO authenticated
USING (
  (SELECT public.can_view_all_orders((SELECT auth.uid())))
  OR created_by = (SELECT auth.uid())
  OR updated_by = (SELECT auth.uid())
  OR (
    source_site_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_site_access usa
      WHERE usa.user_id = (SELECT auth.uid())
        AND usa.site_id = orders.source_site_id
    )
  )
);