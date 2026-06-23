import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Lazy admin client — avoids top-level client.server import (keeps service-role key out of client bundle)
const getAdmin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;


const ReplayInput = z.object({
  log_id: z.string().uuid(),
});

/**
 * Admin-only: re-process a failed webhook delivery by re-POSTing its saved
 * payload to the same webhook endpoint. Acts as a manual dead-letter retry.
 */
export const replayWebhookFromLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReplayInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify admin role
    const { data: roleRow } = await (await getAdmin())
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "business_owner"])
      .maybeSingle();
    if (!roleRow) {
      throw new Error("Forbidden: admin only");
    }

    const { data: log, error } = await (await getAdmin())
      .from("webhook_logs")
      .select("id, provider, payload, status")
      .eq("id", data.log_id)
      .maybeSingle();
    if (error || !log) throw new Error("Webhook log not found");
    if (log.provider !== "woocommerce") {
      throw new Error(`Replay not supported for provider: ${log.provider}`);
    }
    if (!log.payload) throw new Error("No payload stored for this log");

    // Look up the integration secret to construct the URL
    const { data: integration } = await (await getAdmin())
      .from("integrations")
      .select("webhook_secret, enabled")
      .eq("provider", "woocommerce")
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (!integration?.webhook_secret) {
      throw new Error("No enabled WooCommerce integration found");
    }

    const origin =
      process.env.PUBLIC_BASE_URL ??
      `https://project--${process.env.LOVABLE_PROJECT_ID ?? ""}.lovable.app`;
    const url = `${origin}/api/public/webhooks/woocommerce?secret=${encodeURIComponent(
      integration.webhook_secret,
    )}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log.payload),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  });
