import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncWooOrdersAll } from "@/lib/woo-sync.server";

export const Route = createFileRoute("/api/public/hooks/woo-orders-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const summary = await syncWooOrdersAll(supabaseAdmin);
          return new Response(JSON.stringify({ ok: true, ...summary }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          console.error("[woo-orders-sync hook]", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
