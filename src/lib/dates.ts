import { now } from './clock';

/** All org-facing dates are calendar dates in Berkeley's timezone. */
export const ORG_TZ = 'America/Los_Angeles';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function toLocalYmd(d: Date): string {
  return ymd.format(d); // en-CA gives YYYY-MM-DD
}

export function todayYmd(): string {
  return toLocalYmd(now());
}

export function addDays(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function weekdayOf(ymdStr: string): Weekday {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** First date on or after `from` that falls on `weekday`. */
export function nextWeekday(from: string, weekday: Weekday): string {
  const target = WEEKDAYS.indexOf(weekday);
  const current = WEEKDAYS.indexOf(weekdayOf(from));
  return addDays(from, (target - current + 7) % 7);
}

export function daysBetween(a: string, b: string): number {
  const utc = (x: string) => {
    const [y, m, d] = x.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const ta = utc(a);
  const tb = utc(b);
  return Math.round((tb - ta) / 86_400_000);
}

/** "2026-11-12" → "11/12/2026" (portal format). */
export function ymdToUs(ymdStr: string): string {
  const [y, m, d] = ymdStr.split('-');
  return `${m}/${d}/${y}`;
}

const pretty = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
/** "2026-11-12" → "Thu, Nov 12" */
export function prettyYmd(ymdStr: string): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return pretty.format(new Date(Date.UTC(y, m - 1, d)));
}

/** End of the given local day, as an ISO instant (approximate: 23:59 Pacific ≈ 07:59Z next day). */
export function endOfLocalDayIso(ymdStr: string): string {
  const next = addDays(ymdStr, 1);
  return `${next}T07:59:00.000Z`;
}
