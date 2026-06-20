
-- Fix inactivity_lock_pauses: restrict policies to authenticated role only
DROP POLICY IF EXISTS "Users can create their own pauses" ON public.inactivity_lock_pauses;
DROP POLICY IF EXISTS "Users can update their own pauses" ON public.inactivity_lock_pauses;
DROP POLICY IF EXISTS "Users can view their own pauses" ON public.inactivity_lock_pauses;

CREATE POLICY "Users can create their own pauses"
  ON public.inactivity_lock_pauses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pauses"
  ON public.inactivity_lock_pauses
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own pauses"
  ON public.inactivity_lock_pauses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
