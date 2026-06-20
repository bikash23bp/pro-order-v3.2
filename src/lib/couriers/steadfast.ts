import type { CourierAdapter, Credentials, Result } from "./types";

const DEFAULT_BASE = "https://portal.packzy.com/api/v1";

function headers(c: Credentials) {
  return {
    "Api-Key": c.apiKey ?? "",
    "Secret-Key": c.secretKey ?? "",
    "Content-Type": "application/json",
  };
}

function baseUrl(c: Credentials) {
  return (c.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

async function safeFetch(url: string, init: RequestInit, timeoutMs = 8000): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let data: any = null;
    try { data = await res.json(); } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : "network error" };
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

export const steadfastAdapter: CourierAdapter = {
  name: "steadfast",

  async getBalance(c) {
    if (!c.apiKey || !c.secretKey) {
      return { supported: true, error: "Missing credentials", current: null, available: null, pending: null };
    }
    const r = await safeFetch(`${baseUrl(c)}/get_balance`, { method: "GET", headers: headers(c) });
    if (!r.ok) {
      return { supported: true, error: r.error || `Upstream ${r.status}`, current: null, available: null, pending: null };
    }
    const bal = num(r.data?.current_balance);
    return { supported: true, current: bal, available: bal, pending: null };
  },

  async getTracking(c, consignmentId): Promise<Result<any>> {
    if (!c.apiKey || !c.secretKey) {
      return { supported: true, error: "Missing credentials", status: null, location: null, timeline: [] };
    }
    if (!consignmentId) {
      return { supported: true, status: null, location: null, timeline: [] };
    }
    const r = await safeFetch(`${baseUrl(c)}/status_by_cid/${encodeURIComponent(consignmentId)}`, { method: "GET", headers: headers(c) });
    if (!r.ok) {
      return { supported: true, error: r.error || `Upstream ${r.status}`, status: null, location: null, timeline: [] };
    }
    return {
      supported: true,
      status: str(r.data?.delivery_status) ?? str(r.data?.status),
      location: null,
      timeline: [],
      consignmentId: str(r.data?.consignment_id) ?? consignmentId,
      trackingCode: str(r.data?.tracking_code),
    };
  },

  // Steadfast public API doesn't expose these — graceful fallback.
  async getCodReport() { return { supported: false }; },
  async getReturns() { return { supported: false }; },
  async getPayments() { return { supported: false }; },
};
