ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_view_telesales_reports boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';