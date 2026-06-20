-- Add manager to app_role enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'manager'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
END$$;

-- Add can_view_reports permission
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_view_reports boolean NOT NULL DEFAULT false;