-- 1) Mapping table
CREATE TABLE IF NOT EXISTS public.user_site_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_user_site_access_user ON public.user_site_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_site_access_site ON public.user_site_access(site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_site_access TO authenticated;
GRANT ALL ON public.user_site_access TO service_role;

ALTER TABLE public.user_site_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_site_access read own" ON public.user_site_access;
CREATE POLICY "user_site_access read own"
  ON public.user_site_access FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'business_owner'::public.app_role)
  );

DROP POLICY IF EXISTS "user_site_access admin manage" ON public.user_site_access;
CREATE POLICY "user_site_access admin manage"
  ON public.user_site_access FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'business_owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'business_owner'::public.app_role)
  );

-- 2) Refresh the orders SELECT policy to include the site-access path
DROP POLICY IF EXISTS "Orders read scoped to owner or admin" ON public.orders;
CREATE POLICY "Orders read scoped to owner or admin"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR created_by = auth.uid()
    OR updated_by = auth.uid()
    OR (
      source_site_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_site_access usa
        WHERE usa.user_id = auth.uid()
          AND usa.site_id = orders.source_site_id
      )
    )
  );