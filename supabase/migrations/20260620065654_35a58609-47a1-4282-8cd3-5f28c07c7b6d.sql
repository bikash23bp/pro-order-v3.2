ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_manage_db_setup boolean NOT NULL DEFAULT false;