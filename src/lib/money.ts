/** Money is always integer cents. These helpers are the only place dollars appear. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Plain "48.73" (no symbol, no grouping) — used for portal form values. */
export function centsToPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Parse a money string like "$50", "50.00", "$1,149.00", "USD 12.5" into cents.
 * Returns null when the text is not a single unambiguous amount.
 */
export function parseMoneyToCents(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = text.trim().replace(/^(usd|us\$)\s*/i, '').replace(/\s*(usd|dollars?|bucks)$/i, '');
  const m = cleaned.match(/^-?\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number.parseInt(m[1].replace(/,/g, ''), 10);
  const frac = m[2] ? Number.parseInt(m[2].padEnd(2, '0'), 10) : 0;
  const cents = whole * 100 + frac;
  return cleaned.startsWith('-') ? -cents : cents;
}

/** Round-half-up integer division, used for per-head stats. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error('division by zero');
  return Math.round(numerator / denominator);
}

/** amount × (100 + pct) / 100, rounded up to the cent. */
export function withBuffer(cents: number, pct: number): number {
  return Math.ceil((cents * (100 + pct)) / 100);
}
