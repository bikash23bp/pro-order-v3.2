import { createFileRoute } from "@tanstack/react-router";
import { syncAllShippedOrders } from "@/lib/courier-sync.server";
import { timingSafeEqual } from "crypto";

const PERSONAL_BACKEND_PUBLISHABLE_KEY = "sb_publishable_UD-P5lLzKAcjeS4PO2UDmQ_wLhlpuqO";

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function checkCronAuth(request: Request): Response | null {
  const env = process.env;
  const validKeys = [
    env.SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    PERSONAL_BACKEND_PUBLISHABLE_KEY,
  ].filter((key): key is string => Boolean(key));

  const apiKey = request.headers.get("apikey") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const legacySecret = env.CRON_SECRET;

  const validPublishableKey = validKeys.some((key) => safeCompare(apiKey, key) || safeCompare(bearer, key));
  const validLegacySecret = legacySecret ? safeCompare(bearer, legacySecret) : false;

  if (!validPublishableKey && !validLegacySecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/courier-status-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
