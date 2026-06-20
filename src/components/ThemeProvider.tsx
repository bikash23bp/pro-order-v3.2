import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME_ID, getTheme, type Theme, type ThemeId } from "@/lib/themes";
import { applyTheme, readStoredThemeId } from "@/lib/apply-theme";

type ThemeContextValue = {
  theme: Theme;
  persistedThemeId: ThemeId;
  setTheme: (id: ThemeId, opts?: { persist?: boolean }) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [persistedThemeId, setPersistedThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  // Initial apply from localStorage (sync, no flash)
  useEffect(() => {
    const stored = readStoredThemeId();
    applyTheme(stored);
    setThemeId(stored);
    setPersistedThemeId(stored);
  }, []);

  // Sync with logged-in user's saved preference
  useEffect(() => {
    let cancelled = false;
    const load = async (userId: string) => {
      const { data } = await supabase
        .from("user_preferences")
        .select("theme")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const remote = (data?.theme as ThemeId | undefined) ?? null;
      if (remote) {
        applyTheme(remote);
        setThemeId(remote);
        setPersistedThemeId(remote);
      }
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) load(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) load(session.user.id);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setTheme = useCallback<ThemeContextValue["setTheme"]>(
    async (id, opts) => {
      applyTheme(id);
      setThemeId(id);
      if (opts?.persist) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { error } = await supabase
            .from("user_preferences")
            .upsert(
              { user_id: session.user.id, theme: id, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
          if (!error) setPersistedThemeId(id);
          else throw new Error(error.message);
        }
      }
    },
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: getTheme(themeId), persistedThemeId, setTheme }),
    [themeId, persistedThemeId, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
