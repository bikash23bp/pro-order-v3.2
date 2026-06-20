import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Last-11-digit normalization, matches orders.phone_normalized */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-11);
}

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const listeners = new Set<(s: Set<string>) => void>();

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("membership_customers").select("phone");
    const s = new Set<string>();
    for (const r of data ?? []) {
      const n = normalizePhone((r as { phone: string }).phone);
      if (n) s.add(n);
    }
    cache = s;
    inflight = null;
    listeners.forEach((l) => l(s));
    return s;
  })();
  return inflight;
}

/** Invalidate the cache after adding/removing members. */
export function invalidateMembershipPhones() {
  cache = null;
  inflight = null;
  load().catch(() => {});
}

export function useMembershipPhones(): {
  phones: Set<string>;
  isMember: (phone: string | null | undefined) => boolean;
} {
  const [phones, setPhones] = useState<Set<string>>(cache ?? new Set());
  useEffect(() => {
    let mounted = true;
    load().then((s) => mounted && setPhones(s));
    const listener = (s: Set<string>) => mounted && setPhones(new Set(s));
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);
  return {
    phones,
    isMember: (phone) => {
      const n = normalizePhone(phone);
      return n ? phones.has(n) : false;
    },
  };
}

/* ---------------- Membership discount settings ---------------- */

export type MembershipDiscount = { enabled: boolean; rate: number };

const DEFAULT_DISCOUNT: MembershipDiscount = { enabled: true, rate: 0.1 };

let discountCache: MembershipDiscount | null = null;
let discountInflight: Promise<MembershipDiscount> | null = null;
const discountListeners = new Set<(d: MembershipDiscount) => void>();

async function loadDiscount(): Promise<MembershipDiscount> {
  if (discountCache) return discountCache;
  if (discountInflight) return discountInflight;
  discountInflight = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("membership_discount_enabled, membership_discount_rate")
      .maybeSingle();
    const d: MembershipDiscount = {
      enabled: (data as { membership_discount_enabled?: boolean } | null)?.membership_discount_enabled ?? DEFAULT_DISCOUNT.enabled,
      rate: Number((data as { membership_discount_rate?: number } | null)?.membership_discount_rate ?? DEFAULT_DISCOUNT.rate),
    };
    discountCache = d;
    discountInflight = null;
    discountListeners.forEach((l) => l(d));
    return d;
  })();
  return discountInflight;
}

export function invalidateMembershipDiscount() {
  discountCache = null;
  discountInflight = null;
  loadDiscount().catch(() => {});
}

export function useMembershipDiscount(): MembershipDiscount {
  const [d, setD] = useState<MembershipDiscount>(discountCache ?? DEFAULT_DISCOUNT);
  useEffect(() => {
    let mounted = true;
    loadDiscount().then((v) => mounted && setD(v));
    const listener = (v: MembershipDiscount) => mounted && setD(v);
    discountListeners.add(listener);
    return () => {
      mounted = false;
      discountListeners.delete(listener);
    };
  }, []);
  return d;
}
