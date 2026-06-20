import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MessagingEvent = {
  sender?: { id?: string; name?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { text?: string; mid?: string };
};

type FbEntry = {
  id?: string;
  time?: number;
  messaging?: MessagingEvent[];
  changes?: Array<{ field?: string; value?: unknown }>;
};

type FbPayload = {
  object?: string;
  entry?: FbEntry[];
};

const jsonHeaders = { "Content-Type": "application/json" };

async function logEvent(input: {
  event_type: string;
  page_id?: string | null;
  page_name?: string | null;
  payload?: unknown;
  response?: unknown;
  status: "success" | "error" | "ignored";
  http_status?: number | null;
  error?: string | null;
  order_id?: string | null;
}) {
  try {
    await supabaseAdmin.from("facebook_webhook_logs").insert({
      event_type: input.event_type,
      page_id: input.page_id ?? null,
      page_name: input.page_name ?? null,
      payload: (input.payload ?? null) as never,
      response: (input.response ?? null) as never,
      status: input.status,
      http_status: input.http_status ?? null,
      error: input.error ?? null,
      order_id: input.order_id ?? null,
    });
  } catch (e) {
    console.error("facebook_webhook_logs insert failed:", e);
  }
}

export const Route = createFileRoute("/api/public/facebook-page-orders/webhook")({
  server: {
    handlers: {
      // Meta verification handshake
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const { data: settings } = await supabaseAdmin
          .from("facebook_settings")
          .select("verify_token")
          .eq("id", true)
          .maybeSingle();

        if (mode === "subscribe" && token && settings?.verify_token && token === settings.verify_token) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const body = await request.text();

        const { data: settings } = await supabaseAdmin
          .from("facebook_settings")
          .select("app_secret, enabled")
          .eq("id", true)
          .maybeSingle();

        if (!settings?.enabled) {
          await logEvent({
            event_type: "disabled",
            status: "ignored",
            http_status: 200,
            payload: safeJson(body),
          });
          return new Response(JSON.stringify({ ok: true, ignored: true }), {
            status: 200,
            headers: jsonHeaders,
          });
        }

        // Verify x-hub-signature-256 if app_secret configured
        if (settings.app_secret) {
          const sig = request.headers.get("x-hub-signature-256");
          if (!sig || !sig.startsWith("sha256=")) {
            await logEvent({
              event_type: "auth_failed",
              status: "error",
              http_status: 401,
              error: "Missing signature",
              payload: safeJson(body),
            });
            return new Response("Missing signature", { status: 401 });
          }
          const expected = "sha256=" + createHmac("sha256", settings.app_secret).update(body).digest("hex");
          const a = Buffer.from(sig);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            await logEvent({
              event_type: "auth_failed",
              status: "error",
              http_status: 401,
              error: "Invalid signature",
              payload: safeJson(body),
            });
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: FbPayload;
        try {
          payload = JSON.parse(body) as FbPayload;
        } catch {
          await logEvent({
            event_type: "invalid_json",
            status: "error",
            http_status: 400,
            error: "Invalid JSON",
          });
          return new Response("Invalid JSON", { status: 400 });
        }

        const entries = payload.entry ?? [];
        let createdCount = 0;

        for (const entry of entries) {
          const pageId = entry.id ?? null;
          const { data: page } = pageId
            ? await supabaseAdmin
                .from("facebook_pages")
                .select("page_name")
                .eq("page_id", pageId)
                .maybeSingle()
            : { data: null };

          const messages = entry.messaging ?? [];
          if (messages.length === 0) {
            await logEvent({
              event_type: entry.changes?.[0]?.field ?? "non_messaging",
              page_id: pageId,
              page_name: page?.page_name ?? null,
              status: "ignored",
              http_status: 200,
              payload: entry,
            });
            continue;
          }

          for (const m of messages) {
            const psid = m.sender?.id ?? "unknown";
            const text = m.message?.text?.trim();
            if (!text) {
              await logEvent({
                event_type: "non_text_message",
                page_id: pageId,
                page_name: page?.page_name ?? null,
                status: "ignored",
                http_status: 200,
                payload: m,
              });
              continue;
            }

            const customerName = m.sender?.name?.trim() || `Facebook ${psid.slice(-6)}`;
            const customerPhone = `FB-${psid}`;
            const externalId = m.message?.mid ?? `${psid}-${m.timestamp ?? Date.now()}`;

            // Skip duplicates
            const { data: existing } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("source", "facebook")
              .eq("external_order_id", externalId)
              .maybeSingle();
            if (existing) {
              await logEvent({
                event_type: "message_duplicate",
                page_id: pageId,
                page_name: page?.page_name ?? null,
                status: "ignored",
                http_status: 200,
                payload: m,
                order_id: existing.id,
              });
              continue;
            }

            const { data: inserted, error: insErr } = await supabaseAdmin
              .from("orders")
              .insert({
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_address: "From Facebook Messenger",
                customer_email: null,
                subtotal: 0,
                total_amount: 0,
                discount_amount: 0,
                delivery_charge: 0,
                advance_amount: 0,
                invoice_note: text.slice(0, 1000),
                internal_note: `FB Page: ${page?.page_name ?? pageId ?? "unknown"} · PSID: ${psid}`,
                status: "processing" as never,
                source: "facebook",
                external_order_id: externalId,
              })
              .select("id")
              .single();

            if (insErr || !inserted) {
              await logEvent({
                event_type: "order_insert_failed",
                page_id: pageId,
                page_name: page?.page_name ?? null,
                status: "error",
                http_status: 500,
                error: insErr?.message ?? "unknown",
                payload: m,
              });
              continue;
            }

            createdCount += 1;
            await logEvent({
              event_type: "message",
              page_id: pageId,
              page_name: page?.page_name ?? null,
              status: "success",
              http_status: 200,
              payload: m,
              response: { order_id: inserted.id },
              order_id: inserted.id,
            });
          }
        }

        return new Response(JSON.stringify({ ok: true, created: createdCount }), {
          status: 200,
          headers: jsonHeaders,
        });
      },
    },
  },
});

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body.slice(0, 500) };
  }
}
