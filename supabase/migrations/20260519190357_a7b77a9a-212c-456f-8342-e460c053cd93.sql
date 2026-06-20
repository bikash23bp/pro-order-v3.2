
-- 6. enforce_max_integrations: advisory lock per provider to remove COUNT+INSERT race
CREATE OR REPLACE FUNCTION public.enforce_max_integrations()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Serialize concurrent inserts/updates per provider for the rest of the txn.
  PERFORM pg_advisory_xact_lock(hashtext('integrations:' || NEW.provider));

  IF (SELECT count(*) FROM public.integrations WHERE provider = NEW.provider) >= 5
     AND (TG_OP = 'INSERT' OR (TG_OP='UPDATE' AND OLD.provider <> NEW.provider))
  THEN
    RAISE EXCEPTION 'Max 5 % integrations allowed', NEW.provider USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

-- 7. Restrict SECURITY DEFINER admin-only functions: revoke from anon/public.
-- Internal auth/role checks remain inside the function bodies.
REVOKE EXECUTE ON FUNCTION public.import_legacy_order(text, text, text, text, timestamp with time zone, order_status, numeric, numeric, numeric, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_update_order_status(uuid[], order_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(text, text, text, text, uuid, numeric, numeric, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_order_with_items(uuid, text, text, text, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_supplier_purchase(uuid, uuid, date, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_supplier_purchase(uuid, uuid, numeric, numeric, jsonb) FROM PUBLIC, anon;

-- 8. order_items DELETE: staff with can_manage_orders, not just admin
DROP POLICY IF EXISTS "admins delete order items" ON public.order_items;
CREATE POLICY "staff with manage_orders delete order_items"
  ON public.order_items
  FOR DELETE
  TO authenticated
  USING (public.user_has_permission(auth.uid(), 'can_manage_orders'));
