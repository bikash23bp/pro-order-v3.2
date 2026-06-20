import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_TAGS, type CustomerTag, normalizePhoneKey } from "@/lib/tags.functions";

/* =========================================================
 * Tag discount settings  (customer_tag_discounts table)
 * =======================================================*/

export type TagDiscount = { tag: CustomerTag; rate: number; enabled: boolean };
export type TagDiscountMap = Record<CustomerTag, TagDiscount>;

function defaultMap(): TagDiscountMap {
  const out = {} as TagDiscountMap;
  for (const t of CUSTOMER_TAGS) out[t] = { tag: t, rate: 0, enabled: false };
  return out;
}

let settingsCache: TagDiscountMap | null = null;
let settingsInflight: Promise<TagDiscountMap> | null = null;
const settingsListeners = new Set<(m: TagDiscountMap) => void>();

async function loadSettings(): Promise<TagDiscountMap> {
  if (settingsCache) return settingsCache;
  if (settingsInflight) return settingsInflight;
  settingsInflight = (async () => {
    const { data } = await supabase
      .from("customer_tag_discounts" as never)
      .select("tag, rate, enabled");
    const map = defaultMap();
    for (const r of (data ?? []) as Array<{ tag: CustomerTag; rate: number; enabled: boolean }>) {
      map[r.tag] = { tag: r.tag, rate: Number(r.rate ?? 0), enabled: !!r.enabled };
    }
    settingsCache = map;
    settingsInflight = null;
    settingsListeners.forEach((l) => l(map));
    return map;
  })();
  return settingsInflight;
}

export function invalidateTagDiscounts() {
  settingsCache = null;
  settingsInflight = null;
  loadSettings().catch(() => {});
}

export function useTagDiscountSettings(): TagDiscountMap {
  const [m, setM] = useState<TagDiscountMap>(settingsCache ?? defaultMap());
  useEffect(() => {
    let mounted = true;
    loadSettings().then((v) => mounted && setM(v));
    const l = (v: TagDiscountMap) => mounted && setM({ ...v });
    settingsListeners.add(l);
    return () => { mounted = false; settingsListeners.delete(l); };
  }, []);
  return m;
}

/* =========================================================
 * Phone → tags map  (browser cache of customer_tags table)
 * =======================================================*/

let phoneTagsCache: Map<string, Set<CustomerTag>> | null = null;
let phoneTagsInflight: Promise<Map<string, Set<CustomerTag>>> | null = null;
const phoneTagsListeners = new Set<(m: Map<string, Set<CustomerTag>>) => void>();

async function loadPhoneTags(): Promise<Map<string, Set<CustomerTag>>> {
  if (phoneTagsCache) return phoneTagsCache;
  if (phoneTagsInflight) return phoneTagsInflight;
  phoneTagsInflight = (async () => {
    const { data } = await supabase
      .from("customer_tags")
      .select("phone, tag")
      .limit(20000);
    const map = new Map<string, Set<CustomerTag>>();
    for (const r of (data ?? []) as Array<{ phone: string; tag: CustomerTag }>) {
      const k = normalizePhoneKey(r.phone);
      if (!k) continue;
      let s = map.get(k);
      if (!s) { s = new Set(); map.set(k, s); }
      s.add(r.tag);
    }
    phoneTagsCache = map;
    phoneTagsInflight = null;
    phoneTagsListeners.forEach((l) => l(map));
    return map;
  })();
  return phoneTagsInflight;
}

export function invalidatePhoneTags() {
  phoneTagsCache = null;
  phoneTagsInflight = null;
  loadPhoneTags().catch(() => {});
}

export function usePhoneTags() {
  const [m, setM] = useState<Map<string, Set<CustomerTag>>>(phoneTagsCache ?? new Map());
  useEffect(() => {
    let mounted = true;
    loadPhoneTags().then((v) => mounted && setM(v));
    const l = (v: Map<string, Set<CustomerTag>>) => mounted && setM(new Map(v));
    phoneTagsListeners.add(l);
    return () => { mounted = false; phoneTagsListeners.delete(l); };
  }, []);
  return {
    tagsFor: (phone: string | null | undefined): CustomerTag[] => {
      const k = normalizePhoneKey(phone ?? "");
      const s = k ? m.get(k) : undefined;
      return s ? Array.from(s) : [];
    },
  };
}

/* =========================================================
 * Convenience: best (max-enabled-rate) tag discount for a phone
 * =======================================================*/

export function useBestTagDiscount(phone: string | null | undefined): {
  rate: number;
  tag: CustomerTag | null;
  label: string | null;
} {
  const settings = useTagDiscountSettings();
  const { tagsFor } = usePhoneTags();
  const tags = tagsFor(phone);
  let best: { rate: number; tag: CustomerTag } | null = null;
  for (const t of tags) {
    const s = settings[t];
    if (s?.enabled && s.rate > 0 && (!best || s.rate > best.rate)) {
      best = { rate: s.rate, tag: t };
    }
  }
  return best
    ? { rate: best.rate, tag: best.tag, label: best.tag }
    : { rate: 0, tag: null, label: null };
}
