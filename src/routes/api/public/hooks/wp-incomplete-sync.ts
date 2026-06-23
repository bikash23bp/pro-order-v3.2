import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncWpIncomplete } from "@/lib/wp-incomplete-sync.server";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/wp-incomplete-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Server-only CRON_SECRET, never exposed to the client.
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const header = request.headers.get("authorization") ?? "";
        const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
        const a = Buffer.from(presented);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
