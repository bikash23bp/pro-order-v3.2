import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncAllShippedOrders } from "@/lib/courier-sync.server";

export const Route = createFileRoute("/api/public/hooks/courier-status-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const summary = await syncAllShippedOrders(supabaseAdmin);
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
