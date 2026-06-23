REVOKE ALL ON FUNCTION public.get_duplicate_active_phones_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_duplicate_active_phones_array() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_v2() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_array() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_duplicate_active_phones_array() TO service_role;