-- 1. Deduplicate existing rows (keep earliest)
DELETE FROM public.customer_tags a
USING public.customer_tags b
WHERE a.phone = b.phone
  AND a.tag = b.tag
  AND a.created_at > b.created_at;

-- Edge case: identical created_at — keep lowest id
DELETE FROM public.customer_tags a
USING public.customer_tags b
WHERE a.phone = b.phone
  AND a.tag = b.tag
  AND a.created_at = b.created_at
  AND a.id > b.id;

-- 2. Unique constraint
ALTER TABLE public.customer_tags
  ADD CONSTRAINT customer_tags_phone_tag_unique UNIQUE (phone, tag);

-- 3. UPDATE policy (owner or admin)
CREATE POLICY "owners or admin update customer_tags"
ON public.customer_tags
FOR UPDATE
TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));