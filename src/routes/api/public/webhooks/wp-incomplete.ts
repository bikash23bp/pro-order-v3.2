import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const jsonHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const direct = record.items ?? record.orders ?? record.rows ?? record.data;
  return Array.isArray(direct) ? direct : [];
}

export const Route = createFileRoute("/api/public/webhooks/wp-incomplete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret") ?? "";
        if (!secret) return jsonResponse({ ok: false, error: "Missing secret" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integration, error: integrationError } = await supabaseAdmin
          .from("integrations")
          .select("id, name, webhook_secret, plugin_signature, enabled")
          .eq("provider", "woocommerce")
          .eq("webhook_secret", secret)
          .maybeSingle();

        if (integrationError) return jsonResponse({ ok: false, error: integrationError.message }, 500);
        if (!integration || !integration.enabled) return jsonResponse({ ok: false, error: "Integration not configured" }, 404);
        if (!safeEqual(secret, integration.webhook_secret)) return jsonResponse({ ok: false, error: "Invalid secret" }, 401);

        const expectedSignature = integration.plugin_signature?.trim();
        if (expectedSignature) {
          const headerSignature = request.headers.get("x-plugin-signature")?.trim() ?? "";
          if (!headerSignature || !safeEqual(headerSignature, expectedSignature)) {
            return jsonResponse({ ok: false, error: "Invalid plugin signature" }, 401);
          }
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
        }

        const rows = extractRows(payload);
        if (rows.length === 0) return jsonResponse({ ok: true, created: 0, skipped: 0 });

        const { importWpIncompleteRows } = await import("@/lib/wp-incomplete-sync.server");
        const result = await importWpIncompleteRows(
          supabaseAdmin,
          { id: integration.id, name: integration.name, plugin_signature: integration.plugin_signature },
          rows as never,
        );

        return jsonResponse({ ok: true, ...result, received: rows.length });
      },
    },
  },
});