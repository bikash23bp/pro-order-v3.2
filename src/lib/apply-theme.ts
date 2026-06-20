import { getTheme, type ThemeId, DEFAULT_THEME_ID } from "./themes";

export const THEME_STORAGE_KEY = "oms-theme";

export function applyTheme(id: ThemeId | string) {
  if (typeof document === "undefined") return;
  const theme = getTheme(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens)) {
    root.style.setProperty(k, v);
  }
  root.classList.toggle("dark", theme.mode === "dark");
  root.dataset.theme = theme.id;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    // ignore storage errors
  }
}

export function readStoredThemeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return (v as ThemeId) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}
