export const ACTIVE_STATUSES = [
  "pending_web",
  "pending",
  "ready_order",
  "processing",
  "ready_to_ship",
  "shipped",
  "no_response",
  "hold",
  "fraud",
  "incomplete",
] as const;

export const INACTIVE_STATUSES = [
  "completed",
  "cancelled",
  "cancel_request",
  "returned",
] as const;

const ACTIVE_SET: ReadonlySet<string> = new Set(ACTIVE_STATUSES);

export function isActiveStatus(status: string | null | undefined): boolean {
  return !!status && ACTIVE_SET.has(status);
}

function normalize(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-11);
}

function dupKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-8);
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

export function normalizePhoneClient(phone: string): string | null {
  return normalize(phone);
}

export function normalizeEmailClient(email: string | null | undefined): string | null {
  return normalizeEmail(email);
}

export function phoneDupKeyClient(phone: string | null | undefined): string | null {
  return dupKey(phone);
}

export function dupPhoneKey(phone: string | null | undefined): string | null {
  return dupKey(phone);
}

export function normalizeEmailValue(email: string | null | undefined): string | null {
  return normalizeEmail(email);
}