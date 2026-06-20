
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.decrement_stock() FROM PUBLIC, authenticated, anon;
-- has_role is needed by RLS policies (which run as the calling role); keep authenticated execute
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
