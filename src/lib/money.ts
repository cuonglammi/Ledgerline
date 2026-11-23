/** Money is stored as integer cents everywhere. Only convert to a string at the very edge (the UI). */
export function formatCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    // Not a valid ISO currency code (e.g. the AI read "US$"): still show the amount.
    return `${centsToDecimalString(cents)} ${currency}`;
  }
}

/**
 * Turns a decimal amount as written on an invoice ("1,234.56", "-12.5", "(40.00)", "$ 99") into
 * integer cents, without ever going through a float (0.1 + 0.2 !== 0.3). Returns null if it isn't
 * a plain amount, or has more than 2 decimal places (we'd rather ask a human than silently round).
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = input
    .trim()
    .replace(/^[A-Z]{3}|[A-Z]{3}$/g, "") // "USD 12.00", "12.00 EUR"
    .replace(/[\s,$€£¥]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true; // accounting style: (40.00) means -40.00
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** Cents → "1234.56" for an editable input (no currency symbol, no thousands separators). */
export function centsToDecimalString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
