import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CourierStat = { total: number; success: number; cancelled: number; successRate: number };
export type FraudReport = {
  ourRecord: CourierStat;
  overall: CourierStat | null;
  pathao: CourierStat | null;
  redx: CourierStat | null;
  steadfast: CourierStat | null;
  parceldex: CourierStat | null;
  paperfly: CourierStat | null;
  carrybee: CourierStat | null;
  detectedCouriers: string[];
  hasApiKey: boolean;
  warning: string | null;
  apiError: string | null;
};

const COURIER_ALIASES = {
  pathao: ["pathao", "Pathao"],
  redx: ["redx", "redex", "RedX", "Redex", "red_x", "redX"],
  steadfast: ["steadfast", "Steadfast", "packzy", "Packzy"],
  parceldex: ["parceldex", "ParcelDex", "parcel_dex", "parcelDex", "parcel_dekho", "parceldekho"],
  paperfly: ["paperfly", "Paperfly", "paper_fly", "paperFly"],
  carrybee: ["carrybee", "CarryBee", "carry_bee", "carryBee"],
} satisfies Record<string, string[]>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findNamedRecord(value: unknown, names: string[], depth = 0): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record || depth > 4) return null;

  for (const name of names) {
    const direct = asRecord(record[name]);
    if (direct) return direct;
  }

  for (const child of Object.values(record)) {
    const found = findNamedRecord(child, names, depth + 1);
    if (found) return found;
  }

  return null;
}

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const last11 = digits.slice(-11);
  return last11.length === 10 ? `0${last11}` : last11;
}

function pct(success: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((success / total) * 100);
}

function statFromCourier(c: unknown): CourierStat | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const parseNum = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = Number.parseFloat(String(value).replaceAll(",", "").replace("%", "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  };
  const getNum = (value: unknown): number => parseNum(value) ?? 0;

  const nested = asRecord(
    o.summary ??
    o.stats ??
    o.data ??
    o.result ??
    o.courier ??
    o.courierData ??
    o.courier_data,
  );
  const source = nested ?? o;

  const total = getNum(
    source.total_parcel ??
    source.total_order ??
    source.total_orders ??
    source.total_deliveries ??
    source.total_delivery ??
    source.total,
  );
  const success = getNum(
    source.success_parcel ??
    source.success_order ??
    source.success_orders ??
    source.total_success ??
    source.success ??
    source.delivered_parcel ??
    source.delivered,
  );
  const cancelled = getNum(
    source.cancelled_parcel ??
    source.cancel_parcel ??
    source.cancelled_order ??
    source.cancel_order ??
    source.total_cancel ??
    source.failed_parcel ??
    source.cancelled ??
    Math.max(0, total - success),
  );
  const rawRate = parseNum(
    source.success_ratio ??
    source.success_rate ??
    source.delivery_ratio ??
    source.delivery_rate ??
    NaN,
  );
  const inferredTotal = total || success + cancelled;
  const inferredCancelled = cancelled || (inferredTotal > 0 ? Math.max(0, inferredTotal - success) : 0);
  if (inferredTotal <= 0 && success <= 0 && inferredCancelled <= 0 && rawRate === null) return null;
  return {
    total: inferredTotal,
    success,
    cancelled: inferredCancelled,
    successRate: rawRate !== null ? Math.round(rawRate) : pct(success, inferredTotal),
  };
}

function pickCourierCandidate(value: unknown, aliases: string[]): unknown {
  const record = asRecord(value);
  if (!record) return null;

  for (const key of aliases) {
    if (key in record) return record[key];
  }

  const lowered = aliases.map((alias) => alias.toLowerCase());
  for (const [key, child] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (lowered.some((alias) => normalizedKey === alias.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
      return child;
    }
  }

  return findNamedRecord(record, aliases);
}

function detectCourierKeys(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(COURIER_ALIASES)
    .filter(([, aliases]) => statFromCourier(pickCourierCandidate(record, aliases)))
    .map(([name]) => name);
}

function getCancellationRate(overall: CourierStat | null, ourRecord: CourierStat): number {
  if (overall && overall.total > 0) return Math.round((overall.cancelled / overall.total) * 100);
  if (ourRecord.total > 0) return Math.round((ourRecord.cancelled / ourRecord.total) * 100);
  return 0;
}

export const checkPhoneFraud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().min(3).max(40) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FraudReport> => {
    const { supabase } = context;
    const norm = normalizePhone(data.phone);
    const empty: CourierStat = { total: 0, success: 0, cancelled: 0, successRate: 0 };

    // Internal record
    let ourRecord: CourierStat = empty;
    if (norm) {
      const { data: rows } = await supabase
        .from("orders")
        .select("status")
        .eq("phone_normalized", norm);
      const list = rows ?? [];
      const total = list.length;
      const success = list.filter((r) => r.status === "completed").length;
      const cancelled = list.filter((r) => r.status === "cancelled" || r.status === "returned").length;
      ourRecord = { total, success, cancelled, successRate: pct(success, total) };
    }

    // Read API key (service-role: secret column is not exposed to authenticated role)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("bdcourier_api_key")
      .maybeSingle();
    const apiKey = settings?.bdcourier_api_key?.trim() ?? "";

    let overall: CourierStat | null = null;
    let pathao: CourierStat | null = null;
    let redx: CourierStat | null = null;
    let steadfast: CourierStat | null = null;
    let parceldex: CourierStat | null = null;
    let paperfly: CourierStat | null = null;
    let carrybee: CourierStat | null = null;
    let apiError: string | null = null;

    if (apiKey && norm) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4_000);
        const res = await fetch("https://api.bdcourier.com/courier-check", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ phone: norm }),
        }).finally(() => clearTimeout(timeout));
        const text = await res.text();
        if (!res.ok) {
          apiError = `BDCourier API ${res.status}: ${text.slice(0, 200)}`;
        } else {
          let json: Record<string, unknown> = {};
          try { json = JSON.parse(text) as Record<string, unknown>; } catch {
            apiError = `BDCourier returned non-JSON: ${text.slice(0, 120)}`;
          }
          // The API returns shape like { courier: { pathao, steadfast, redx, summary } }
          // or { couriers: {...} } or top-level fields. Try all.
          const courier =
            (json.courier as Record<string, unknown> | undefined) ??
            (json.courierData as Record<string, unknown> | undefined) ??
            (json.courier_data as Record<string, unknown> | undefined) ??
            (json.couriers as Record<string, unknown> | undefined) ??
            (json.data as Record<string, unknown> | undefined) ??
            json;

          if (typeof json.status === "string" && json.status.toLowerCase() === "error") {
            apiError = typeof json.message === "string"
              ? json.message
              : `BDCourier returned error status: ${text.slice(0, 200)}`;
          }

          const summaryCandidate =
            courier.aggregate ??
            courier.summary ??
            courier.overall ??
            courier.all ??
            json.aggregate ??
            json.summary ??
            json.overall ??
            findNamedRecord(json, ["aggregate", "summary", "overall", "all"]);

          const pathaoCandidate = pickCourierCandidate(courier, COURIER_ALIASES.pathao) ?? pickCourierCandidate(json, COURIER_ALIASES.pathao);
          const redxCandidate = pickCourierCandidate(courier, COURIER_ALIASES.redx) ?? pickCourierCandidate(json, COURIER_ALIASES.redx);
          const steadfastCandidate = pickCourierCandidate(courier, COURIER_ALIASES.steadfast) ?? pickCourierCandidate(json, COURIER_ALIASES.steadfast);
          const parceldexCandidate = pickCourierCandidate(courier, COURIER_ALIASES.parceldex) ?? pickCourierCandidate(json, COURIER_ALIASES.parceldex);
          const paperflyCandidate = pickCourierCandidate(courier, COURIER_ALIASES.paperfly) ?? pickCourierCandidate(json, COURIER_ALIASES.paperfly);
          const carrybeeCandidate = pickCourierCandidate(courier, COURIER_ALIASES.carrybee) ?? pickCourierCandidate(json, COURIER_ALIASES.carrybee);
          const detectedCouriers = detectCourierKeys(courier).length > 0 ? detectCourierKeys(courier) : detectCourierKeys(json);

          overall = statFromCourier(summaryCandidate);
          pathao = statFromCourier(pathaoCandidate);
          redx = statFromCourier(redxCandidate);
          steadfast = statFromCourier(steadfastCandidate);
          parceldex = statFromCourier(parceldexCandidate);
          paperfly = statFromCourier(paperflyCandidate);
          carrybee = statFromCourier(carrybeeCandidate);

          if (!overall) {
            const stats = [pathao, redx, steadfast, parceldex, paperfly, carrybee].filter(Boolean) as CourierStat[];
            const total = stats.reduce((s, x) => s + x.total, 0);
            const success = stats.reduce((s, x) => s + x.success, 0);
            const cancelled = stats.reduce((s, x) => s + x.cancelled, 0);
            overall = total > 0
              ? { total, success, cancelled, successRate: pct(success, total) }
              : null;
          }
          if (!overall && !pathao && !redx && !steadfast && !parceldex && !paperfly && !carrybee && !apiError) {
            const status = typeof json.status === "string" ? json.status : null;
            apiError = status === "success"
              ? "BDCourier returned success, but no courier stats were found in the response."
              : `Unexpected BDCourier response: ${text.slice(0, 200)}`;
          }

          const cancellationRate = getCancellationRate(overall, ourRecord);

          return {
            ourRecord,
            overall,
            pathao,
            redx,
            steadfast,
            parceldex,
            paperfly,
            carrybee,
            detectedCouriers,
            hasApiKey: apiKey.length > 0,
            warning: cancellationRate >= 30
              ? `High cancellation rate: ${cancellationRate}%`
              : null,
            apiError,
          };
        }
      } catch (e) {
        apiError = e instanceof Error ? e.message : String(e);
        console.error("BDCourier fraud check failed", e);
      }
    }

    const cancellationRate = getCancellationRate(overall, ourRecord);

    return {
      ourRecord,
      overall,
      pathao,
      redx,
      steadfast,
      parceldex,
      paperfly,
      carrybee,
      detectedCouriers: [],
      hasApiKey: apiKey.length > 0,
      warning: cancellationRate >= 30
        ? `High cancellation rate: ${cancellationRate}%`
        : null,
      apiError,
    };
  });
