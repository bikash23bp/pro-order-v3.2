REVOKE EXECUTE ON FUNCTION public.user_has_any_permission(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_any_permission(uuid, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb) TO authenticated;