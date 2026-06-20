
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_manage_inactivity_lock boolean NOT NULL DEFAULT false;
