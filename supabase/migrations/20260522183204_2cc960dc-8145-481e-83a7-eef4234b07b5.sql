ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS chat_force_popup boolean NOT NULL DEFAULT false;