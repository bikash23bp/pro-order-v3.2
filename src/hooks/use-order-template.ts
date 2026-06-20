import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { findOrderTemplate, type OrderTemplateMeta } from "@/lib/order-templates";

export type OrderTemplateSelection = {
  desktopTemplate: OrderTemplateMeta;
  mobileTemplate: OrderTemplateMeta;
  adminDefaults: { desktop: string; mobile: string };
  userOverrides: { desktop: string | null; mobile: string | null };
  refresh: () => void;
};

/**
 * Resolves order-page template based on admin default (app_settings)
 * + per-user override (user_preferences). Reloads on focus.
 */
export function useOrderTemplate(): OrderTemplateSelection {
  const [adminDefaults, setAdminDefaults] = useState({ desktop: "card-premium", mobile: "mobile-stack" });
  const [userOverrides, setUserOverrides] = useState<{ desktop: string | null; mobile: string | null }>({
    desktop: null, mobile: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: settings }, { data: userData }] = await Promise.all([
        supabase.from("app_settings").select("default_order_template_desktop, default_order_template_mobile").maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (settings) {
        setAdminDefaults({
          desktop: (settings as { default_order_template_desktop?: string }).default_order_template_desktop ?? "card-premium",
          mobile:  (settings as { default_order_template_mobile?: string }).default_order_template_mobile  ?? "mobile-stack",
        });
      }
      const uid = userData.user?.id;
      if (uid) {
        const { data: pref } = await supabase
          .from("user_preferences")
          .select("order_template_desktop, order_template_mobile")
          .eq("user_id", uid)
          .maybeSingle();
        if (pref) {
          setUserOverrides({
            desktop: (pref as { order_template_desktop?: string | null }).order_template_desktop ?? null,
            mobile:  (pref as { order_template_mobile?: string | null }).order_template_mobile  ?? null,
          });
        }
      }
    })();
  }, [tick]);

  const desktopId = userOverrides.desktop ?? adminDefaults.desktop;
  const mobileId = userOverrides.mobile ?? adminDefaults.mobile;

  return {
    desktopTemplate: findOrderTemplate(desktopId, "desktop"),
    mobileTemplate: findOrderTemplate(mobileId, "mobile"),
    adminDefaults,
    userOverrides,
    refresh: () => setTick((t) => t + 1),
  };
}
