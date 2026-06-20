-- 1) New permission column
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_view_all_orders boolean NOT NULL DEFAULT false;

-- 2) Backfill for existing admins / managers so they don't suddenly go blind
UPDATE public.user_permissions up
   SET can_view_all_orders = true
  FROM public.user_roles ur
 WHERE ur.user_id = up.user_id
   AND ur.role IN ('admin','manager','business_owner');

-- 3) Helper used by both RLS and (optionally) app code
CREATE OR REPLACE FUNCTION public.can_view_all_orders(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL AND (
      public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'business_owner'::public.app_role)
      OR COALESCE(
           (SELECT can_view_all_orders FROM public.user_permissions WHERE user_id = _uid),
           false
         )
    )
$$;

-- 4) Replace the wide-open SELECT policy on orders with a scoped one
DROP POLICY IF EXISTS "auth view orders" ON public.orders;
CREATE POLICY "Orders read scoped to owner or admin"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_all_orders(auth.uid())
    OR created_by = auth.uid()
    OR updated_by = auth.uid()
  );