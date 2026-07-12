import { normalizeBDPhone } from "./phone-paste";

// Returns the exact normalized BD phone number that should drive the orders
// search query, or "" when the input is not yet a complete 11-digit "01…"
// number. Any partial / non-phone input yields "" so the search does not fire
// and the list falls back to its default (tab/status) view.
export function computeOrderSearchPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const n = normalizeBDPhone(trimmed);
  return n.length === 11 && n.startsWith("01") ? n : "";
}

export const ORDER_SEARCH_DEBOUNCE_MS = 120;

// Schedules a trailing debounce for the search phone. Returns a cleanup fn.
// - Empty / partial input applies immediately (no debounce) so clearing feels
//   instant and never leaves a stale search active.
// - A complete phone waits ORDER_SEARCH_DEBOUNCE_MS before firing, so rapid
//   typing coalesces into a single query.
export function scheduleOrderSearch(
  raw: string,
  apply: (value: string) => void,
  {
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    delayMs = ORDER_SEARCH_DEBOUNCE_MS,
  }: {
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
    delayMs?: number;
  } = {},
): () => void {
  const next = computeOrderSearchPhone(raw);
  if (!next) {
    apply("");
    return () => {};
  }
  const handle = setTimeoutFn(() => apply(next), delayMs);
  return () => clearTimeoutFn(handle);
}