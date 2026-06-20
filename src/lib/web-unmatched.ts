// Helpers to (de)serialize unmatched WooCommerce line items inside `orders.internal_note`.
// Format: a structured JSON block surrounded by sentinel tags so the rest of the
// note (user notes, "WooCommerce #123" prefix, etc.) is preserved.

export type WebUnmatchedItem = {
  name: string;
  sku?: string | null;
  product_id?: number | string | null;
  variation_id?: number | string | null;
  quantity: number;
  unit_price: number;
};

const START = "[WEB_UNMATCHED]";
const END = "[/WEB_UNMATCHED]";
// matches the legacy "[Web items]\n- name (SKU: x) × 2 @ ৳350.00" block
const LEGACY_HEADER = "[Web items]";

export function serializeUnmatchedBlock(items: WebUnmatchedItem[]): string {
  if (!items.length) return "";
  return `${START}\n${JSON.stringify({ items })}\n${END}`;
}

/** Parse a note and return { items, noteWithoutBlock }. Handles both new JSON
 * block and legacy "[Web items]" plain-text block. */
export function parseUnmatchedFromNote(note: string | null | undefined): {
  items: WebUnmatchedItem[];
  noteWithoutBlock: string;
} {
  if (!note) return { items: [], noteWithoutBlock: "" };

  // 1) New JSON block
  const jsonStart = note.indexOf(START);
  if (jsonStart !== -1) {
    const jsonEnd = note.indexOf(END, jsonStart);
    if (jsonEnd !== -1) {
      const inner = note.slice(jsonStart + START.length, jsonEnd).trim();
      let items: WebUnmatchedItem[] = [];
      try {
        const parsed = JSON.parse(inner);
        if (parsed && Array.isArray(parsed.items)) {
          items = parsed.items.map((it: Record<string, unknown>) => ({
            name: String(it.name ?? "").trim() || "Unnamed item",
            sku: it.sku ? String(it.sku) : null,
            product_id: it.product_id ?? null,
            variation_id: it.variation_id ?? null,
            quantity: Math.max(1, Number(it.quantity ?? 1) || 1),
            unit_price: Number(it.unit_price ?? 0) || 0,
          }));
        }
      } catch {
        // ignore malformed block
      }
      const cleaned = (note.slice(0, jsonStart) + note.slice(jsonEnd + END.length))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { items, noteWithoutBlock: cleaned };
    }
  }

  // 2) Legacy "[Web items]" plain-text block (until end of note or blank line break)
  const legacyIdx = note.indexOf(LEGACY_HEADER);
  if (legacyIdx !== -1) {
    const after = note.slice(legacyIdx + LEGACY_HEADER.length);
    // legacy block ran to end of note; collect "- name (SKU: x) × N @ ৳P"
    const items: WebUnmatchedItem[] = [];
    const lineRe = /^-\s*(.+?)(?:\s*\(SKU:\s*([^)]+)\))?\s*×\s*(\d+)\s*@\s*৳?\s*([\d.]+)\s*$/u;
    for (const raw of after.split("\n")) {
      const m = raw.trim().match(lineRe);
      if (m) {
        items.push({
          name: m[1].trim(),
          sku: m[2]?.trim() || null,
          quantity: Math.max(1, parseInt(m[3], 10) || 1),
          unit_price: parseFloat(m[4]) || 0,
        });
      }
    }
    const cleaned = note.slice(0, legacyIdx).replace(/\n{2,}$/g, "").trim();
    return { items, noteWithoutBlock: cleaned };
  }

  return { items: [], noteWithoutBlock: note };
}

/** Replace any existing unmatched/legacy block in `note` with a fresh JSON block
 * for `items` (or remove the block entirely when items is empty). */
export function writeUnmatchedToNote(
  note: string | null | undefined,
  items: WebUnmatchedItem[],
): string | null {
  const { noteWithoutBlock } = parseUnmatchedFromNote(note);
  const block = serializeUnmatchedBlock(items);
  const out = [noteWithoutBlock, block].filter(Boolean).join("\n\n").trim();
  return out || null;
}
