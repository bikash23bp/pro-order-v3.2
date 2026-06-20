// @lovable.dev/vite-tanstack-config already includes the following — do NOT add duplicate plugins manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
// Force-enable nitro so Cloudflare Workers Builds (outside Lovable sandbox) also produces
// dist/server/index.mjs and dist/server/wrangler.json.
export default defineConfig({
  nitro: true,
  tanstackStart: {
    server: { entry: "server" },
  },
});
