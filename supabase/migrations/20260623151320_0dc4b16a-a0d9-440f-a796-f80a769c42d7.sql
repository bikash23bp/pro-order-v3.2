-- Force a stronger schema reload. Touching the table comment is a known PostgREST cache buster.
COMMENT ON TABLE public.user_permissions IS 'Per-user permission flags (cache bump)';
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';