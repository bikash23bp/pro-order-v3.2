import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncWpIncomplete } from "@/lib/wp-incomplete-sync.server";

export const Route = createFileRoute("/api/public/hooks/wp-incomplete-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Allow either the DB cron apikey header or the integration secret header used by other public hooks.
        const apiKey = request.headers.get("apikey");
        const authHeader = request.headers.get("authorization");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const expectedBearer = expected ? `Bearer ${expected}` : null;
        if ((!apiKey || !expected || apiKey !== expected) && (!expectedBearer || authHeader !== expectedBearer)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const summary = await syncWpIncomplete(supabaseAdmin);
          return new Response(JSON.stringify({ ok: true, summary }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.error("[wp-incomplete-sync hook]", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
