ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);

-- Allow any authenticated user to update their own last_seen_at via existing "users update own profile" policy (already exists).
-- Add a helper function to bump heartbeat (SECURITY DEFINER so it always works regardless of RLS quirks)
CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat() TO authenticated;