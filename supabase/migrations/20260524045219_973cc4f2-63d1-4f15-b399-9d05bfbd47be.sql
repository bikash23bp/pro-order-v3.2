CREATE TABLE public.inactivity_lock_pauses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inactivity_lock_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pauses"
ON public.inactivity_lock_pauses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pauses"
ON public.inactivity_lock_pauses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pauses"
ON public.inactivity_lock_pauses FOR UPDATE
USING (auth.uid() = user_id);

CREATE INDEX idx_inactivity_lock_pauses_user_id ON public.inactivity_lock_pauses(user_id, paused_at DESC);