ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_manage_notices boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notices_read_all_auth" ON public.notices;
CREATE POLICY "notices_read_all_auth" ON public.notices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "notices_write_admin_or_perm" ON public.notices;
CREATE POLICY "notices_write_admin_or_perm" ON public.notices
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid() AND can_manage_notices = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'business_owner')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid() AND can_manage_notices = true
    )
  );

CREATE OR REPLACE FUNCTION public.update_notices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_notices_updated_at ON public.notices;
CREATE TRIGGER trg_notices_updated_at
BEFORE UPDATE ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.update_notices_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;