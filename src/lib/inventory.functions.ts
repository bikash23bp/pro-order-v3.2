import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ───── Suppliers ─────
export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(255),
      phone: z.string().max(40).optional().nullable(),
      email: z.string().email().max(255).optional().nullable().or(z.literal("")),
      address: z.string().max(500).optional().nullable(),
      contact_person: z.string().max(255).optional().nullable(),
      opening_balance: z.number().min(0).default(0),
      status: z.enum(["active", "inactive"]).default("active"),
      note: z.string().max(1000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, email: data.email || null };
    const { data: row, error } = data.id
      ? await context.supabase.from("suppliers").update(payload).eq("id", data.id).select().single()
      : await context.supabase.from("suppliers").insert({ ...payload, created_by: context.userId }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ───── Warehouses ─────
export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("warehouses").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(255),
      location: z.string().max(500).optional().nullable(),
      status: z.enum(["active", "inactive"]).default("active"),
      is_default: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.is_default) {
      await context.supabase.from("warehouses").update({ is_default: false }).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data: row, error } = data.id
      ? await context.supabase.from("warehouses").update(data).eq("id", data.id).select().single()
      : await context.supabase.from("warehouses").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("warehouses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ───── Purchases ─────
export const listPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      supplier_id: z.string().uuid().optional().nullable(),
      warehouse_id: z.string().uuid().optional().nullable(),
    }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("supplier_purchases")
      .select("*, suppliers!supplier_purchases_supplier_id_fkey(name), warehouses!supplier_purchases_warehouse_id_fkey(name)")
      .order("purchase_date", { ascending: false });
    if (data.from) q = q.gte("purchase_date", data.from);
    if (data.to) q = q.lte("purchase_date", data.to);
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    if (data.warehouse_id) q = q.eq("warehouse_id", data.warehouse_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getPurchaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("supplier_purchases")
      .select("*, suppliers!supplier_purchases_supplier_id_fkey(name, phone), warehouses!supplier_purchases_warehouse_id_fkey(name)")
      .eq("id", data.id)
      .maybeSingle();
    const { data: items } = await context.supabase
      .from("supplier_purchase_items")
      .select("*, products!supplier_purchase_items_product_id_fkey(name, sku)")
      .eq("purchase_id", data.id);
    const { data: payments } = await context.supabase
      .from("supplier_payments")
      .select("*")
      .eq("purchase_id", data.id)
      .order("paid_on", { ascending: false });
    return { purchase: p, items: items ?? [], payments: payments ?? [] };
  });

export const createPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      warehouse_id: z.string().uuid().optional().nullable(),
      purchase_date: z.string().optional().nullable(),
      discount: z.number().min(0).default(0),
      paid_amount: z.number().min(0).default(0),
      note: z.string().max(1000).optional().nullable(),
      items: z.array(z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().optional().nullable(),
        quantity: z.number().int().positive(),
        unit_cost: z.number().min(0),
      })).min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("create_supplier_purchase", {
      p_supplier_id: data.supplier_id,
      p_warehouse_id: data.warehouse_id ?? null,
      p_purchase_date: data.purchase_date ?? null,
      p_discount: data.discount,
      p_paid_amount: data.paid_amount,
      p_note: data.note ?? null,
      p_items: data.items as unknown as never,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  });

// ───── Payments ─────
export const listSupplierPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ supplier_id: z.string().uuid().optional().nullable() }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("supplier_payments").select("*, suppliers!supplier_payments_supplier_id_fkey(name)").order("paid_on", { ascending: false });
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      purchase_id: z.string().uuid().optional().nullable(),
      amount: z.number().positive(),
      paid_on: z.string().optional().nullable(),
      method: z.string().max(40).optional().nullable(),
      note: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: pay, error } = await context.supabase.from("supplier_payments").insert({
      supplier_id: data.supplier_id,
      purchase_id: data.purchase_id ?? undefined,
      amount: data.amount,
      paid_on: data.paid_on ?? new Date().toISOString().slice(0, 10),
      method: data.method ?? "cash",
      note: data.note ?? undefined,
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);

    // If tied to a purchase, increment paid_amount + reduce due
    if (data.purchase_id) {
      const { data: p } = await context.supabase
        .from("supplier_purchases").select("paid_amount, total_amount").eq("id", data.purchase_id).maybeSingle();
      if (p) {
        const paid = Number(p.paid_amount) + data.amount;
        const due = Math.max(0, Number(p.total_amount) - paid);
        await context.supabase.from("supplier_purchases")
          .update({ paid_amount: paid, due_amount: due })
          .eq("id", data.purchase_id);
      }
    }
    return pay;
  });

// ───── Returns ─────
export const listSupplierReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      supplier_id: z.string().uuid().optional().nullable(),
    }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("supplier_returns")
      .select("*, suppliers!supplier_returns_supplier_id_fkey(name), products!supplier_returns_product_id_fkey(name, sku)")
      .order("return_date", { ascending: false });
    if (data.from) q = q.gte("return_date", data.from);
    if (data.to) q = q.lte("return_date", data.to);
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSupplierReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      supplier_id: z.string().uuid(),
      purchase_id: z.string().uuid().optional().nullable(),
      product_id: z.string().uuid(),
      variant_id: z.string().uuid().optional().nullable(),
      warehouse_id: z.string().uuid().optional().nullable(),
      quantity: z.number().int().positive(),
      unit_cost: z.number().min(0).default(0),
      reason: z.string().max(500).optional().nullable(),
      return_date: z.string().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("supplier_returns").insert({
      ...data,
      return_date: data.return_date ?? new Date().toISOString().slice(0, 10),
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);

    // If tied to a purchase + has unit cost, reduce due on the purchase and log a return credit
    const refund = data.quantity * (data.unit_cost ?? 0);
    if (data.purchase_id && refund > 0) {
      const { data: p } = await context.supabase
        .from("supplier_purchases")
        .select("total_amount, due_amount, paid_amount")
        .eq("id", data.purchase_id)
        .maybeSingle();
      if (p) {
        const newTotal = Math.max(0, Number(p.total_amount) - refund);
        const newDue = Math.max(0, Number(p.due_amount) - refund);
        await context.supabase
          .from("supplier_purchases")
          .update({ total_amount: newTotal, due_amount: newDue })
          .eq("id", data.purchase_id);
      }
      await context.supabase.from("supplier_payments").insert({
        supplier_id: data.supplier_id,
        purchase_id: data.purchase_id,
        amount: -refund,
        paid_on: data.return_date ?? new Date().toISOString().slice(0, 10),
        method: "return_credit",
        note: `Return credit (${data.quantity} × ${data.unit_cost})`,
        created_by: context.userId,
      });
    }
    return row;
  });

// ───── Helper: purchases for a supplier (for return dialog) ─────
export const listSupplierPurchasesForReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ supplier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: purchases, error } = await context.supabase
      .from("supplier_purchases")
      .select("id, purchase_number, purchase_date, total_amount, due_amount")
      .eq("supplier_id", data.supplier_id)
      .order("purchase_date", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const ids = (purchases ?? []).map((p) => p.id);
    let items: Array<{ purchase_id: string; product_id: string; variant_id: string | null; quantity: number; unit_cost: number; products?: { name?: string } | null }> = [];
    if (ids.length > 0) {
      const { data: it } = await context.supabase
        .from("supplier_purchase_items")
        .select("purchase_id, product_id, variant_id, quantity, unit_cost, products!supplier_purchase_items_product_id_fkey(name)")
        .in("purchase_id", ids);
      items = (it ?? []) as typeof items;
    }
    return { purchases: purchases ?? [], items };
  });

