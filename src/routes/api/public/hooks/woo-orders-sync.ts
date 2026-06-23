import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncWooOrdersAll } from "@/lib/woo-sync.server";
import { timingSafeEqual } from "crypto";

function checkCronAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return new Response("Server misconfigured", { status: 500 });
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/woo-orders-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;
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
