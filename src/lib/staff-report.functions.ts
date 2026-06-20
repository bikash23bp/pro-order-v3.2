import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REVENUE_STATUSES = new Set(["processing", "ready_to_ship", "shipped", "completed"]);

function normalizePhone(p: string | null | undefined): string | null {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-11);
}

export type StaffSourceBreakdown = {
  source_id: string | null;
  source_name: string;
  count: number;
  amount: number;
};

export type StaffReportRow = {
  user_id: string;
  name: string;
  total_orders: number;
  total_amount: number;
  manual_count: number;
  web_count: number;
  web_confirmed_count: number;
  facebook_count: number;
  other_count: number;
  telesales_count: number;
  telesales_amount: number;
  by_source: StaffSourceBreakdown[];
};

export type StaffDrilldownItem = {
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
};

export type StaffDrilldownOrder = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  customer_name: string;
  customer_phone: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  delivery_charge: number;
  advance_amount: number;
  total_amount: number;
  source: string;
  created_at: string;
  items: StaffDrilldownItem[];
};

export const getStaffReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(),
      to: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [ordersRes, profilesRes, sourcesRes, assignmentsRes, importedRes] = await Promise.all([
      supabase.from("orders")
        .select("id, order_number, customer_name, customer_phone, phone_normalized, status, total_amount, source, order_source_id, created_by, created_at")
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("order_sources").select("id, name"),
      supabase.from("telesales_assignments").select("customer_id, assigned_to"),
      supabase.from("imported_customers").select("id, phone"),
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const orders = ordersRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const sources = sourcesRes.data ?? [];
    const assignments = assignmentsRes.data ?? [];
    const imported = importedRes.data ?? [];

    const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "Unknown"]));
    const sourceMap = new Map(sources.map((s) => [s.id, s.name]));
    const customerPhoneMap = new Map<string, string | null>();
    for (const c of imported) customerPhoneMap.set(c.id, normalizePhone(c.phone));

    // staff -> Set<normalizedPhone> they had telesales assignment for
    const telePhonesByStaff = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (!a.assigned_to) continue;
      const phone = customerPhoneMap.get(a.customer_id);
      if (!phone) continue;
      let set = telePhonesByStaff.get(a.assigned_to);
      if (!set) { set = new Set(); telePhonesByStaff.set(a.assigned_to, set); }
      set.add(phone);
    }

    const rowMap = new Map<string, StaffReportRow>();
    const ensure = (uid: string): StaffReportRow => {
      let row = rowMap.get(uid);
      if (!row) {
        row = {
          user_id: uid,
          name: profileMap.get(uid) ?? "Unassigned / Webhook",
          total_orders: 0, total_amount: 0,
          manual_count: 0, web_count: 0, web_confirmed_count: 0,
          facebook_count: 0, other_count: 0,
          telesales_count: 0, telesales_amount: 0,
          by_source: [],
        };
        rowMap.set(uid, row);
      }
      return row;
    };

    const bySourceAcc = new Map<string, Map<string, { count: number; amount: number; name: string }>>();

    for (const o of orders) {
      const uid = o.created_by ?? "unassigned";
      const row = ensure(uid);
      const amt = Number(o.total_amount || 0);
      const isRevenue = REVENUE_STATUSES.has(o.status);

      row.total_orders += 1;
      if (isRevenue) row.total_amount += amt;

      const src = (o.source || "manual").toLowerCase();
      if (src === "manual") row.manual_count += 1;
      else if (src === "web" || src === "woocommerce") {
        row.web_count += 1;
        if (isRevenue) row.web_confirmed_count += 1;
      }
      else if (src === "facebook") row.facebook_count += 1;
      else row.other_count += 1;

      // telesales attribution
      const phone = o.phone_normalized;
      if (phone && telePhonesByStaff.get(uid)?.has(phone)) {
        row.telesales_count += 1;
        if (isRevenue) row.telesales_amount += amt;
      }

      // by_source breakdown (using order_source_id, falling back to source label)
      const sid = o.order_source_id ?? `__src_${src}`;
      const sname = o.order_source_id ? (sourceMap.get(o.order_source_id) ?? "Unknown") : src;
      let m = bySourceAcc.get(uid);
      if (!m) { m = new Map(); bySourceAcc.set(uid, m); }
      let entry = m.get(sid);
      if (!entry) { entry = { count: 0, amount: 0, name: sname }; m.set(sid, entry); }
      entry.count += 1;
      if (isRevenue) entry.amount += amt;
    }

    for (const [uid, m] of bySourceAcc.entries()) {
      const row = rowMap.get(uid);
      if (!row) continue;
      row.by_source = Array.from(m.entries()).map(([sid, v]) => ({
        source_id: sid.startsWith("__src_") ? null : sid,
        source_name: v.name,
        count: v.count,
        amount: v.amount,
      })).sort((a, b) => b.count - a.count);
    }

    const rows = Array.from(rowMap.values()).sort((a, b) => b.total_amount - a.total_amount);
    return { rows };
  });

export const getStaffDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(),
      to: z.string(),
      userId: z.string(),
      metric: z.enum([
        "total", "manual", "web", "web_confirmed", "facebook", "other", "telesales",
      ]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const isUnassigned = data.userId === "unassigned";

    let q = supabase.from("orders")
      .select("id, order_number, invoice_number, customer_name, customer_phone, phone_normalized, status, subtotal, discount_amount, delivery_charge, advance_amount, total_amount, source, created_at, created_by")
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .order("created_at", { ascending: false })
      .limit(500);

    if (isUnassigned) q = q.is("created_by", null);
    else q = q.eq("created_by", data.userId);

    const { data: rows, error } = await q;
    if (error) throw error;

    let filtered = rows ?? [];

    const isRevenue = (s: string) => REVENUE_STATUSES.has(s);

    if (data.metric === "manual") filtered = filtered.filter((r) => (r.source || "").toLowerCase() === "manual");
    else if (data.metric === "web") filtered = filtered.filter((r) => ["web", "woocommerce"].includes((r.source || "").toLowerCase()));
    else if (data.metric === "web_confirmed") filtered = filtered.filter((r) => ["web", "woocommerce"].includes((r.source || "").toLowerCase()) && isRevenue(r.status));
    else if (data.metric === "facebook") filtered = filtered.filter((r) => (r.source || "").toLowerCase() === "facebook");
    else if (data.metric === "other") filtered = filtered.filter((r) => !["manual", "web", "woocommerce", "facebook"].includes((r.source || "").toLowerCase()));
    else if (data.metric === "telesales") {
      const [{ data: assigns }, { data: imp }] = await Promise.all([
        supabase.from("telesales_assignments").select("customer_id, assigned_to").eq("assigned_to", data.userId),
        supabase.from("imported_customers").select("id, phone"),
      ]);
      const phones = new Set<string>();
      const phoneByCustomer = new Map<string, string | null>();
      for (const c of (imp ?? [])) phoneByCustomer.set(c.id, normalizePhone(c.phone));
      for (const a of (assigns ?? [])) {
        const p = phoneByCustomer.get(a.customer_id);
        if (p) phones.add(p);
      }
      filtered = filtered.filter((r) => r.phone_normalized && phones.has(r.phone_normalized));
    }

    // Fetch line items + products/variants for the filtered orders
    const orderIds = filtered.map((r) => r.id);
    const itemsByOrder = new Map<string, StaffDrilldownItem[]>();
    if (orderIds.length > 0) {
      const { data: lineItems } = await supabase
        .from("order_items")
        .select("order_id, product_id, variant_id, quantity, unit_price")
        .in("order_id", orderIds);

      const productIds = Array.from(new Set((lineItems ?? []).map((l) => l.product_id).filter(Boolean))) as string[];
      const variantIds = Array.from(new Set((lineItems ?? []).map((l) => l.variant_id).filter(Boolean))) as string[];

      const [prodRes, varRes] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id, name, sku").in("id", productIds)
          : Promise.resolve({ data: [] as { id: string; name: string; sku: string | null }[] }),
        variantIds.length
          ? supabase.from("product_variants").select("id, sku, attributes").in("id", variantIds)
          : Promise.resolve({ data: [] as { id: string; sku: string | null; attributes: unknown }[] }),
      ]);

      const productMap = new Map((prodRes.data ?? []).map((p) => [p.id, p]));
      const variantMap = new Map((varRes.data ?? []).map((v) => [v.id, v]));

      for (const li of lineItems ?? []) {
        const product = li.product_id ? productMap.get(li.product_id) : undefined;
        const variant = li.variant_id ? variantMap.get(li.variant_id) : undefined;
        let name = product?.name ?? "Unknown product";
        if (variant?.attributes && typeof variant.attributes === "object") {
          const attrStr = Object.values(variant.attributes as Record<string, unknown>)
            .filter(Boolean).join(" / ");
          if (attrStr) name += ` — ${attrStr}`;
        }
        const sku = variant?.sku ?? product?.sku ?? null;
        const arr = itemsByOrder.get(li.order_id) ?? [];
        arr.push({
          product_name: name,
          sku,
          quantity: Number(li.quantity || 0),
          unit_price: Number(li.unit_price || 0),
        });
        itemsByOrder.set(li.order_id, arr);
      }
    }

    const items: StaffDrilldownOrder[] = filtered.map((r) => ({
      id: r.id,
      order_number: r.order_number,
      invoice_number: r.invoice_number ?? null,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      status: r.status,
      subtotal: Number(r.subtotal || 0),
      discount_amount: Number(r.discount_amount || 0),
      delivery_charge: Number(r.delivery_charge || 0),
      advance_amount: Number(r.advance_amount || 0),
      total_amount: Number(r.total_amount || 0),
      source: r.source || "manual",
      created_at: r.created_at,
      items: itemsByOrder.get(r.id) ?? [],
    }));

    return { items };
  });
