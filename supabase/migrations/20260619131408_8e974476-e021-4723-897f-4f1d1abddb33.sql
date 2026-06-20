CREATE TABLE public.user_oms_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, sender_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_oms_access TO authenticated;
GRANT ALL ON public.user_oms_access TO service_role;

ALTER TABLE public.user_oms_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_oms_access"
ON public.user_oms_access
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'business_owner'));

CREATE POLICY "Users can view their own oms access"
ON public.user_oms_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_user_oms_access_user ON public.user_oms_access(user_id);
