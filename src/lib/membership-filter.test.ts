import { describe, it, expect } from "vitest";
import { filterMembershipCustomers, rangeFor } from "./membership-filter";
import type { MembershipCustomer } from "./membership.functions";

const mk = (over: Partial<MembershipCustomer>): MembershipCustomer => ({
  id: over.id ?? "id",
  name: over.name ?? "Test",
  phone: over.phone ?? "01700000000",
  email: over.email ?? null,
  address: null,
  date_of_birth: null,
  tier: "standard",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  total_orders: over.total_orders ?? 0,
  cancelled_orders: over.cancelled_orders ?? 0,
  total_spent: over.total_spent ?? 0,
  last_order_at: over.last_order_at ?? null,
  sources: over.sources ?? [],
  products: over.products ?? [],
  has_discount: over.has_discount ?? false,
  ...over,
});

const NOW = new Date("2026-05-16T12:00:00Z");

const rows: MembershipCustomer[] = [
  mk({ id: "a", name: "Alice", phone: "01711111111", email: "alice@x.com",
       sources: ["FB"], products: ["Shirt"], total_orders: 3,
       last_order_at: "2026-05-16T08:00:00Z", has_discount: true }),
  mk({ id: "b", name: "Bob", phone: "01722222222", email: "bob@y.com",
       sources: ["WhatsApp"], products: ["Pants"], total_orders: 1,
       cancelled_orders: 1, last_order_at: "2026-05-10T08:00:00Z" }),
  mk({ id: "c", name: "Carol", phone: "01733333333",
       sources: ["TikTok", "FB"], products: ["Shirt", "Hat"], total_orders: 5,
       cancelled_orders: 3, last_order_at: "2026-03-01T08:00:00Z" }),
  mk({ id: "d", name: "Dave", phone: "01744444444",
       sources: ["Web"], products: ["Hat"], total_orders: 0,
       last_order_at: null }),
];

describe("filterMembershipCustomers", () => {
  it("returns all rows with no filters", () => {
    expect(filterMembershipCustomers(rows, {})).toHaveLength(4);
  });

  it("searches by name, phone, and email (case-insensitive)", () => {
    expect(filterMembershipCustomers(rows, { q: "ali" }).map(r => r.id)).toEqual(["a"]);
    expect(filterMembershipCustomers(rows, { q: "01722" }).map(r => r.id)).toEqual(["b"]);
    expect(filterMembershipCustomers(rows, { q: "BOB@Y.COM" }).map(r => r.id)).toEqual(["b"]);
    expect(filterMembershipCustomers(rows, { q: "zzz" })).toHaveLength(0);
  });

  it("filters by source", () => {
    expect(filterMembershipCustomers(rows, { source: "FB" }).map(r => r.id)).toEqual(["a", "c"]);
    expect(filterMembershipCustomers(rows, { source: "Web" }).map(r => r.id)).toEqual(["d"]);
    expect(filterMembershipCustomers(rows, { source: "Direct" })).toHaveLength(0);
  });

  it("filters by product (order history)", () => {
    expect(filterMembershipCustomers(rows, { product: "Shirt" }).map(r => r.id)).toEqual(["a", "c"]);
    expect(filterMembershipCustomers(rows, { product: "Hat" }).map(r => r.id)).toEqual(["c", "d"]);
  });

  it("filters by date preset (today)", () => {
    const out = filterMembershipCustomers(rows, { datePreset: "today", now: NOW });
    expect(out.map(r => r.id)).toEqual(["a"]);
  });

  it("filters by date preset (week)", () => {
    const out = filterMembershipCustomers(rows, { datePreset: "week", now: NOW });
    expect(out.map(r => r.id).sort()).toEqual(["a", "b"]);
  });

  it("filters by date preset (month)", () => {
    const out = filterMembershipCustomers(rows, { datePreset: "month", now: NOW });
    expect(out.map(r => r.id).sort()).toEqual(["a", "b"]);
  });

  it("filters by custom date range", () => {
    const out = filterMembershipCustomers(rows, {
      datePreset: "custom",
      customFrom: "2026-02-01",
      customTo: "2026-04-01",
      now: NOW,
    });
    expect(out.map(r => r.id)).toEqual(["c"]);
  });

  it("excludes rows with no last_order_at when date range applied", () => {
    const out = filterMembershipCustomers(rows, { datePreset: "month", now: NOW });
    expect(out.find(r => r.id === "d")).toBeUndefined();
  });

  it("filters by tag = discount", () => {
    expect(filterMembershipCustomers(rows, { tag: "discount" }).map(r => r.id)).toEqual(["a"]);
  });

  it("filters by tag = cancelled (any cancellation)", () => {
    expect(filterMembershipCustomers(rows, { tag: "cancelled" }).map(r => r.id).sort()).toEqual(["b", "c"]);
  });

  it("filters by tag = fraud (>= 2 cancellations)", () => {
    expect(filterMembershipCustomers(rows, { tag: "fraud" }).map(r => r.id)).toEqual(["c"]);
  });

  it("filters by order count via product (a stand-in for 'has ordered')", () => {
    // Combining source + product narrows to a single member
    const out = filterMembershipCustomers(rows, { source: "FB", product: "Shirt" });
    expect(out.map(r => r.id)).toEqual(["a", "c"]);
  });

  it("combines multiple filters (source + product + tag + date)", () => {
    const out = filterMembershipCustomers(rows, {
      source: "FB",
      product: "Shirt",
      tag: "fraud",
      datePreset: "custom",
      customFrom: "2026-01-01",
      customTo: "2026-04-01",
      now: NOW,
    });
    expect(out.map(r => r.id)).toEqual(["c"]);
  });
});

describe("rangeFor", () => {
  it("returns [null, null] for 'all'", () => {
    expect(rangeFor("all")).toEqual([null, null]);
  });
  it("returns a today range", () => {
    const [from, to] = rangeFor("today", undefined, undefined, NOW);
    expect(from!.toISOString().slice(0, 10)).toBe("2026-05-16");
    expect(to).toEqual(NOW);
  });
  it("returns a custom range", () => {
    const [from, to] = rangeFor("custom", "2026-01-01", "2026-02-01");
    expect(from!.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(to!.toISOString().slice(0, 10)).toBe("2026-02-01");
  });
});
