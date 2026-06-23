import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchMetaHourlyInsights, fetchMetaInsights, stripActPrefix, testMetaCredentials } from "./meta-ads.server";
// Lazy admin client — avoids top-level client.server import (keeps service-role key out of client bundle)
const getAdmin = async () => (await import("@/integrations/supabase/client.server")).(await getAdmin());


export type MetaAccount = {
  id: string;
  account_name: string;
  app_id: string;
  ad_account_id: string;
  usd_rate: number;
  status: string;
  active: boolean;
  account_currency: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
};

export const listMetaAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaAccount[]> => {
    const { data, error } = await context.supabase
      .from("meta_ads_accounts")
      .select(
        "id, account_name, app_id, ad_account_id, usd_rate, status, active, account_currency, last_synced_at, last_sync_error, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MetaAccount[];
  });

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  account_name: z.string().trim().min(1).max(120),
  app_id: z.string().trim().min(1).max(120),
  app_secret: z.string().trim().min(1).max(500),
  access_token: z.string().trim().min(10).max(2000),
  ad_account_id: z.string().trim().min(1).max(120),
  usd_rate: z.number().min(1).max(1000),
  active: z.boolean(),
});

export const testMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        access_token: z.string().trim().min(10),
        ad_account_id: z.string().trim().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return await testMetaCredentials({
      accessToken: data.access_token,
      adAccountId: data.ad_account_id,
    });
  });

export const saveMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => accountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const test = await testMetaCredentials({
      accessToken: data.access_token,
      adAccountId: data.ad_account_id,
    });
    const status = test.ok ? "connected" : test.status;
    const currency = test.ok ? test.currency : null;

    const payload = {
      account_name: data.account_name,
      app_id: data.app_id,
      app_secret: data.app_secret,
      access_token: data.access_token,
      ad_account_id: stripActPrefix(data.ad_account_id),
      usd_rate: data.usd_rate,
      active: data.active,
      status,
      account_currency: currency,
      last_sync_error: test.ok ? null : test.message,
      created_by: context.userId,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("meta_ads_accounts")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, status };
    }
    const { data: row, error } = await context.supabase
      .from("meta_ads_accounts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, status };
  });

export const toggleMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meta_ads_accounts")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meta_ads_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export async function syncOneAccount(
  accountId: string,
): Promise<{ inserted: number; status: string; message?: string }> {
  const { data: acc, error } = await (await getAdmin())
    .from("meta_ads_accounts")
    .select("id, active, status, access_token, ad_account_id, usd_rate")
    .eq("id", accountId)
    .maybeSingle();

  if (error || !acc) throw new Error(error?.message ?? "Account not found");
  if (!acc.active) return { inserted: 0, status: acc.status, message: "Account is disabled" };

  const result = await fetchMetaInsights({
    accessToken: acc.access_token,
    adAccountId: acc.ad_account_id,
    datePreset: "last_7d",
  });

  if (!result.ok) {
    await (await getAdmin())
      .from("meta_ads_accounts")
      .update({
        status: result.status,
        last_sync_error: result.message,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", accountId);
    return { inserted: 0, status: result.status, message: result.message };
  }

  const rate = Number(acc.usd_rate) || 110;
  const rows = result.rows
    .filter((r) => r.date_start && r.campaign_id)
    .map((r) => ({
      account_id: accountId,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      spend_usd: r.spend_usd,
      usd_rate: rate,
      spend_bdt: Number((r.spend_usd * rate).toFixed(2)),
      expense_date: r.date_start,
      synced_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error: upErr } = await (await getAdmin())
      .from("meta_ad_expenses")
      .upsert(rows, { onConflict: "account_id,campaign_id,expense_date" });
    if (upErr) {
      await (await getAdmin())
        .from("meta_ads_accounts")
        .update({
          status: "error",
          last_sync_error: upErr.message,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      return { inserted: 0, status: "error", message: upErr.message };
    }
  }

  await (await getAdmin())
    .from("meta_ads_accounts")
    .update({
      status: "connected",
      last_sync_error: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  return { inserted: rows.length, status: "connected" };
}

export const syncMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return await syncOneAccount(data.id);
  });

export const syncAllMetaAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: accs, error } = await (await getAdmin())
      .from("meta_ads_accounts")
      .select("id")
      .eq("active", true);
    if (error) throw new Error(error.message);
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
    return { accounts: results.length, inserted };
  });

export type ExpenseRow = {
  id: string;
  expense_date: string;
  campaign_name: string | null;
  spend_usd: number;
  usd_rate: number;
  spend_bdt: number;
  synced_at: string;
  account_id: string;
  account_name: string;
};

export const listExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        accountId: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ExpenseRow[]> => {
    let q = context.supabase
      .from("meta_ad_expenses")
      .select(
        "id, expense_date, campaign_name, spend_usd, usd_rate, spend_bdt, synced_at, account_id, meta_ads_accounts(account_name)",
      )
      .order("expense_date", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("expense_date", data.from);
    if (data.to) q = q.lte("expense_date", data.to);
    if (data.accountId) q = q.eq("account_id", data.accountId);
    if (data.search) q = q.ilike("campaign_name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const acc = (r as { meta_ads_accounts?: { account_name?: string } | null }).meta_ads_accounts;
      return {
        id: r.id as string,
        expense_date: r.expense_date as string,
        campaign_name: (r.campaign_name as string | null) ?? null,
        spend_usd: Number(r.spend_usd),
        usd_rate: Number(r.usd_rate),
        spend_bdt: Number(r.spend_bdt),
        synced_at: r.synced_at as string,
        account_id: r.account_id as string,
        account_name: acc?.account_name ?? "—",
      };
    });
  });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type OverviewStats = {
  todaySpendBdt: number;
  totalSpendBdt: number;
  todayRevenue: number;
  totalRevenue: number;
  netProfit: number;
  roi: number;
  daily: Array<{ date: string; spend: number; revenue: number }>;
};

export const getExpenseOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverviewStats> => {
    const { supabase } = context;
    const { data, error } = await (supabase as any).rpc("get_expense_overview");
    if (error) throw new Error(error.message);
    const r = data as any;
    return {
      todaySpendBdt: Number(r?.todaySpendBdt) || 0,
      totalSpendBdt: Number(r?.totalSpendBdt) || 0,
      todayRevenue: Number(r?.todayRevenue) || 0,
      totalRevenue: Number(r?.totalRevenue) || 0,
      netProfit: Number(r?.netProfit) || 0,
      roi: Number(r?.roi) || 0,
      daily: (r?.daily ?? []) as Array<{ date: string; spend: number; revenue: number }>,
    };
  });


export type PnLStats = {
  revenue: number;
  paidRevenue: number;
  organicRevenue: number;
  paidOrders: number;
  organicOrders: number;
  spend: number;
  netProfit: number;
  paidNetProfit: number;
  roi: number;
  trueRoas: number;
  cpa: number;
  daily: Array<{ date: string; profit: number; revenue: number; spend: number; paid_revenue?: number; organic_revenue?: number; paid_profit?: number }>;
  monthly: Array<{ month: string; profit: number; revenue: number; spend: number; paid_revenue?: number; organic_revenue?: number; paid_profit?: number }>;
};

export const getProfitLoss = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PnLStats> => {
    const { supabase } = context;
    const { data: result, error } = await (supabase as any).rpc("get_profit_loss", {
      p_from: data.from,
      p_to: data.to,
    });
    if (error) throw new Error(error.message);
    const r = result as any;
    return {
      revenue: Number(r?.revenue) || 0,
      paidRevenue: Number(r?.paidRevenue) || 0,
      organicRevenue: Number(r?.organicRevenue) || 0,
      paidOrders: Number(r?.paidOrders) || 0,
      organicOrders: Number(r?.organicOrders) || 0,
      spend: Number(r?.spend) || 0,
      netProfit: Number(r?.netProfit) || 0,
      paidNetProfit: Number(r?.paidNetProfit) || 0,
      roi: Number(r?.roi) || 0,
      trueRoas: Number(r?.trueRoas) || 0,
      cpa: Number(r?.cpa) || 0,
      daily: (r?.daily ?? []) as PnLStats["daily"],
      monthly: (r?.monthly ?? []) as PnLStats["monthly"],
    };
  });



// ---------------- Meta Ad Report (hourly + monthly) ----------------

const REVENUE_STATUSES_RPT = new Set(["processing", "ready_to_ship", "shipped", "completed"]);

export type HourlyReportRow = {
  hour: number; // 0..23
  label: string; // "14:00"
  spend_usd: number;
  spend_bdt: number;
  orders: number;
  pieces: number;
  revenue: number;
};

export const getMetaHourlyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: HourlyReportRow[]; errors: string[]; windowStart: string }>=> {
    // Define the rolling 24-hour window in Asia/Dhaka timezone (UTC+6).
    const TZ_OFFSET_MIN = 6 * 60;
    const nowUtc = new Date();
    const windowStart = new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000);

    // Init 24 buckets, anchored to the current hour going back 24h.
    const buckets: HourlyReportRow[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(windowStart.getTime() + i * 60 * 60 * 1000);
      const localHour = (d.getUTCHours() + Math.floor(TZ_OFFSET_MIN / 60)) % 24;
      buckets.push({
        hour: localHour,
        label: `${String(localHour).padStart(2, "0")}:00`,
        spend_usd: 0,
        spend_bdt: 0,
        orders: 0,
        pieces: 0,
        revenue: 0,
      });
    }
    // Map of "YYYY-MM-DD|H" (advertiser-tz date + hour) -> bucket index.
    const keyToIndex = new Map<string, number>();
    for (let i = 0; i < 24; i++) {
      const d = new Date(windowStart.getTime() + i * 60 * 60 * 1000);
      const localMs = d.getTime() + TZ_OFFSET_MIN * 60 * 1000;
      const local = new Date(localMs);
      const key = `${local.toISOString().slice(0, 10)}|${local.getUTCHours()}`;
      keyToIndex.set(key, i);
    }

    // 1) Pull orders + items in the window (single nested-select round-trip).
    const sinceIso = windowStart.toISOString();
    const { data: orders, error: ordErr } = await context.supabase
      .from("orders")
      .select("id, status, total_amount, created_at, order_items(quantity)")
      .gte("created_at", sinceIso);
    if (ordErr) throw new Error(ordErr.message);

    for (const o of (orders ?? []) as Array<{
      id: string; status: string; total_amount: number; created_at: string;
      order_items: Array<{ quantity: number }> | null;
    }>) {
      const created = new Date(o.created_at);
      const localMs = created.getTime() + TZ_OFFSET_MIN * 60 * 1000;
      const local = new Date(localMs);
      const key = `${local.toISOString().slice(0, 10)}|${local.getUTCHours()}`;
      const idx = keyToIndex.get(key);
      if (idx == null) continue;
      buckets[idx].orders += 1;
      const pieces = (o.order_items ?? []).reduce((s, it) => s + Number(it.quantity || 0), 0);
      buckets[idx].pieces += pieces;
      if (REVENUE_STATUSES_RPT.has(o.status)) {
        buckets[idx].revenue += Number(o.total_amount || 0);
      }
    }

    // 2) Pull hourly spend from Meta for each active account (today + yesterday).
    const { data: accs } = await (await getAdmin())
      .from("meta_ads_accounts")
      .select("id, access_token, ad_account_id, usd_rate, account_name, active")
      .eq("active", true);
    const errors: string[] = [];
    // fetchMetaHourlyInsights imported statically at top of file
    for (const acc of accs ?? []) {
      const rate = Number(acc.usd_rate) || 110;
      for (const preset of ["yesterday", "today"] as const) {
        const r = await fetchMetaHourlyInsights({
          accessToken: acc.access_token as string,
          adAccountId: acc.ad_account_id as string,
          datePreset: preset,
        });
        if (!r.ok) {
          errors.push(`${acc.account_name}: ${r.message}`);
          continue;
        }
        for (const row of r.rows) {
          const key = `${row.date_start}|${row.hour}`;
          const idx = keyToIndex.get(key);
          if (idx == null) continue;
          buckets[idx].spend_usd += row.spend_usd;
          buckets[idx].spend_bdt += row.spend_usd * rate;
        }
      }
    }

    return { rows: buckets, errors, windowStart: windowStart.toISOString() };
  });

export type MonthlyReportRow = {
  month: string; // YYYY-MM
  spend_usd: number;
  spend_bdt: number;
  orders: number;
  pieces: number;
  revenue: number;
};

export const getMetaMonthlyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: MonthlyReportRow[] }> => {
    // Last 12 months including current.
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const start = months[0] + "-01";
    const map = new Map<string, MonthlyReportRow>();
    for (const m of months)
      map.set(m, { month: m, spend_usd: 0, spend_bdt: 0, orders: 0, pieces: 0, revenue: 0 });

    // Spend
    const { data: exp } = await context.supabase
      .from("meta_ad_expenses")
      .select("expense_date, spend_usd, spend_bdt")
      .gte("expense_date", start);
    for (const r of exp ?? []) {
      const m = (r.expense_date as string).slice(0, 7);
      const row = map.get(m);
      if (!row) continue;
      row.spend_usd += Number(r.spend_usd || 0);
      row.spend_bdt += Number(r.spend_bdt || 0);
    }

    // Orders + revenue (single nested-select round-trip).
    const { data: orders } = await context.supabase
      .from("orders")
      .select("id, status, total_amount, created_at, order_items(quantity)")
      .gte("created_at", `${start}T00:00:00Z`);
    for (const o of (orders ?? []) as Array<{
      id: string; status: string; total_amount: number; created_at: string;
      order_items: Array<{ quantity: number }> | null;
    }>) {
      const m = o.created_at.slice(0, 7);
      const row = map.get(m);
      if (!row) continue;
      row.orders += 1;
      row.pieces += (o.order_items ?? []).reduce((s, it) => s + Number(it.quantity || 0), 0);
      if (REVENUE_STATUSES_RPT.has(o.status)) {
        row.revenue += Number(o.total_amount || 0);
      }
    }

    return { rows: Array.from(map.values()) };
  });

export type CampaignReportRow = {
  campaign_id: string;
  campaign_name: string;
  account_name: string;
  spend_usd: number;
  spend_bdt: number;
  days: number;
  last_spend_date: string | null;
};

export const getMetaCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: CampaignReportRow[]; totalSpendBdt: number }> => {
    const { data: exp, error } = await context.supabase
      .from("meta_ad_expenses")
      .select("campaign_id, campaign_name, spend_usd, spend_bdt, expense_date, meta_ads_accounts(account_name)")
      .gte("expense_date", data.from)
      .lte("expense_date", data.to);
    if (error) throw new Error(error.message);

    const map = new Map<string, CampaignReportRow & { _dates: Set<string> }>();
    for (const r of exp ?? []) {
      const cid = (r.campaign_id as string | null) ?? "unknown";
      const cname = (r.campaign_name as string | null) ?? "(Unnamed campaign)";
      const acc = (r as { meta_ads_accounts?: { account_name?: string } | null }).meta_ads_accounts;
      const accName = acc?.account_name ?? "—";
      const key = `${cid}|${accName}`;
      let row = map.get(key);
      if (!row) {
        row = {
          campaign_id: cid,
          campaign_name: cname,
          account_name: accName,
          spend_usd: 0,
          spend_bdt: 0,
          days: 0,
          last_spend_date: null,
          _dates: new Set<string>(),
        };
        map.set(key, row);
      }
      row.spend_usd += Number(r.spend_usd || 0);
      row.spend_bdt += Number(r.spend_bdt || 0);
      const d = r.expense_date as string;
      row._dates.add(d);
      if (!row.last_spend_date || d > row.last_spend_date) row.last_spend_date = d;
    }
    const rows = Array.from(map.values())
      .map(({ _dates, ...rest }) => ({ ...rest, days: _dates.size }))
      .sort((a, b) => b.spend_bdt - a.spend_bdt);
    const totalSpendBdt = rows.reduce((s, r) => s + r.spend_bdt, 0);
    return { rows, totalSpendBdt };
  });
