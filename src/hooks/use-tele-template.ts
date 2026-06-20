import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { findTeleTemplate, type TeleTemplateMeta } from "@/lib/tele-templates";

export type TeleTemplateSelection = {
  desktopTemplate: TeleTemplateMeta;
  mobileTemplate: TeleTemplateMeta;
  adminDefaults: { desktop: string; mobile: string };
  userOverrides: { desktop: string | null; mobile: string | null };
  refresh: () => void;
};

export function useTeleTemplate(): TeleTemplateSelection {
  const [adminDefaults, setAdminDefaults] = useState({ desktop: "tele-table-classic", mobile: "tele-mobile-stack" });
  const [userOverrides, setUserOverrides] = useState<{ desktop: string | null; mobile: string | null }>({ desktop: null, mobile: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: settings }, { data: userData }] = await Promise.all([
        supabase.from("app_settings").select("default_tele_template_desktop, default_tele_template_mobile").maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (settings) {
        setAdminDefaults({
          desktop: (settings as { default_tele_template_desktop?: string }).default_tele_template_desktop ?? "tele-table-classic",
          mobile:  (settings as { default_tele_template_mobile?: string }).default_tele_template_mobile  ?? "tele-mobile-stack",
        });
      }
      const uid = userData.user?.id;
      if (uid) {
        const { data: pref } = await supabase
          .from("user_preferences")
          .select("tele_template_desktop, tele_template_mobile")
          .eq("user_id", uid)
          .maybeSingle();
        if (pref) {
          setUserOverrides({
            desktop: (pref as { tele_template_desktop?: string | null }).tele_template_desktop ?? null,
            mobile:  (pref as { tele_template_mobile?: string | null }).tele_template_mobile  ?? null,
          });
        }
      }
    })();
  }, [tick]);

  return {
    desktopTemplate: findTeleTemplate(userOverrides.desktop ?? adminDefaults.desktop, "desktop"),
    mobileTemplate: findTeleTemplate(userOverrides.mobile ?? adminDefaults.mobile, "mobile"),
    adminDefaults,
    userOverrides,
    refresh: () => setTick((t) => t + 1),
  };
}
