// Server-only helpers for the Meta (Facebook) Marketing API.
// Never import this from client code.

const GRAPH_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaTestResult =
  | { ok: true; currency: string | null; accountName: string | null }
  | { ok: false; status: "invalid_token" | "expired" | "permission_error" | "error"; message: string };

function stripActPrefix(id: string): string {
  return id.replace(/^act_/i, "");
}

export async function testMetaCredentials(opts: {
  accessToken: string;
  adAccountId: string;
}): Promise<MetaTestResult> {
  const adId = stripActPrefix(opts.adAccountId);
  try {
    const url = `${GRAPH_BASE}/act_${adId}?fields=name,currency,account_status&access_token=${encodeURIComponent(opts.accessToken)}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      error?: { message: string; code?: number; error_subcode?: number; type?: string };
      name?: string;
      currency?: string;
      account_status?: number;
    };
    if (!res.ok || json.error) {
      const err = json.error;
      const msg = err?.message ?? `HTTP ${res.status}`;
      const code = err?.code;
      // Token expired / invalid
      if (code === 190 || /expired|invalid/i.test(msg)) {
        return { ok: false, status: /expired/i.test(msg) ? "expired" : "invalid_token", message: msg };
      }
      if (code === 200 || code === 10 || /permission/i.test(msg)) {
        return { ok: false, status: "permission_error", message: msg };
      }
      return { ok: false, status: "error", message: msg };
    }
    return { ok: true, currency: json.currency ?? null, accountName: json.name ?? null };
  } catch (e) {
    return { ok: false, status: "error", message: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type MetaInsightRow = {
  campaign_id: string | null;
  campaign_name: string | null;
  date_start: string; // YYYY-MM-DD
  spend_usd: number;
};

export async function fetchMetaInsights(opts: {
  accessToken: string;
  adAccountId: string;
  datePreset?: string; // e.g. "last_7d", "last_30d"
}): Promise<{ ok: true; rows: MetaInsightRow[] } | { ok: false; status: "invalid_token" | "expired" | "permission_error" | "error"; message: string }> {
  const adId = stripActPrefix(opts.adAccountId);
  const preset = opts.datePreset ?? "last_7d";
  const url = `${GRAPH_BASE}/act_${adId}/insights?level=campaign&time_increment=1&date_preset=${preset}&fields=campaign_id,campaign_name,spend,date_start&limit=500&access_token=${encodeURIComponent(opts.accessToken)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as {
      error?: { message: string; code?: number };
      data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; date_start?: string }>;
    };
    if (!res.ok || json.error) {
      const err = json.error;
      const msg = err?.message ?? `HTTP ${res.status}`;
      const code = err?.code;
      if (code === 190) return { ok: false, status: /expired/i.test(msg) ? "expired" : "invalid_token", message: msg };
      if (code === 200 || code === 10 || /permission/i.test(msg)) return { ok: false, status: "permission_error", message: msg };
      return { ok: false, status: "error", message: msg };
    }
    const rows: MetaInsightRow[] = (json.data ?? []).map((r) => ({
      campaign_id: r.campaign_id ?? null,
      campaign_name: r.campaign_name ?? null,
      date_start: r.date_start ?? "",
      spend_usd: Number(r.spend ?? 0) || 0,
    }));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, status: "error", message: e instanceof Error ? e.message : "Unknown error" };
  }
}

export type MetaHourlyRow = {
  date_start: string; // YYYY-MM-DD (advertiser TZ)
  hour: number; // 0..23
  spend_usd: number;
};

export async function fetchMetaHourlyInsights(opts: {
  accessToken: string;
  adAccountId: string;
  datePreset?: string; // "today" | "yesterday" | "last_3d" etc.
}): Promise<
  | { ok: true; rows: MetaHourlyRow[] }
  | { ok: false; status: "invalid_token" | "expired" | "permission_error" | "error"; message: string }
> {
  const adId = stripActPrefix(opts.adAccountId);
  const preset = opts.datePreset ?? "today";
  const url = `${GRAPH_BASE}/act_${adId}/insights?level=account&date_preset=${preset}&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&fields=spend,date_start&limit=500&access_token=${encodeURIComponent(opts.accessToken)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as {
      error?: { message: string; code?: number };
      data?: Array<{
        spend?: string;
        date_start?: string;
        hourly_stats_aggregated_by_advertiser_time_zone?: string;
      }>;
    };
    if (!res.ok || json.error) {
      const err = json.error;
      const msg = err?.message ?? `HTTP ${res.status}`;
      const code = err?.code;
      if (code === 190)
        return { ok: false, status: /expired/i.test(msg) ? "expired" : "invalid_token", message: msg };
      if (code === 200 || code === 10 || /permission/i.test(msg))
        return { ok: false, status: "permission_error", message: msg };
      return { ok: false, status: "error", message: msg };
    }
    const rows: MetaHourlyRow[] = (json.data ?? []).map((r) => {
      const slot = r.hourly_stats_aggregated_by_advertiser_time_zone ?? "00:00:00 - 00:59:59";
      const hour = Number(slot.slice(0, 2)) || 0;
      return {
        date_start: r.date_start ?? "",
        hour,
        spend_usd: Number(r.spend ?? 0) || 0,
      };
    });
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, status: "error", message: e instanceof Error ? e.message : "Unknown error" };
  }
}

export { stripActPrefix };
