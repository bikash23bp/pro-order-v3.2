import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-OMS-Token",
  "Access-Control-Max-Age": "86400",
} as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

function tokenEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export const Route = createFileRoute("/api/public/oms-products")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        // Header only — accepting tokens via query string leaks them into
        // access logs, CDN logs, and browser history.
        const token = request.headers.get("x-oms-token") || "";
        if (!token) return json(401, { ok: false, error: "Missing X-OMS-Token header" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: senders, error: sErr } = await (supabaseAdmin as any)
          .from("oms_inbound_settings")
          .select("id, sender_name, api_token, active")
          .eq("active", true);
        if (sErr) return json(500, { ok: false, error: "Lookup failed" });

        const matched = (senders ?? []).find((s: any) => tokenEquals(String(s.api_token), token));
        if (!matched) return json(401, { ok: false, error: "Invalid token" });

        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1), 2000);
        const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data: rows, error, count } = await (supabaseAdmin as any)
          .from("oms_inbound_product_access")
          .select("product_id, products:product_id (id, name, sku, price, image_url, status, description)", { count: "exact" })
          .eq("sender_id", matched.id)
          .range(from, to);
        if (error) return json(500, { ok: false, error: error.message });

        const products = (rows ?? [])
          .map((r: any) => r.products)
          .filter((p: any) => p && p.status === "active")
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: Number(p.price),
            image_url: p.image_url,
            description: p.description,
          }));

        return json(200, {
          ok: true,
          sender_name: matched.sender_name,
          page,
          limit,
          total: count ?? products.length,
          products,
        });
      },
    },
  },
});
