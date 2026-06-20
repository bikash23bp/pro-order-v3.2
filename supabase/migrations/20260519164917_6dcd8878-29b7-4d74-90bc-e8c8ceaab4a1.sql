DROP POLICY IF EXISTS "staff update own telesales_assignments" ON public.telesales_assignments;

CREATE POLICY "staff update own telesales_assignments"
ON public.telesales_assignments
FOR UPDATE
TO authenticated
USING (
  (assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (assigned_to = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)
);