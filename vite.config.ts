// @lovable.dev/vite-tanstack-config already includes the following — do NOT add duplicate plugins manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const DEFAULT_LOVABLE_PROJECT_ID = "obxcohpzilphezwawhum";
const PERSONAL_BACKEND_URL = "https://aecaylmfhggcmekzuwcu.supabase.co";
const PERSONAL_BACKEND_PUBLISHABLE_KEY = "sb_publishable_BXwcJknFSSFeI6FZHaHMnw_mFWT--Vx";

function cleanEnv(value: string | undefined) {
  let normalized = value?.trim().replace(/^[ '\"]|[ '\"]$/g, "") ?? "";
  const assignment = normalized.match(/^[A-Z0-9_]+\s*=\s*(.+)$/);
  if (assignment?.[1]) normalized = assignment[1].trim().replace(/^[ '\"]|[ '\"]$/g, "");
  return normalized;
}

function isDefaultLovableBackend(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] === DEFAULT_LOVABLE_PROJECT_ID;
  } catch {
    return false;
  }
}

const fallbackSupabaseUrl = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
const fallbackSupabasePublishableKey = cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY) || cleanEnv(process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const supabaseUrl = cleanEnv(process.env.PERSONAL_SUPABASE_URL) || (isDefaultLovableBackend(fallbackSupabaseUrl) ? "" : fallbackSupabaseUrl) || PERSONAL_BACKEND_URL;
const supabasePublishableKey = cleanEnv(process.env.PERSONAL_SUPABASE_PUBLISHABLE_KEY) || (isDefaultLovableBackend(fallbackSupabaseUrl) ? "" : fallbackSupabasePublishableKey) || PERSONAL_BACKEND_PUBLISHABLE_KEY;
const supabaseProjectId = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : cleanEnv(process.env.VITE_SUPABASE_PROJECT_ID);

// Server functions read process.env.SUPABASE_* directly in dev/build. Keep them
// pinned to the user's personal backend when those secrets are present.
if (supabaseUrl) process.env.SUPABASE_URL = supabaseUrl;
if (supabasePublishableKey) process.env.SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey;
const personalServiceRoleKey = cleanEnv(process.env.PERSONAL_SUPABASE_SERVICE_ROLE_KEY);
if (personalServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = personalServiceRoleKey;

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
// Force-enable nitro so Cloudflare Workers Builds (outside Lovable sandbox) also produces
// dist/server/index.mjs and dist/server/wrangler.json.
export default defineConfig({
  nitro: true,
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
