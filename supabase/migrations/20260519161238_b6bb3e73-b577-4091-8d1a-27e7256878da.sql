
DROP POLICY IF EXISTS "Authenticated can list avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list courier logos" ON storage.objects;
-- Admins keep ALL on avatars via "Admins manage all avatars" policy (includes the rare list need)
-- Direct GET via /object/public/<bucket>/<path> works without any SELECT policy on public buckets.
