DROP POLICY IF EXISTS "admins update expenses" ON public.expenses;
DROP POLICY IF EXISTS "admins delete expenses" ON public.expenses;

CREATE POLICY "owners or admin update expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owners or admin delete expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));