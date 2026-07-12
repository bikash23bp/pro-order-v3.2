import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

const DEFAULT_LOVABLE_PROJECT_ID = "obxcohpzilphezwawhum";

let serverEntryPromise: Promise<ServerEntry> | undefined;

function hydrateProcessEnv(env: unknown) {
  if (typeof process === "undefined") return;
  process.env ??= {};
  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string" && !process.env[key]?.trim()) {
        process.env[key] = normalizeEnvValue(value);
      }
    }
  }

  const auditSupabaseUrl = process.env.AUDIT_SUPABASE_URL ? normalizeEnvValue(process.env.AUDIT_SUPABASE_URL) : "";
  const auditSupabasePublishableKey = process.env.AUDIT_SUPABASE_PUBLISHABLE_KEY ? normalizeEnvValue(process.env.AUDIT_SUPABASE_PUBLISHABLE_KEY) : "";
  if (auditSupabaseUrl && auditSupabasePublishableKey) {
    process.env.SUPABASE_URL = auditSupabaseUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY = auditSupabasePublishableKey;
    const auditServiceRoleKey = process.env.AUDIT_SUPABASE_SERVICE_ROLE_KEY ? normalizeEnvValue(process.env.AUDIT_SUPABASE_SERVICE_ROLE_KEY) : "";
    if (auditServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = auditServiceRoleKey;
  }

  const legacyPersonalBackendAliases: Record<string, string> = {
    SUPABASE_URL: "PERSONAL_SUPABASE_URL",
    SUPABASE_PUBLISHABLE_KEY: "PERSONAL_SUPABASE_PUBLISHABLE_KEY",
    SUPABASE_SERVICE_ROLE_KEY: "PERSONAL_SUPABASE_SERVICE_ROLE_KEY",
  };

  for (const [target, source] of Object.entries(legacyPersonalBackendAliases)) {
    if (process.env[target]?.trim()) continue;
    const sourceValue = process.env[source] ? normalizeEnvValue(process.env[source]) : "";
    if (sourceValue) process.env[target] = sourceValue;
  }

  const aliases: Record<string, string[]> = {
    SUPABASE_URL: ["VITE_SUPABASE_URL"],
    SUPABASE_PUBLISHABLE_KEY: ["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
    SUPABASE_SERVICE_ROLE_KEY: ["SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY"],
  };

  for (const [target, sources] of Object.entries(aliases)) {
    if (process.env[target]?.trim()) continue;
    const sourceValue = sources.map((source) => process.env[source]).map((value) => value ? normalizeEnvValue(value) : "").find(Boolean);
    if (sourceValue) process.env[target] = sourceValue;
  }

  for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (process.env[key]) process.env[key] = normalizeEnvValue(process.env[key]);
  }

  if (isDefaultLovableBackend(process.env.SUPABASE_URL)) {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function normalizeEnvValue(value: string) {
  let normalized = value.trim().replace(/^['"]|['"]$/g, "");
  const assignment = normalized.match(/^[A-Z0-9_]+\s*=\s*(.+)$/);
  if (assignment?.[1]) normalized = assignment[1].trim().replace(/^['"]|['"]$/g, "");
  return normalized.replace(/^Bearer\s+/i, "").trim();
}

function isDefaultLovableBackend(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).hostname.split(".")[0] === DEFAULT_LOVABLE_PROJECT_ID;
  } catch {
    return false;
  }
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      hydrateProcessEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
 
