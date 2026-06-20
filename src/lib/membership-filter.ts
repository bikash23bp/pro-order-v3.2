import type { MembershipCustomer } from "@/lib/membership.functions";

export type DatePreset = "all" | "today" | "week" | "month" | "custom";
export type TagFilter = "all" | "discount" | "cancelled" | "fraud";

export type MembershipFilters = {
  q?: string;
  source?: string;        // "all" or source name
  product?: string;       // "all" or product name
  tag?: TagFilter;
  datePreset?: DatePreset;
  customFrom?: string;
  customTo?: string;
  now?: Date;             // override for tests
};

export function rangeFor(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): [Date | null, Date | null] {
  if (preset === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return [s, now];
  }
  if (preset === "week") {
    const s = new Date(now); s.setDate(s.getDate() - 7); return [s, now];
  }
  if (preset === "month") {
    const s = new Date(now); s.setMonth(s.getMonth() - 1); return [s, now];
  }
  if (preset === "custom") {
    return [customFrom ? new Date(customFrom) : null, customTo ? new Date(customTo) : null];
  }
  return [null, null];
}

export function filterMembershipCustomers(
  rows: MembershipCustomer[],
  f: MembershipFilters,
): MembershipCustomer[] {
  const q = (f.q ?? "").trim();
  const source = f.source ?? "all";
  const product = f.product ?? "all";
  const tag = f.tag ?? "all";
  const [from, to] = rangeFor(f.datePreset ?? "all", f.customFrom, f.customTo, f.now);
  const qLower = q.toLowerCase();

  return rows.filter((r) => {
    if (q) {
      const hit =
        (r.name ?? "").toLowerCase().includes(qLower) ||
        r.phone.includes(q) ||
        (r.email ?? "").toLowerCase().includes(qLower);
      if (!hit) return false;
    }
    if (source !== "all" && !r.sources.includes(source)) return false;
    if (product !== "all" && !r.products.includes(product)) return false;
    if (tag === "discount" && !r.has_discount) return false;
    if (tag === "cancelled" && r.cancelled_orders === 0) return false;
    if (tag === "fraud" && r.cancelled_orders < 2) return false;
    if (from || to) {
      if (!r.last_order_at) return false;
      const d = new Date(r.last_order_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });
}
