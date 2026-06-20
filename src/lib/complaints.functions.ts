import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const COMPLAINT_CATEGORIES = [
  "damage",
  "wrong_item",
  "missing_item",
  "late_delivery",
  "refund_pending",
  "quality",
  "behavior",
  "other",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_SEVERITIES = ["low", "medium", "high"] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_STATUSES = ["open", "in_progress", "resolved", "dismissed"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  damage: "Damage",
  wrong_item: "Wrong Item",
  missing_item: "Missing Item",
  late_delivery: "Late Delivery",
  refund_pending: "Refund Pending",
  quality: "Quality",
  behavior: "Behavior",
  other: "Other",
};

export const SEVERITY_LABEL: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const SEVERITY_TONE: Record<ComplaintSeverity, string> = {
  low: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export const STATUS_TONE: Record<ComplaintStatus, string> = {
  open: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  dismissed: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export type ComplaintRow = {
  id: string;
  phone: string;
  customer_name: string | null;
  order_id: string | null;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  note: string;
  resolution_note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_at: string;
  resolved_at: string | null;
  order_number: number | null;
};

const phoneSchema = z.string().trim().min(1).max(64);

async function nameMap(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return out;
  const { data } = await supabase.rpc("get_user_display_names", { p_ids: uniq });
  for (const n of (data ?? []) as any[]) if (n?.id) out.set(n.id, n.display_name);
  return out;
}

async function orderNumberMap(supabase: any, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return out;
  const { data } = await supabase.from("orders").select("id, order_number").in("id", uniq);
  for (const r of (data ?? []) as any[]) if (r?.id) out.set(r.id, r.order_number);
  return out;
}

function enrich(rows: any[], names: Map<string, string>, orderNums: Map<string, number>): ComplaintRow[] {
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    customer_name: r.customer_name,
    order_id: r.order_id,
    category: r.category,
    severity: r.severity,
    status: r.status,
    note: r.note,
    resolution_note: r.resolution_note,
    created_by: r.created_by,
    created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
    resolved_by: r.resolved_by,
    resolved_by_name: r.resolved_by ? names.get(r.resolved_by) ?? null : null,
    created_at: r.created_at,
    resolved_at: r.resolved_at,
    order_number: r.order_id ? orderNums.get(r.order_id) ?? null : null,
  }));
}

export const listComplaintsByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("customer_complaints")
      .select("*")
      .eq("phone", data.phone.trim())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const [names, orderNums] = await Promise.all([
      nameMap(supabase, list.flatMap((r) => [r.created_by, r.resolved_by])),
      orderNumberMap(supabase, list.map((r) => r.order_id)),
    ]);
    return enrich(list, names, orderNums);
  });

export const countOpenComplaintsByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count, error } = await supabase
      .from("customer_complaints")
      .select("id", { count: "exact", head: true })
      .eq("phone", data.phone.trim())
      .in("status", ["open", "in_progress"]);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const listComplaints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      q: z.string().trim().max(128).optional().nullable(),
      status: z.enum(COMPLAINT_STATUSES).optional().nullable(),
      category: z.enum(COMPLAINT_CATEGORIES).optional().nullable(),
      severity: z.enum(COMPLAINT_SEVERITIES).optional().nullable(),
      created_by: z.string().uuid().optional().nullable(),
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(2000).default(200),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("customer_complaints").select("*");
    if (data.q) {
      const s = data.q.replace(/[%_,]/g, " ").trim();
      if (s) q = q.or(`phone.ilike.%${s}%,customer_name.ilike.%${s}%,note.ilike.%${s}%`);
    }
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    if (data.severity) q = q.eq("severity", data.severity);
    if (data.created_by) q = q.eq("created_by", data.created_by);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const [names, orderNums] = await Promise.all([
      nameMap(supabase, list.flatMap((r) => [r.created_by, r.resolved_by])),
      orderNumberMap(supabase, list.map((r) => r.order_id)),
    ]);
    return enrich(list, names, orderNums);
  });

export const createComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone: phoneSchema,
      customer_name: z.string().trim().max(255).optional().nullable(),
      order_id: z.string().uuid().optional().nullable(),
      category: z.enum(COMPLAINT_CATEGORIES),
      severity: z.enum(COMPLAINT_SEVERITIES).default("medium"),
      note: z.string().trim().min(1).max(4000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("customer_complaints")
      .insert({
        phone: data.phone.trim(),
        customer_name: data.customer_name?.trim() || null,
        order_id: data.order_id || null,
        category: data.category,
        severity: data.severity,
        note: data.note,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(COMPLAINT_STATUSES).optional(),
      severity: z.enum(COMPLAINT_SEVERITIES).optional(),
      category: z.enum(COMPLAINT_CATEGORIES).optional(),
      note: z.string().trim().min(1).max(4000).optional(),
      resolution_note: z.string().trim().max(4000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, any> = {};
    if (data.status) patch.status = data.status;
    if (data.severity) patch.severity = data.severity;
    if (data.category) patch.category = data.category;
    if (data.note) patch.note = data.note;
    if (data.resolution_note !== undefined) patch.resolution_note = data.resolution_note;
    if (data.status === "resolved" || data.status === "dismissed") {
      patch.resolved_by = userId;
      patch.resolved_at = new Date().toISOString();
    } else if (data.status === "open" || data.status === "in_progress") {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }
    const { error } = await supabase.from("customer_complaints").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("customer_complaints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getComplaintStaffStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("customer_complaints").select("created_by, status, category, severity");
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q.limit(10000);
    if (error) throw new Error(error.message);
    const byStaff = new Map<string, { total: number; open: number; resolved: number }>();
    const byCategory = new Map<string, number>();
    for (const r of (rows ?? []) as any[]) {
      const k = r.created_by ?? "unknown";
      const cur = byStaff.get(k) ?? { total: 0, open: 0, resolved: 0 };
      cur.total += 1;
      if (r.status === "open" || r.status === "in_progress") cur.open += 1;
      if (r.status === "resolved") cur.resolved += 1;
      byStaff.set(k, cur);
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
    }
    const names = await nameMap(supabase, Array.from(byStaff.keys()));
    const staff = Array.from(byStaff.entries()).map(([id, v]) => ({
      id,
      name: names.get(id) ?? "Unknown",
      ...v,
    })).sort((a, b) => b.total - a.total);
    const categories = Array.from(byCategory.entries())
      .map(([category, count]) => ({ category: category as ComplaintCategory, count }))
      .sort((a, b) => b.count - a.count);
    return { staff, categories };
  });
