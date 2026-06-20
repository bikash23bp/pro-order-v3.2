// Convert Bengali (০-৯) and Arabic-Indic (٠-٩) digits to ASCII 0-9.
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// Normalize a BD mobile number to local 11-digit form starting with "01".
// Strips +88 / 088 / 88 country prefixes, converts Bengali digits, drops any
// non-digit characters, and clamps to 11 digits. Returns "" when input has no
// usable digits. Safe to call on partial input — won't pad short numbers.
export function normalizeBDPhone(s: string): string {
  let d = toAsciiDigits(s).replace(/\D/g, "");
  if (!d) return "";
  // Strip international dial-out prefixes: "00", leading "0" before "88"
  while (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("088")) d = d.slice(1); // "088…" → "88…"
  if (d.startsWith("880")) d = d.slice(3);
  else if (d.startsWith("88") && d.length >= 13) d = d.slice(2);
  // Bare 10-digit "1XXXXXXXXX" → prepend leading 0
  if (d.startsWith("1") && d.length === 10) d = "0" + d;
  // If we have more than 11 digits but a clean "01" appears, lock onto it
  if (d.length > 11) {
    const m = d.match(/01\d{9}/);
    if (m) d = m[0];
    else d = d.slice(0, 11);
  }
  return d;
}

// Try to extract a BD-style mobile number (01XXXXXXXXX) from arbitrary text.
// Returns the normalised phone (empty string if none found) and the remaining
// text with the matched phone stripped — useful for routing the address part
// to a separate field when the user pastes "name, address, phone" together.
export function extractBDPhone(input: string): { phone: string; rest: string } {
  const ascii = toAsciiDigits(input);
  // +880 1X XXXX XXXX  /  8801XXXXXXXXX  /  01XXXXXXXXX — allow spaces/dashes/dots
  const re = /(?:\+?88)?[\s\-.]*0?1[\s\-.]*\d(?:[\s\-.]*\d){8}/;
  const m = ascii.match(re);
  if (!m || m.index === undefined) {
    return { phone: "", rest: ascii.trim() };
  }
  const digits = m[0].replace(/\D/g, "");
  let phone = digits;
  if (phone.startsWith("880")) phone = phone.slice(3);
  if (phone.length === 10 && phone.startsWith("1")) phone = "0" + phone;
  phone = phone.slice(-11);

  const rest = (ascii.slice(0, m.index) + ascii.slice(m.index + m[0].length))
    // tidy common separators left over from "Name, Phone, Address"
    .replace(/[,;|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-.:]+|[\s\-.:]+$/g, "")
    .trim();

  return { phone, rest };
}
