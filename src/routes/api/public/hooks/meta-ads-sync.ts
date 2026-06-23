import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncOneAccount } from "@/lib/meta-ads.functions";
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

export const Route = createFileRoute("/api/public/hooks/meta-ads-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkCronAuth(request);
        if (denied) return denied;
        const { data: accs, error } = await supabaseAdmin
          .from("meta_ads_accounts")
          .select("id")
          .eq("active", true);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const results = await Promise.all(
          (accs ?? []).map((a) =>
            syncOneAccount(a.id).catch((e) => ({
              inserted: 0,
              status: "error",
              message: e instanceof Error ? e.message : String(e),
            })),
          ),
        );
        const inserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
        return Response.json({
          ok: true,
          accounts: results.length,
          inserted,
          ranAt: new Date().toISOString(),
        });
      },
    },
  },
});
