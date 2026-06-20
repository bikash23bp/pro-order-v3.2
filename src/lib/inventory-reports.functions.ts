import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ───── Dashboard ─────
export const getInventoryDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;

    const [productsRes, variantsRes, purchasesRes, paymentsRes] = await Promise.all([
      sb.from("products").select("id, stock_quantity, cost_price, low_stock_threshold, has_variants, use_variant_pricing").eq("status", "active"),
      sb.from("product_variants").select("id, product_id, stock_quantity, cost_price").eq("status", "active"),
      sb.from("supplier_purchases").select("total_amount, paid_amount, due_amount"),
      sb.from("supplier_payments").select("amount"),
    ]);

    const products = productsRes.data ?? [];
    const variants = variantsRes.data ?? [];
    const purchases = purchasesRes.data ?? [];

    // Total stock value
    let stockValue = 0;
    let lowCount = 0;
    let outCount = 0;
    const variantsByProduct = new Map<string, Array<{ stock_quantity: number; cost_price: number | null }>>();
    for (const v of variants) {
      const arr = variantsByProduct.get(v.product_id) ?? [];
      arr.push({ stock_quantity: v.stock_quantity, cost_price: v.cost_price });
      variantsByProduct.set(v.product_id, arr);
    }
    for (const p of products) {
      const vars = variantsByProduct.get(p.id) ?? [];
      if (p.has_variants && vars.length > 0) {
        const total = vars.reduce((s, v) => s + v.stock_quantity, 0);
        const value = vars.reduce((s, v) => s + v.stock_quantity * Number(p.use_variant_pricing ? v.cost_price ?? 0 : p.cost_price ?? 0), 0);
        stockValue += value;
        if (total <= 0) outCount++;
        else if (total <= (p.low_stock_threshold ?? 5)) lowCount++;
      } else {
        stockValue += p.stock_quantity * Number(p.cost_price ?? 0);
        if (p.stock_quantity <= 0) outCount++;
        else if (p.stock_quantity <= (p.low_stock_threshold ?? 5)) lowCount++;
      }
    }

    const totalPurchases = purchases.reduce((s, p) => s + Number(p.total_amount), 0);
    const totalPaid = purchases.reduce((s, p) => s + Number(p.paid_amount), 0);
    const totalDue = Math.max(0, totalPurchases - totalPaid);

    return {
      stockValue,
      lowCount,
      outCount,
      totalDue,
      totalPurchases,
      productCount: products.length,
    };
  });

export const getMonthlyPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 11);
    since.setDate(1);
    const { data, error } = await context.supabase
      .from("supplier_purchases")
      .select("purchase_date, total_amount")
      .gte("purchase_date", since.toISOString().slice(0, 10))
      .order("purchase_date");
    if (error) throw new Error(error.message);
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets[d.toISOString().slice(0, 7)] = 0;
    }
    for (const r of data ?? []) {
      const k = r.purchase_date.slice(0, 7);
      if (k in buckets) buckets[k] += Number(r.total_amount);
    }
    return Object.entries(buckets).map(([month, total]) => ({ month, total }));
  });

export const getStockInOut = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setDate(1);
    const { data, error } = await context.supabase
      .from("inventory_transactions")
      .select("created_at, type, quantity")
      .gte("created_at", since.toISOString());
    if (error) throw new Error(error.message);
    const buckets: Record<string, { in: number; out: number }> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets[d.toISOString().slice(0, 7)] = { in: 0, out: 0 };
    }
    for (const r of data ?? []) {
      const k = r.created_at.slice(0, 7);
      if (!(k in buckets)) continue;
      if (r.quantity > 0) buckets[k].in += r.quantity;
      else buckets[k].out += -r.quantity;
    }
    return Object.entries(buckets).map(([month, v]) => ({ month, in: v.in, out: v.out }));
  });

// ───── Stock reports ─────
const StockFilter = z.object({
  category_id: z.string().uuid().optional().nullable(),
  search: z.string().max(255).optional().nullable(),
}).partial();

export const getCurrentStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StockFilter.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("id, name, sku, stock_quantity, cost_price, price, low_stock_threshold, has_variants, category_id, categories(name)")
      .order("name");
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLowStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, sku, stock_quantity, low_stock_threshold, cost_price, categories(name)")
      .eq("status", "active")
      .order("stock_quantity");
    if (error) throw new Error(error.message);
    return (data ?? []).filter((p) => p.stock_quantity > 0 && p.stock_quantity <= (p.low_stock_threshold ?? 5));
  });

export const getOutOfStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, sku, stock_quantity, cost_price, categories(name)")
      .eq("status", "active")
      .lte("stock_quantity", 0)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInventoryValuation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, sku, stock_quantity, cost_price, price, categories(name)")
      .eq("status", "active")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      ...p,
      stock_value: p.stock_quantity * Number(p.cost_price ?? 0),
      retail_value: p.stock_quantity * Number(p.price ?? 0),
    }));
  });

export const getStockMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      product_id: z.string().uuid().optional().nullable(),
      warehouse_id: z.string().uuid().optional().nullable(),
      type: z.string().optional().nullable(),
    }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inventory_transactions")
      .select("*, products!inventory_transactions_product_id_fkey(name, sku), warehouses!inventory_transactions_warehouse_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.warehouse_id) q = q.eq("warehouse_id", data.warehouse_id);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ───── Supplier reports ─────
export const getSupplierDues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [suppliersRes, purchasesRes, paymentsRes] = await Promise.all([
      context.supabase.from("suppliers").select("id, name, phone, opening_balance"),
      context.supabase.from("supplier_purchases").select("supplier_id, total_amount, paid_amount"),
      context.supabase.from("supplier_payments").select("supplier_id, amount, purchase_id"),
    ]);
    const suppliers = suppliersRes.data ?? [];
    const purchases = purchasesRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    return suppliers.map((s) => {
      const purchTotal = purchases.filter((p) => p.supplier_id === s.id).reduce((a, p) => a + Number(p.total_amount), 0);
      // Only count standalone payments (not the ones already counted in paid_amount tied to purchase)
      const purchPaid = purchases.filter((p) => p.supplier_id === s.id).reduce((a, p) => a + Number(p.paid_amount), 0);
      const extraPay = payments.filter((p) => p.supplier_id === s.id && !p.purchase_id).reduce((a, p) => a + Number(p.amount), 0);
      const opening = Number(s.opening_balance ?? 0);
      const due = opening + purchTotal - purchPaid - extraPay;
      return {
        id: s.id, name: s.name, phone: s.phone,
        total_purchases: purchTotal, total_paid: purchPaid + extraPay,
        opening_balance: opening, due,
      };
    });
  });

export const getSupplierProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ supplier_id: z.string().uuid().optional().nullable() }).partial().parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("supplier_purchase_items")
      .select("product_id, quantity, unit_cost, total_cost, products!supplier_purchase_items_product_id_fkey(name, sku), supplier_purchases!supplier_purchase_items_purchase_id_fkey!inner(supplier_id, suppliers!supplier_purchases_supplier_id_fkey(name))");
    if (data.supplier_id) q = q.eq("supplier_purchases.supplier_id", data.supplier_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Aggregate by product+supplier
    const map = new Map<string, { product_id: string; product_name: string; supplier_name: string; quantity: number; total_cost: number; last_cost: number }>();
    for (const r of rows ?? []) {
      const sup = (r as { supplier_purchases?: { suppliers?: { name?: string } } }).supplier_purchases?.suppliers?.name ?? "—";
      const prodName = (r as { products?: { name?: string } }).products?.name ?? "—";
      const key = `${r.product_id}__${sup}`;
      const cur = map.get(key) ?? { product_id: r.product_id, product_name: prodName, supplier_name: sup, quantity: 0, total_cost: 0, last_cost: 0 };
      cur.quantity += r.quantity;
      cur.total_cost += Number(r.total_cost);
      cur.last_cost = Number(r.unit_cost);
      map.set(key, cur);
    }
    return Array.from(map.values());
  });

// ───── Warehouse report ─────
export const getWarehouseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().optional().nullable(),
      to: z.string().optional().nullable(),
      warehouse_id: z.string().uuid().optional().nullable(),
      search: z.string().max(255).optional().nullable(),
    }).partial().parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inventory_transactions")
      .select("warehouse_id, product_id, variant_id, type, quantity, unit_cost, products!inventory_transactions_product_id_fkey(name, sku), warehouses!inventory_transactions_warehouse_id_fkey(name)")
      .limit(5000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    if (data.warehouse_id) q = q.eq("warehouse_id", data.warehouse_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    type Row = {
      warehouse_id: string | null;
      warehouse_name: string;
      product_id: string;
      product_name: string;
      product_sku: string | null;
      total_in: number;
      total_out: number;
      net_qty: number;
      value: number;
    };
    const map = new Map<string, Row>();
    const search = (data.search ?? "").toLowerCase();
    for (const r of rows ?? []) {
      const prod = (r as { products?: { name?: string; sku?: string | null } | null }).products;
      const wh = (r as { warehouses?: { name?: string } | null }).warehouses;
      const name = prod?.name ?? "—";
      if (search && !name.toLowerCase().includes(search) && !(prod?.sku ?? "").toLowerCase().includes(search)) continue;
      const key = `${r.warehouse_id ?? "none"}__${r.product_id}`;
      const cur = map.get(key) ?? {
        warehouse_id: r.warehouse_id,
        warehouse_name: wh?.name ?? "(no warehouse)",
        product_id: r.product_id,
        product_name: name,
        product_sku: prod?.sku ?? null,
        total_in: 0, total_out: 0, net_qty: 0, value: 0,
      };
      const qty = Number(r.quantity);
      const cost = Number(r.unit_cost ?? 0);
      if (qty > 0) cur.total_in += qty;
      else cur.total_out += -qty;
      cur.net_qty += qty;
      cur.value += qty * cost;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.warehouse_name.localeCompare(b.warehouse_name) || a.product_name.localeCompare(b.product_name),
    );
  });
