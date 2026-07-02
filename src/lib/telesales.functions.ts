import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StatusSchema = z.enum(["pending", "complete", "hold"]);
const ActionSchema = z.enum([
  "phone_off",
  "not_received",
  "will_take_later",
  "fraud",
  "call_back_later",
]);

function normalizePhone(p: string): string | null {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(-11);
}

async function loadImportedCustomersByNormalizedPhone(
  supabase: { from: (table: string) => any },
  phones: string[],
) {
  const requested = new Set(
    phones
      .map((phone) => normalizePhone(phone))
      .filter((phone): phone is string => !!phone),
  );
  if (requested.size === 0) return [] as Array<{ id: string; phone: string }>;

  const matched: Array<{ id: string; phone: string }> = [];
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();
  const PAGE_SIZE = 1000;

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("imported_customers")
      .select("id, phone")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ id: string; phone: string }>;
    for (const row of rows) {
      const normalized = normalizePhone(row.phone);
      if (!normalized || !requested.has(normalized) || seenIds.has(row.id)) continue;
      matched.push(row);
      seenIds.add(row.id);
      seenPhones.add(normalized);
    }

    if (rows.length < PAGE_SIZE || seenPhones.size >= requested.size) break;
  }

  return matched;
}

async function insertTelesalesAssignmentsInChunks(
  supabase: { from: (table: string) => any },
  payload: Array<{ customer_id: string; assigned_to: string | null; created_by: string; status?: "pending" }>,
) {
  if (payload.length === 0) return 0;

  const CHUNK_SIZE = 200;
  let created = 0;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const slice = payload.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from("telesales_assignments")
      .insert(slice)
      .select("id");
    if (error) throw new Error(error.message);
    created += data?.length ?? slice.length;
  }

  return created;
}

export type TeleAssignment = {
  id: string;
  customer_id: string;
  name: string | null;
  phone: string;
  address: string | null;
  status: "pending" | "complete" | "hold";
  last_action: z.infer<typeof ActionSchema> | null;
  note: string | null;
  last_contacted_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  order_count: number;
  complaint_count: number;
  order_id: string | null;
  duplicate_count: number;
  review_summary: { count: number; avg: number } | null;
};

export type TeleAssignmentsPage = {
  rows: TeleAssignment[];
  total: number;
};

function isMissingReviewTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  const message = (e?.message ?? "").toLowerCase();
  return e?.code === "PGRST205"
    || (message.includes("customer_reviews") && message.includes("schema cache"))
    || message.includes('relation "public.customer_reviews" does not exist')
    || message.includes('relation "customer_reviews" does not exist');
}

export const listTelesalesAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      status: StatusSchema.optional(),
      action: ActionSchema.optional(),
      orderTab: z.boolean().optional(),
      assignedTo: z.string().uuid().nullable().optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = (roleRow?.role === "admin" || roleRow?.role === "business_owner");

    const search = (data.search ?? "").trim();
    let searchCustomerIds: string[] | null = null;
    if (search) {
      const safe = search.replace(/[%,()]/g, "");
      const { data: customerMatches, error: customerMatchError } = await supabase
        .from("imported_customers")
        .select("id")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%`)
        .limit(5000);
      if (customerMatchError) throw new Error(customerMatchError.message);
      searchCustomerIds = Array.from(new Set(((customerMatches ?? []) as Array<{ id: string }>).map((r) => r.id)));
      if (searchCustomerIds.length === 0) return { rows: [], total: 0 } as TeleAssignmentsPage;
    }

    const applyFilters = (qb: any) => {
      if (data.orderTab) qb = qb.not("order_id", "is", null);
      else if (data.action) qb = qb.eq("last_action", data.action);
      else if (data.status === "pending") qb = qb.eq("status", "pending").is("last_action", null);
      else if (data.status) qb = qb.eq("status", data.status);
      if (data.assignedTo === null) qb = qb.is("assigned_to", null);
      else if (data.assignedTo) qb = qb.eq("assigned_to", data.assignedTo);
      else if (!isAdmin) qb = qb.eq("assigned_to", userId);
      if (searchCustomerIds) qb = qb.in("customer_id", searchCustomerIds);
      return qb;
    };

    const offset = (data.page - 1) * data.limit;
    const rowsQuery = applyFilters(
      supabase
        .from("telesales_assignments")
        .select("id, customer_id, status, last_action, note, last_contacted_at, assigned_to, order_id" as never)
        .order("updated_at", { ascending: false })
        .range(offset, offset + data.limit - 1),
    );
    const countQuery = applyFilters(
      supabase
        .from("telesales_assignments")
        .select("id", { count: "exact", head: true }),
    );

    const [{ data: rows, error }, { count, error: countError }] = await Promise.all([rowsQuery, countQuery]);
    if (error) throw new Error(error.message);
    if (countError) throw new Error(countError.message);

    const list = ((rows ?? []) as unknown) as Array<{
      id: string; customer_id: string; status: string;
      last_action: string | null; note: string | null;
      last_contacted_at: string | null; assigned_to: string | null;
      order_id: string | null;
    }>;
    if (list.length === 0) return { rows: [], total: count ?? 0 } as TeleAssignmentsPage;

    const customerIds = [...new Set(list.map((r) => r.customer_id))];
    const userIds = [...new Set(list.map((r) => r.assigned_to).filter(Boolean) as string[])];

    const [{ data: customers }, profiles, dupRowsRes] = await Promise.all([
      supabase.from("imported_customers")
        .select("id, name, phone, address").in("id", customerIds),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
      supabase.from("telesales_assignments")
        .select("customer_id").in("customer_id", customerIds),
    ]);

    const cMap = new Map((customers ?? []).map((c) => [c.id, c]));
    const pMap = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email || "User"]));
    const dupMap = new Map<string, number>();
    for (const r of (dupRowsRes.data ?? []) as Array<{ customer_id: string }>) {
      dupMap.set(r.customer_id, (dupMap.get(r.customer_id) ?? 0) + 1);
    }

    const phones = (customers ?? []).map((c) => normalizePhone(c.phone)).filter(Boolean) as string[];
    const rawPhones = (customers ?? []).map((c) => c.phone).filter(Boolean) as string[];
    const countMap = new Map<string, number>();
    const complaintMap = new Map<string, number>();
    const reviewMap = new Map<string, { sum: number; ids: Set<string> }>();
    if (phones.length) {
      const [{ data: orderPhones }, { data: complaints }, reviewRes] = await Promise.all([
        supabase.from("orders").select("phone_normalized").in("phone_normalized", phones),
        rawPhones.length
          ? supabase.from("customer_complaints").select("phone, status").in("phone", rawPhones)
          : Promise.resolve({ data: [] as { phone: string; status: string }[] }),
        rawPhones.length
          ? (supabase as any).from("customer_reviews").select("id, phone, rating").in("phone", rawPhones)
          : Promise.resolve({ data: [] as { id: string; phone: string; rating: number }[], error: null }),
      ]);
      for (const r of orderPhones ?? []) {
        const k = r.phone_normalized as string | null;
        if (k) countMap.set(k, (countMap.get(k) ?? 0) + 1);
      }
      for (const c of (complaints ?? []) as { phone: string; status: string }[]) {
        const n = normalizePhone(c.phone);
        if (!n) continue;
        complaintMap.set(n, (complaintMap.get(n) ?? 0) + 1);
      }
      if (!reviewRes.error) {
        for (const review of (reviewRes.data ?? []) as Array<{ id: string; phone: string; rating: number }>) {
          const n = normalizePhone(review.phone);
          if (!n) continue;
          const cur = reviewMap.get(n) ?? { sum: 0, ids: new Set<string>() };
          if (!cur.ids.has(review.id)) {
            cur.ids.add(review.id);
            cur.sum += Number(review.rating);
          }
          reviewMap.set(n, cur);
        }
      } else if (!isMissingReviewTableError(reviewRes.error)) {
        throw new Error(reviewRes.error.message);
      }
    }

    const result: TeleAssignment[] = list.map((r) => {
      const c = cMap.get(r.customer_id);
      const norm = c ? normalizePhone(c.phone) : null;
      const reviews = norm ? reviewMap.get(norm) : undefined;
      return {
        id: r.id,
        customer_id: r.customer_id,
        name: c?.name ?? null,
        phone: c?.phone ?? "",
        address: c?.address ?? null,
        status: r.status as "pending" | "complete" | "hold",
        last_action: r.last_action as z.infer<typeof ActionSchema> | null,
        note: r.note,
        last_contacted_at: r.last_contacted_at,
        assigned_to: r.assigned_to,
        assigned_to_name: r.assigned_to ? pMap.get(r.assigned_to) ?? null : null,
        order_count: norm ? countMap.get(norm) ?? 0 : 0,
        complaint_count: norm ? complaintMap.get(norm) ?? 0 : 0,
        order_id: r.order_id ?? null,
        duplicate_count: dupMap.get(r.customer_id) ?? 1,
        review_summary: reviews && reviews.ids.size > 0
          ? { count: reviews.ids.size, avg: reviews.sum / reviews.ids.size }
          : null,
      };
    });

    return { rows: result, total: count ?? result.length } as TeleAssignmentsPage;
  });

export const getTelesalesCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignedTo: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = (roleRow?.role === "admin" || roleRow?.role === "business_owner");

    const base = () => {
      let q = supabase
        .from("telesales_assignments")
        .select("id", { count: "exact", head: true });
      if (data.assignedTo === null) q = q.is("assigned_to", null);
      else if (data.assignedTo) q = q.eq("assigned_to", data.assignedTo);
      else if (!isAdmin) q = q.eq("assigned_to", userId);
      return q;
    };

    const exactCount = async (apply: (qb: any) => any) => {
      const { count, error } = await apply(base());
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [all, order, pending, complete, hold, phone_off, not_received, will_take_later, fraud, call_back_later] = await Promise.all([
      exactCount((q) => q),
      exactCount((q) => q.not("order_id", "is", null)),
      exactCount((q) => q.eq("status", "pending").is("last_action", null)),
      exactCount((q) => q.eq("status", "complete")),
      exactCount((q) => q.eq("status", "hold")),
      exactCount((q) => q.eq("last_action", "phone_off")),
      exactCount((q) => q.eq("last_action", "not_received")),
      exactCount((q) => q.eq("last_action", "will_take_later")),
      exactCount((q) => q.eq("last_action", "fraud")),
      exactCount((q) => q.eq("last_action", "call_back_later")),
    ]);

    return {
      all, order,
      pending, complete, hold, total: all,
      phone_off, not_received, will_take_later, fraud, call_back_later,
    };
  });

export const markTelesalesOrderTaken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      assignmentId: z.string().uuid(),
      orderId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("telesales_assignments")
      .update({
        order_id: data.orderId,
        order_taken_at: new Date().toISOString(),
        status: "complete",
        last_action: null,
        last_contacted_at: new Date().toISOString(),
      } as never)
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    await supabase.from("telesales_call_logs").insert({
      assignment_id: data.assignmentId,
      status_to: "complete",
      note: `Order taken (${data.orderId})`,
      created_by: userId,
    });
    return { ok: true };
  });

export const assignTelesalesCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      customerIds: z.array(z.string().uuid()).min(1).max(1000),
      assignedTo: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if ((roleRow?.role !== "admin" && roleRow?.role !== "business_owner")) throw new Error("Only admins can assign customers");

    // Always insert NEW assignments — duplicates are allowed (same customer
    // to multiple users, or even to the same user again).
    const payload = data.customerIds.map((customer_id) => ({
      customer_id,
      assigned_to: data.assignedTo,
      created_by: userId,
    }));

    const inserted = await insertTelesalesAssignmentsInChunks(supabase, payload);
    return { inserted, updated: 0 };
  });

// Bulk-delete telesales assignments — for one user, or every user when
// `userId` is null. Cascades to telesales_call_logs.
export const clearTelesalesAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: n, error } = await supabase.rpc(
      "clear_telesales_assignments" as never,
      { _staff: data.userId ?? undefined } as never,
    );
    if (error) throw new Error(error.message);
    return { deleted: (n as number) ?? 0 };
  });

export const reassignTelesalesAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      assignedTo: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if ((roleRow?.role !== "admin" && roleRow?.role !== "business_owner")) throw new Error("Only admins can reassign customers");

    const { error } = await supabase
      .from("telesales_assignments")
      .update({ assigned_to: data.assignedTo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    let targetName: string | null = null;
    if (data.assignedTo) {
      const { data: p } = await supabase
        .from("profiles").select("full_name, email").eq("id", data.assignedTo).maybeSingle();
      targetName = p?.full_name || p?.email || "User";
    }

    await supabase.from("telesales_call_logs").insert({
      assignment_id: data.id,
      reassigned_to: data.assignedTo,
      note: data.assignedTo ? `Reassigned to ${targetName}` : "Unassigned",
      created_by: userId,
    });

    return { ok: true, assignedToName: targetName };
  });

export const updateTelesalesAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: StatusSchema.optional(),
      action: ActionSchema.optional(),
      note: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      last_contacted_at: string;
      status?: "pending" | "complete" | "hold";
      last_action?: z.infer<typeof ActionSchema> | null;
      note?: string | null;
    } = { last_contacted_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.action !== undefined) patch.last_action = data.action;
    if (data.note !== undefined) patch.note = data.note;

    const { data: updated, error } = await supabase
      .from("telesales_assignments").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);

    await supabase.from("telesales_call_logs").insert({
      assignment_id: data.id,
      action: data.action ?? null,
      status_to: data.status ?? null,
      note: data.note ?? null,
      created_by: userId,
    });
    return updated;
  });

export const bulkUpdateTelesalesStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      status: StatusSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("telesales_assignments")
      .update(
        { status: data.status, last_action: null, last_contacted_at: new Date().toISOString() },
        { count: "exact" },
      )
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

export type TeleDuplicateRow = {
  id: string;
  status: "pending" | "complete" | "hold";
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  last_contacted_at: string | null;
  order_id: string | null;
  is_mine: boolean;
};

export const getTelesalesDuplicateAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TeleDuplicateRow[]> => {
    const { userId } = context;
    // Cross-user visibility for coordination — bypass per-user RLS filter.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("telesales_assignments")
      .select("id, status, assigned_to, created_by, created_at, last_contacted_at, order_id")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = new Set<string>();
    for (const r of rows ?? []) {
      if (r.assigned_to) ids.add(r.assigned_to);
      if (r.created_by) ids.add(r.created_by);
    }
    let nameMap = new Map<string, string>();
    if (ids.size > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id, full_name, email").in("id", Array.from(ids));
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || "User"]));
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      assigned_to: r.assigned_to,
      assigned_to_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
      created_by: r.created_by,
      created_by_name: r.created_by ? nameMap.get(r.created_by) ?? null : null,
      created_at: r.created_at,
      last_contacted_at: r.last_contacted_at,
      order_id: r.order_id,
      is_mine: r.assigned_to === userId,
    }));
  });

export const unassignMyTelesalesAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: rErr } = await supabase
      .from("telesales_assignments")
      .select("id, assigned_to")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("Assignment not found");
    if (row.assigned_to !== userId) throw new Error("You can only unassign your own rows");

    const { error } = await supabase
      .from("telesales_assignments")
      .update({ assigned_to: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("telesales_call_logs").insert({
      assignment_id: data.id,
      reassigned_to: null,
      note: "Self-unassigned",
      created_by: userId,
    });
    return { ok: true };
  });

export const getTelesalesDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: a, error } = await supabase
      .from("telesales_assignments")
      .select("id, customer_id, status, last_action, note, last_contacted_at, assigned_to, created_at")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);

    const [{ data: c }, { data: logs }] = await Promise.all([
      supabase.from("imported_customers").select("name, phone, address").eq("id", a.customer_id).maybeSingle(),
      supabase.from("telesales_call_logs")
        .select("id, action, status_to, note, created_by, created_at, reassigned_to")
        .eq("assignment_id", data.id).order("created_at", { ascending: false }).limit(100),
    ]);

    const norm = c ? normalizePhone(c.phone) : null;
    let orders: Array<{
      id: string; order_number: number; status: string; total_amount: number; created_at: string;
    }> = [];
    if (norm) {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, order_number, status, total_amount, created_at")
        .eq("phone_normalized", norm).order("created_at", { ascending: false }).limit(50);
      orders = (ords ?? []).map((o) => ({
        id: o.id, order_number: o.order_number, status: o.status as string,
        total_amount: Number(o.total_amount), created_at: o.created_at,
      }));
    }

    const userIds = [...new Set([
      a.assigned_to,
      ...(logs ?? []).map((l) => l.created_by),
      ...(logs ?? []).map((l) => l.reassigned_to),
    ].filter(Boolean) as string[])];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "User"]));

    return {
      assignment: {
        ...a,
        assigned_to_name: a.assigned_to ? pMap.get(a.assigned_to) ?? null : null,
      },
      customer: c ?? null,
      orders,
      logs: (logs ?? []).map((l) => ({
        ...l,
        created_by_name: l.created_by ? pMap.get(l.created_by) ?? null : null,
        reassigned_to_name: l.reassigned_to ? pMap.get(l.reassigned_to) ?? null : null,
      })),
    };
  });

export const listTelesalesStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase
      .from("user_roles").select("user_id, role").in("role", ["staff", "manager", "admin", "business_owner"]);
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (!ids.length) return [];
    const { data: profiles } = await supabase
      .from("profiles").select("id, full_name, email").in("id", ids);
    return (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "User",
    }));
  });

export const importTelesalesCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(z.object({
        name: z.string().max(255).optional().nullable(),
        phone: z.string().min(1).max(50),
        address: z.string().max(1000).optional().nullable(),
      })).min(1).max(5000),
      assignedTo: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if ((roleRow?.role !== "admin" && roleRow?.role !== "business_owner")) throw new Error("Only admins can import customers");

    // Normalize + dedupe within payload
    const seen = new Map<string, { name: string | null; phone: string; address: string | null }>();
    let skipped = 0;
    for (const r of data.rows) {
      const n = normalizePhone(r.phone);
      if (!n) { skipped++; continue; }
      if (!seen.has(n)) {
        seen.set(n, {
          name: r.name?.trim() || null,
          phone: r.phone.trim(),
          address: r.address?.trim() || null,
        });
      }
    }
    const normalizedPhones = [...seen.keys()];
    if (normalizedPhones.length === 0) {
      return { imported: 0, skipped, alreadyExisted: 0, assignmentsCreated: 0, assignmentsUpdated: 0 };
    }

    // Find existing imported_customers matching these normalized phones
    const requestedPhones = [...seen.values()].map((v) => v.phone);
    const existing = await loadImportedCustomersByNormalizedPhone(supabase, requestedPhones);
    const existingByNorm = new Map<string, string>();
    for (const e of existing ?? []) {
      const n = normalizePhone(e.phone);
      if (n && seen.has(n) && !existingByNorm.has(n)) existingByNorm.set(n, e.id);
    }

    const existingIdsBeforeInsert = new Set(existingByNorm.values());
    const alreadyExisted = existingByNorm.size;
    const toInsert = [...seen.entries()]
      .filter(([n]) => !existingByNorm.has(n))
      .map(([, v]) => ({ ...v, created_by: userId }));

    let insertedIds: string[] = [];
    if (toInsert.length) {
      const { data: ins, error } = await supabase
        .from("imported_customers").insert(toInsert).select("id");
      if (error) {
        if (!error.message.toLowerCase().includes("duplicate key value violates unique constraint")) {
          throw new Error(error.message);
        }
      } else {
        insertedIds = (ins ?? []).map((r) => r.id);
      }
      const refreshed = await loadImportedCustomersByNormalizedPhone(supabase, requestedPhones);
      for (const row of refreshed) {
        const n = normalizePhone(row.phone);
        if (n && seen.has(n) && !existingByNorm.has(n)) existingByNorm.set(n, row.id);
      }
      insertedIds = [...existingByNorm.values()].filter((id) => !existingIdsBeforeInsert.has(id));
    }

    const allIds = [...new Set([...existingByNorm.values(), ...insertedIds])];
    if (allIds.length === 0) {
      return { imported: 0, skipped, alreadyExisted: existingByNorm.size, assignmentsCreated: 0, assignmentsUpdated: 0 };
    }

    // Always insert a NEW assignment row for every customer in the payload —
    // duplicates are allowed by design (same customer can sit in multiple
    // staff workboards).
    const assignInsert = allIds.map((customer_id) => ({
      customer_id,
      assigned_to: data.assignedTo ?? null,
      created_by: userId,
      status: "pending" as const,
    }));

    const assignmentsCreated = await insertTelesalesAssignmentsInChunks(supabase, assignInsert);
    const assignmentsUpdated = 0;

    return {
      imported: insertedIds.length,
      skipped,
      alreadyExisted,
      assignmentsCreated,
      assignmentsUpdated,
    };
  });

export const listSystemCustomersForTelesales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      search: z.string().max(200).optional(),
      source: z.string().max(100).optional(),
      productId: z.string().uuid().optional(),
      orderSourceId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      onlyCancelled: z.boolean().optional(),
      hasDiscount: z.boolean().optional(),
      limit: z.number().min(1).max(1000).default(300),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Bound the order scan: take a recent window large enough to dedupe to
    // `limit` unique customers (output is capped at data.limit, max 1000).
    const scanCap = Math.min(2000, Math.max(800, data.limit * 5));
    let oq = supabase.from("orders").select(
      "customer_name, customer_phone, customer_address, source, status, created_at, phone_normalized, order_source_id, discount_amount, order_items(product_id)",
    ).order("created_at", { ascending: false }).limit(scanCap);
    if (data.source) oq = oq.eq("source", data.source);
    if (data.orderSourceId) oq = oq.eq("order_source_id", data.orderSourceId);
    if (data.dateFrom) oq = oq.gte("created_at", data.dateFrom);
    if (data.dateTo) oq = oq.lte("created_at", data.dateTo);
    if (data.onlyCancelled) oq = oq.eq("status", "cancelled");

    const { data: orders, error } = await oq;
    if (error) throw new Error(error.message);

    const map = new Map<string, {
      name: string | null; phone: string; address: string | null;
      order_count: number; cancelled: number; sources: Set<string>;
      hasDiscount: boolean; productIds: Set<string>;
    }>();
    for (const o of orders ?? []) {
      const norm = (o as { phone_normalized: string | null }).phone_normalized || normalizePhone(o.customer_phone);
      if (!norm) continue;
      let m = map.get(norm);
      if (!m) {
        m = { name: o.customer_name, phone: o.customer_phone, address: o.customer_address, order_count: 0, cancelled: 0, sources: new Set(), hasDiscount: false, productIds: new Set() };
        map.set(norm, m);
      }
      m.order_count++;
      if (o.source) m.sources.add(o.source);
      if (o.status === "cancelled") m.cancelled++;
      if (Number(o.discount_amount ?? 0) > 0) m.hasDiscount = true;
      for (const it of (o.order_items ?? []) as { product_id: string }[]) {
        if (it.product_id) m.productIds.add(it.product_id);
      }
    }

    let list = [...map.entries()].map(([k, v]) => ({
      phone_normalized: k,
      name: v.name, phone: v.phone, address: v.address,
      order_count: v.order_count,
      cancelled_count: v.cancelled,
      sources: [...v.sources],
      has_discount: v.hasDiscount,
      product_ids: [...v.productIds],
    }));

    if (data.productId) list = list.filter((r) => r.product_ids.includes(data.productId!));
    if (data.hasDiscount) list = list.filter((r) => r.has_discount);
    if (data.search) {
      const s = data.search.toLowerCase();
      list = list.filter((r) =>
        (r.name ?? "").toLowerCase().includes(s) ||
        r.phone.toLowerCase().includes(s) ||
        (r.address ?? "").toLowerCase().includes(s),
      );
    }
    return list.slice(0, data.limit);
  });

export const assignSystemCustomersToTelesales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      customers: z.array(z.object({
        name: z.string().max(255).nullable(),
        phone: z.string().min(1).max(50),
        address: z.string().max(1000).nullable(),
      })).min(1).max(1000),
      assignedTo: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if ((roleRow?.role !== "admin" && roleRow?.role !== "business_owner")) throw new Error("Only admins can assign customers");

    const seen = new Map<string, { name: string | null; phone: string; address: string | null }>();
    for (const c of data.customers) {
      const n = normalizePhone(c.phone);
      if (n && !seen.has(n)) seen.set(n, c);
    }
    if (seen.size === 0) return { created: 0, updated: 0, totalCustomers: 0 };

    const requestedPhones = [...seen.values()].map((v) => v.phone);
    const existing = await loadImportedCustomersByNormalizedPhone(supabase, requestedPhones);
    const existingByNorm = new Map<string, string>();
    for (const e of existing ?? []) {
      const n = normalizePhone(e.phone);
      if (n && seen.has(n) && !existingByNorm.has(n)) existingByNorm.set(n, e.id);
    }

    const existingIdsBeforeInsert = new Set(existingByNorm.values());
    const toInsert = [...seen.entries()]
      .filter(([n]) => !existingByNorm.has(n))
      .map(([, v]) => ({ name: v.name, phone: v.phone, address: v.address, created_by: userId }));

    let insertedIds: string[] = [];
    if (toInsert.length) {
      const { data: ins, error } = await supabase
        .from("imported_customers").insert(toInsert).select("id");
      if (error) {
        if (!error.message.toLowerCase().includes("duplicate key value violates unique constraint")) {
          throw new Error(error.message);
        }
      } else {
        insertedIds = (ins ?? []).map((r) => r.id);
      }
      const refreshed = await loadImportedCustomersByNormalizedPhone(supabase, requestedPhones);
      for (const row of refreshed) {
        const n = normalizePhone(row.phone);
        if (n && seen.has(n) && !existingByNorm.has(n)) existingByNorm.set(n, row.id);
      }
      insertedIds = [...existingByNorm.values()].filter((id) => !existingIdsBeforeInsert.has(id));
    }

    const allIds = [...new Set([...existingByNorm.values(), ...insertedIds])];

    // Always insert NEW assignments — duplicates allowed.
    const assignPayload = allIds.map((customer_id) => ({
      customer_id,
      assigned_to: data.assignedTo,
      created_by: userId,
    }));

    const created = await insertTelesalesAssignmentsInChunks(supabase, assignPayload);
    return { created, updated: 0, totalCustomers: allIds.length };
  });

export const listUnassignedCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().max(200).optional(), limit: z.number().min(1).max(500).default(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: assigned } = await supabase
      .from("telesales_assignments")
      .select("customer_id, assigned_to");

    let q = supabase.from("imported_customers")
      .select("id, name, phone, address").order("created_at", { ascending: false }).limit(data.limit);
    if (data.search) {
      const s = data.search.trim();
      const digits = s.replace(/\D/g, "");
      const phoneNeedle = digits.length >= 8 ? digits.slice(-8) : digits;
      const parts = [`name.ilike.%${s}%`, `address.ilike.%${s}%`];
      parts.push(`phone.ilike.%${digits.length >= 3 ? phoneNeedle : s}%`);
      q = q.or(parts.join(","));
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const phones = (rows ?? []).map((r) => normalizePhone(r.phone)).filter(Boolean) as string[];
    const countMap = new Map<string, number>();
    const assignedMap = new Map((assigned ?? []).map((a) => [a.customer_id, a.assigned_to]));
    const assignedIds = [...new Set((assigned ?? []).map((a) => a.assigned_to).filter(Boolean) as string[])];
    const { data: profiles } = assignedIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", assignedIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const assigneeMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "User"]));
    if (phones.length) {
      const { data: orderPhones } = await supabase
        .from("orders").select("phone_normalized").in("phone_normalized", phones);
      for (const r of orderPhones ?? []) {
        const k = r.phone_normalized as string | null;
        if (k) countMap.set(k, (countMap.get(k) ?? 0) + 1);
      }
    }

    return (rows ?? [])
      .map((r) => {
        const n = normalizePhone(r.phone);
        const assignedTo = assignedMap.get(r.id) ?? null;
        return {
          id: r.id, name: r.name, phone: r.phone, address: r.address,
          order_count: n ? countMap.get(n) ?? 0 : 0,
          assigned_to: assignedTo,
          assigned_to_name: assignedTo ? assigneeMap.get(assignedTo) ?? null : null,
        };
      });
  });

const REVENUE_STATUSES = ["processing", "ready_to_ship", "shipped", "completed"] as const satisfies readonly ("processing" | "ready_to_ship" | "shipped" | "completed")[];
const METRIC_KEYS = [
  "assigned", "pending", "complete", "hold",
  "phone_off", "not_received", "will_take_later", "fraud", "call_back_later",
  "orders", "revenue",
] as const;

export type TeleStaffReportRow = {
  staff_id: string | null;
  staff_name: string;
  assigned: number;
  pending: number;
  complete: number;
  hold: number;
  phone_off: number;
  not_received: number;
  will_take_later: number;
  fraud: number;
  call_back_later: number;
  orders: number;
  revenue: number;
  completion_pct: number;
};

export const getTelesalesStaffReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TeleStaffReportRow[]> => {
    const { supabase } = context;
    // Asia/Dhaka (+06:00) day boundaries so "today" matches the user's local day
    const fromIso = data.from ? `${data.from}T00:00:00+06:00` : null;
    const toIso = data.to ? `${data.to}T23:59:59+06:00` : null;

    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["staff", "manager", "admin", "business_owner"]);
    const seededStaffIds = [...new Set((staffRoles ?? []).map((row) => row.user_id).filter(Boolean))];
    const { data: seededProfiles } = seededStaffIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", seededStaffIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const seededNameMap = new Map<string, string>();
    for (const profile of seededProfiles ?? []) {
      seededNameMap.set(profile.id, profile.full_name || profile.email || "User");
    }

    // 1) Assignments CREATED in range (for "assigned" count)
    let aq = supabase
      .from("telesales_assignments")
      .select("assigned_to, created_at");
    if (fromIso) aq = aq.gte("created_at", fromIso);
    if (toIso) aq = aq.lte("created_at", toIso);
    const { data: rangeAssignments, error: aErr } = await aq;
    if (aErr) throw new Error(aErr.message);

    // 2) Call logs in range — actual activity (status changes / actions) by staff
    let lq = supabase
      .from("telesales_call_logs")
      .select("action, status_to, created_by, created_at");
    if (fromIso) lq = lq.gte("created_at", fromIso);
    if (toIso) lq = lq.lte("created_at", toIso);
    const { data: logs } = await lq;

    // 3) ALL assignments (not date-filtered) — to map phone → staff for order attribution
    const { data: allAssignments } = await supabase
      .from("telesales_assignments")
      .select("customer_id, assigned_to")
      .not("assigned_to", "is", null);
    const custIds = [...new Set((allAssignments ?? []).map((a) => a.customer_id))];
    const { data: customers } = custIds.length
      ? await supabase.from("imported_customers").select("id, phone").in("id", custIds)
      : { data: [] as { id: string; phone: string }[] };
    const phoneByCustomer = new Map<string, string | null>();
    for (const c of customers ?? []) phoneByCustomer.set(c.id, normalizePhone(c.phone));
    const staffByPhone = new Map<string, string>(); // phone -> staff (latest wins)
    for (const a of allAssignments ?? []) {
      const p = phoneByCustomer.get(a.customer_id);
      if (p && a.assigned_to) staffByPhone.set(p, a.assigned_to);
    }

    // 4) Orders in range
    let oq = supabase
      .from("orders")
      .select("id, phone_normalized, total_amount, status, created_at, created_by, updated_by")
      .in("status", [...REVENUE_STATUSES]);
    if (fromIso) oq = oq.gte("created_at", fromIso);
    if (toIso) oq = oq.lte("created_at", toIso);
    const { data: orders } = await oq;

    // 4b) telesales_assignments that took an order in range (regardless of order date)
    let taq = supabase
      .from("telesales_assignments")
      .select("order_id, assigned_to, order_taken_at")
      .not("order_id", "is", null);
    if (fromIso) taq = taq.gte("order_taken_at", fromIso);
    if (toIso) taq = taq.lte("order_taken_at", toIso);
    const { data: takenAssigns } = await taq;
    const staffByOrderId = new Map<string, string>();
    for (const a of takenAssigns ?? []) {
      if (a.order_id && a.assigned_to) staffByOrderId.set(a.order_id as string, a.assigned_to as string);
    }

    // 4c) Also load the orders for taken assignments whose order falls outside the
    // date window, so a staff still gets credit for orders they took in-range.
    const extraOrderIds = [...staffByOrderId.keys()].filter(
      (oid) => !(orders ?? []).some((o) => o.id === oid),
    );
    let extraOrders: typeof orders = [];
    if (extraOrderIds.length) {
      const { data: eo } = await supabase
        .from("orders")
        .select("id, phone_normalized, total_amount, status, created_at, created_by, updated_by")
        .in("id", extraOrderIds)
        .in("status", [...REVENUE_STATUSES]);
      extraOrders = eo ?? [];
    }
    const allOrders = [...(orders ?? []), ...(extraOrders ?? [])];

    // Build per-staff buckets
    const buckets = new Map<string, TeleStaffReportRow>();
    const key = (id: string | null) => id ?? "__unassigned__";
    const ensure = (id: string | null): TeleStaffReportRow => {
      const k = key(id);
      let b = buckets.get(k);
      if (!b) {
        b = {
          staff_id: id, staff_name: "",
          assigned: 0, pending: 0, complete: 0, hold: 0,
          phone_off: 0, not_received: 0, will_take_later: 0, fraud: 0, call_back_later: 0,
          orders: 0, revenue: 0, completion_pct: 0,
        };
        buckets.set(k, b);
      }
      return b;
    };

    for (const staffId of seededStaffIds) {
      ensure(staffId);
    }

    // Assigned (created in range)
    for (const a of rangeAssignments ?? []) {
      ensure(a.assigned_to).assigned += 1;
    }

    // Activity from call logs (attributed to staff who took the action)
    for (const log of logs ?? []) {
      const b = ensure(log.created_by ?? null);
      if (log.status_to === "complete") b.complete += 1;
      else if (log.status_to === "hold") b.hold += 1;
      else if (log.status_to === "pending") b.pending += 1;
      if (log.action === "phone_off") b.phone_off += 1;
      else if (log.action === "not_received") b.not_received += 1;
      else if (log.action === "will_take_later") b.will_take_later += 1;
      else if (log.action === "fraud") b.fraud += 1;
      else if (log.action === "call_back_later") b.call_back_later += 1;
    }

    // Orders attribution priority:
    //   1. telesales_assignments.order_id — staff who "took" the order via telesales
    //   2. orders.created_by — staff who placed a manual order
    //   3. orders.updated_by — staff who processed a webhook/incomplete order
    //   4. staffByPhone — staff who had customer's phone in their telesales list
    // Dedupe by order id so an order is counted only once per staff.
    const countedByStaff = new Map<string, Set<string>>();
    for (const o of allOrders) {
      const p = o.phone_normalized;
      const staffId =
        staffByOrderId.get(o.id) ??
        (o.created_by as string | null) ??
        (o.updated_by as string | null) ??
        (p ? staffByPhone.get(p) ?? null : null);
      if (!staffId) continue;
      let seen = countedByStaff.get(staffId);
      if (!seen) { seen = new Set(); countedByStaff.set(staffId, seen); }
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const b = ensure(staffId);
      b.orders += 1;
      b.revenue += Number(o.total_amount) || 0;
    }

    // Resolve names
    const staffIds = [...buckets.keys()].filter((k) => k !== "__unassigned__");
    const { data: profs } = staffIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", staffIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const nameMap = new Map<string, string>(seededNameMap);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name || p.email || "User");

    const rows: TeleStaffReportRow[] = [];
    for (const [k, b] of buckets) {
      b.staff_name = k === "__unassigned__" ? "Unassigned" : (nameMap.get(k) ?? "User");
      const handled = b.complete + b.hold + b.pending;
      b.completion_pct = handled > 0 ? Math.round((b.complete / handled) * 100) : 0;
      rows.push(b);
    }
    rows.sort((a, b) => (b.orders + b.assigned) - (a.orders + a.assigned));
    return rows;
  });


export type TeleDrilldownItem =
  | {
      kind: "assignment";
      id: string;
      name: string | null;
      phone: string;
      address: string | null;
      status: string;
      last_action: string | null;
      note: string | null;
      updated_at: string;
    }
  | {
      kind: "order";
      id: string;
      invoice_number: string | null;
      customer_name: string;
      customer_phone: string;
      total_amount: number;
      status: string;
      created_at: string;
    };

export const getTelesalesDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      staffId: z.string().uuid().nullable(),
      metric: z.enum(METRIC_KEYS),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<TeleDrilldownItem[]> => {
    const { supabase } = context;
    const fromIso = data.from ? `${data.from}T00:00:00+06:00` : null;
    const toIso = data.to ? `${data.to}T23:59:59+06:00` : null;

    const ASSIGNMENT_METRICS = new Set([
      "assigned", "pending", "complete", "hold",
      "phone_off", "not_received", "will_take_later", "fraud", "call_back_later",
    ]);

    if (ASSIGNMENT_METRICS.has(data.metric)) {
      // "assigned" → assignments CREATED in range for staff
      // others → assignments touched by a matching log in range for staff
      let assignmentIds: string[] = [];

      if (data.metric === "assigned") {
        let aq = supabase.from("telesales_assignments")
          .select("id")
          .limit(500);
        if (data.staffId === null) aq = aq.is("assigned_to", null);
        else aq = aq.eq("assigned_to", data.staffId);
        if (fromIso) aq = aq.gte("created_at", fromIso);
        if (toIso) aq = aq.lte("created_at", toIso);
        const { data: rows, error } = await aq;
        if (error) throw new Error(error.message);
        assignmentIds = (rows ?? []).map((r) => r.id as string);
      } else {
        let lq = supabase.from("telesales_call_logs")
          .select("assignment_id, action, status_to, created_by, created_at")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (data.staffId === null) lq = lq.is("created_by", null);
        else lq = lq.eq("created_by", data.staffId);
        if (fromIso) lq = lq.gte("created_at", fromIso);
        if (toIso) lq = lq.lte("created_at", toIso);
        if (data.metric === "pending" || data.metric === "complete" || data.metric === "hold") {
          lq = lq.eq("status_to", data.metric);
        } else {
          lq = lq.eq("action", data.metric as z.infer<typeof ActionSchema>);
        }
        const { data: lrows, error } = await lq;
        if (error) throw new Error(error.message);
        assignmentIds = [...new Set((lrows ?? []).map((l) => l.assignment_id as string).filter(Boolean))];
      }

      if (assignmentIds.length === 0) return [];

      const { data: assigns } = await supabase
        .from("telesales_assignments")
        .select("id, customer_id, status, last_action, note, updated_at")
        .in("id", assignmentIds);
      const customerIds = [...new Set((assigns ?? []).map((a) => a.customer_id))];
      const { data: customers } = customerIds.length
        ? await supabase.from("imported_customers").select("id, name, phone, address").in("id", customerIds)
        : { data: [] as { id: string; name: string | null; phone: string; address: string | null }[] };
      const custMap = new Map<string, { name: string | null; phone: string; address: string | null }>();
      for (const c of customers ?? []) custMap.set(c.id, { name: c.name, phone: c.phone, address: c.address });

      return (assigns ?? []).map((r) => {
        const c = custMap.get(r.customer_id);
        return {
          kind: "assignment" as const,
          id: r.id,
          name: c?.name ?? null,
          phone: c?.phone ?? "—",
          address: c?.address ?? null,
          status: r.status as string,
          last_action: (r.last_action as string | null) ?? null,
          note: r.note ?? null,
          updated_at: r.updated_at as string,
        };
      });
    }

    // orders / revenue → orders in range placed by the staff (orders.created_by)
    // OR whose phone belongs to one of the staff's telesales assignments.
    let saq = supabase.from("telesales_assignments")
      .select("customer_id");
    if (data.staffId === null) saq = saq.is("assigned_to", null);
    else saq = saq.eq("assigned_to", data.staffId);
    const { data: staffAssigns } = await saq;
    const customerIds = [...new Set((staffAssigns ?? []).map((a) => a.customer_id))];
    const phones = new Set<string>();
    if (customerIds.length) {
      const { data: customers } = await supabase
        .from("imported_customers").select("id, phone").in("id", customerIds);
      for (const c of customers ?? []) {
        const n = normalizePhone(c.phone);
        if (n) phones.add(n);
      }
    }

    const collected = new Map<string, {
      id: string; invoice_number: string | null; customer_name: string;
      customer_phone: string; total_amount: number; status: string; created_at: string;
    }>();

    const fetchOrders = async (apply: (q: any) => any) => {
      let oq: any = supabase
        .from("orders")
        .select("id, invoice_number, customer_name, customer_phone, total_amount, status, created_at")
        .in("status", [...REVENUE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(500);
      oq = apply(oq);
      if (fromIso) oq = oq.gte("created_at", fromIso);
      if (toIso) oq = oq.lte("created_at", toIso);
      const { data: rows, error } = await oq;
      if (error) throw new Error(error.message);
      for (const o of (rows ?? []) as Array<{
        id: string; invoice_number: string | null; customer_name: string;
        customer_phone: string; total_amount: number | string; status: string; created_at: string;
      }>) {
        if (collected.has(o.id)) continue;
        collected.set(o.id, {
          id: o.id,
          invoice_number: o.invoice_number ?? null,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          total_amount: Number(o.total_amount) || 0,
          status: o.status,
          created_at: o.created_at,
        });
      }
    };

    if (data.staffId) {
      await fetchOrders((q: any) => q.eq("created_by", data.staffId!));
      await fetchOrders((q: any) => q.eq("updated_by", data.staffId!));

      // Orders taken via telesales by this staff (order_taken_at within range)
      let taq: any = supabase.from("telesales_assignments")
        .select("order_id, order_taken_at")
        .eq("assigned_to", data.staffId)
        .not("order_id", "is", null);
      if (fromIso) taq = taq.gte("order_taken_at", fromIso);
      if (toIso) taq = taq.lte("order_taken_at", toIso);
      const { data: takenRows } = await taq;
      const takenOrderIds: string[] = [...new Set((takenRows ?? []).map((r: any) => r.order_id as string).filter(Boolean) as string[])]
        .filter((id) => !collected.has(id));
      if (takenOrderIds.length) {
        const { data: rows } = await supabase
          .from("orders")
          .select("id, invoice_number, customer_name, customer_phone, total_amount, status, created_at")
          .in("id", takenOrderIds)
          .in("status", [...REVENUE_STATUSES]);
        for (const o of (rows ?? []) as Array<{
          id: string; invoice_number: string | null; customer_name: string;
          customer_phone: string; total_amount: number | string; status: string; created_at: string;
        }>) {
          if (collected.has(o.id)) continue;
          collected.set(o.id, {
            id: o.id,
            invoice_number: o.invoice_number ?? null,
            customer_name: o.customer_name,
            customer_phone: o.customer_phone,
            total_amount: Number(o.total_amount) || 0,
            status: o.status,
            created_at: o.created_at,
          });
        }
      }
    } else {
      await fetchOrders((q: any) => q.is("created_by", null).is("updated_by", null));
    }
    if (phones.size > 0) {
      await fetchOrders((q: any) => q.in("phone_normalized", [...phones]));
    }

    return [...collected.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ kind: "order" as const, ...o }));
  });

// ============================================================
// Telesales Compensation + Income/Expense (PnL) + Bulk Unassign
// ============================================================

export type TeleCompensationRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  base_amount: number;
  frequency: "daily" | "weekly" | "monthly";
  per_order_amount: number;
  per_order_pct: number;
  enabled: boolean;
};

export const listTelesalesCompensation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeleCompensationRow[]> => {
    const { supabase } = context;
    const { data: staff, error: e1 } = await supabase.rpc("list_assignable_users");
    if (e1) throw new Error(e1.message);
    const { data: comps, error: e2 } = await supabase
      .from("telesales_compensation")
      .select("user_id, base_amount, frequency, per_order_amount, per_order_pct, enabled");
    if (e2) throw new Error(e2.message);
    const cmap = new Map<string, typeof comps[number]>();
    for (const c of comps ?? []) cmap.set(c.user_id as string, c);
    return (staff ?? []).map((s: { id: string; display_name: string; email: string | null }) => {
      const c = cmap.get(s.id);
      return {
        user_id: s.id,
        display_name: s.display_name,
        email: s.email,
        base_amount: Number(c?.base_amount ?? 0),
        frequency: (c?.frequency as "daily" | "weekly" | "monthly") ?? "monthly",
        per_order_amount: Number(c?.per_order_amount ?? 0),
        per_order_pct: Number(c?.per_order_pct ?? 0),
        enabled: c?.enabled ?? true,
      };
    });
  });

export const upsertTelesalesCompensation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      base_amount: z.number().min(0),
      frequency: z.enum(["daily", "weekly", "monthly"]),
      per_order_amount: z.number().min(0),
      per_order_pct: z.number().min(0).max(100),
      enabled: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("telesales_compensation")
      .upsert(
        {
          user_id: data.user_id,
          base_amount: data.base_amount,
          frequency: data.frequency,
          per_order_amount: data.per_order_amount,
          per_order_pct: data.per_order_pct,
          enabled: data.enabled ?? true,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUnassignByStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      staff_id: z.string().uuid(),
      only_pending: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("telesales_assignments")
      .update({ assigned_to: null, updated_at: new Date().toISOString() })
      .eq("assigned_to", data.staff_id);
    if (data.only_pending ?? true) q = q.eq("status", "pending");
    const { data: updated, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { ok: true, count: updated?.length ?? 0 };

  });

export type TelePnLRow = {
  staff_id: string;
  staff_name: string;
  orders: number;
  revenue: number;
  product_cost: number;
  discount: number;
  salary: number;
  commission: number;
  net: number;
};

export const getTelesalesPnL = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string(), // YYYY-MM-DD
      to: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: TelePnLRow[]; totals: TelePnLRow }> => {
    const { supabase } = context;

    // 1) ALL assignments (not date-filtered) — phones-by-staff for order attribution
    const { data: assignments, error: aErr } = await supabase
      .from("telesales_assignments")
      .select("customer_id, assigned_to")
      .not("assigned_to", "is", null);
    if (aErr) throw new Error(aErr.message);

    const customerIds = [...new Set((assignments ?? []).map((a) => a.customer_id))];
    const { data: customers } = customerIds.length
      ? await supabase.from("imported_customers").select("id, phone").in("id", customerIds)
      : { data: [] as { id: string; phone: string }[] };
    const phoneByCustomer = new Map<string, string | null>();
    for (const c of customers ?? []) phoneByCustomer.set(c.id, normalizePhone(c.phone));

    // staff -> set of phones they handle
    const phonesByStaff = new Map<string, Set<string>>();
    for (const a of assignments ?? []) {
      if (!a.assigned_to) continue;
      const phone = phoneByCustomer.get(a.customer_id);
      if (!phone) continue;
      let set = phonesByStaff.get(a.assigned_to);
      if (!set) { set = new Set(); phonesByStaff.set(a.assigned_to, set); }
      set.add(phone);
    }

    // 2) orders + items + product cost (single nested-select round-trip)
    const { data: orders } = await supabase
      .from("orders")
      .select("id, phone_normalized, total_amount, discount_amount, status, created_at, order_items(quantity, products(cost_price))")
      .in("status", [...REVENUE_STATUSES])
      .gte("created_at", `${data.from}T00:00:00`)
      .lte("created_at", `${data.to}T23:59:59`);

    const itemsByOrder = new Map<string, number>(); // order_id -> product_cost sum
    for (const o of (orders ?? []) as Array<{
      id: string;
      order_items: Array<{ quantity: number; products: { cost_price: number } | null }> | null;
    }>) {
      let sum = 0;
      for (const it of o.order_items ?? []) {
        sum += (Number(it.products?.cost_price) || 0) * (Number(it.quantity) || 0);
      }
      itemsByOrder.set(o.id, sum);
    }

    // 4) compensation
    const { data: comps } = await supabase
      .from("telesales_compensation")
      .select("user_id, base_amount, frequency, per_order_amount, per_order_pct, enabled");
    const compByStaff = new Map<string, {
      base_amount: number; frequency: "daily" | "weekly" | "monthly";
      per_order_amount: number; per_order_pct: number; enabled: boolean;
    }>();
    for (const c of comps ?? []) {
      compByStaff.set(c.user_id as string, {
        base_amount: Number(c.base_amount) || 0,
        frequency: c.frequency as "daily" | "weekly" | "monthly",
        per_order_amount: Number(c.per_order_amount) || 0,
        per_order_pct: Number(c.per_order_pct) || 0,
        enabled: c.enabled !== false,
      });
    }

    // 5) range days
    const fromD = new Date(`${data.from}T00:00:00`);
    const toD = new Date(`${data.to}T23:59:59`);
    const rangeDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1);

    const allStaffIds = new Set<string>([
      ...phonesByStaff.keys(),
      ...compByStaff.keys(),
    ]);

    // 6) compute per staff
    const rows: TelePnLRow[] = [];
    const totals: TelePnLRow = {
      staff_id: "__total__", staff_name: "Total",
      orders: 0, revenue: 0, product_cost: 0, discount: 0, salary: 0, commission: 0, net: 0,
    };

    const staffArr = [...allStaffIds];
    const { data: profs } = staffArr.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", staffArr)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const nameMap = new Map<string, string>();
    for (const p of profs ?? []) nameMap.set(p.id as string, (p.full_name as string) || (p.email as string) || "User");

    for (const staffId of staffArr) {
      const phones = phonesByStaff.get(staffId) ?? new Set<string>();
      let orderCount = 0;
      let revenue = 0;
      let productCost = 0;
      let discount = 0;
      for (const o of orders ?? []) {
        const p = o.phone_normalized as string | null;
        if (!p || !phones.has(p)) continue;
        orderCount += 1;
        revenue += Number(o.total_amount) || 0;
        discount += Number(o.discount_amount) || 0;
        productCost += itemsByOrder.get(o.id as string) ?? 0;
      }

      const comp = compByStaff.get(staffId);
      let salary = 0;
      let commission = 0;
      if (comp && comp.enabled) {
        const perDay =
          comp.frequency === "daily" ? comp.base_amount :
          comp.frequency === "weekly" ? comp.base_amount / 7 :
          comp.base_amount / 30;
        salary = perDay * rangeDays;
        commission = orderCount * comp.per_order_amount + (revenue * comp.per_order_pct) / 100;
      }

      const row: TelePnLRow = {
        staff_id: staffId,
        staff_name: nameMap.get(staffId) ?? "User",
        orders: orderCount,
        revenue: Math.round(revenue),
        product_cost: Math.round(productCost),
        discount: Math.round(discount),
        salary: Math.round(salary),
        commission: Math.round(commission),
        net: Math.round(revenue - productCost - discount - salary - commission),
      };
      rows.push(row);
      totals.orders += row.orders;
      totals.revenue += row.revenue;
      totals.product_cost += row.product_cost;
      totals.discount += row.discount;
      totals.salary += row.salary;
      totals.commission += row.commission;
      totals.net += row.net;
    }

    rows.sort((a, b) => b.revenue - a.revenue);
    return { rows, totals };
  });
