/** Code resolves what Claude extracted: budget line by exact name, event by phrase. */
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { todayYmd, weekdayOf, WEEKDAYS } from '../dates';
import type { Extraction } from '../types';

export type EventRow = typeof s.events.$inferSelect;
export type LineRow = typeof s.budgetLines.$inferSelect;

export function resolveLine(name: string | null): LineRow | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return getDb().select().from(s.budgetLines).all().find((l) => l.name.toLowerCase() === n) ?? null;
}

export function upcomingEvents(): EventRow[] {
  const today = todayYmd();
  return getDb()
    .select()
    .from(s.events)
    .all()
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveEvent(x: Pick<Extraction, 'event_phrase' | 'event_type'>): EventRow | null {
  const phrase = (x.event_phrase ?? '').toLowerCase();
  if (!phrase && !x.event_type) return null;
  const upcoming = upcomingEvents();

  let pool = upcoming;
  if (x.event_type) pool = pool.filter((e) => e.type === x.event_type);

  // 1. Weekday ("Thursday's GM", "next Thursday's GM") — "next" means the one after.
  const weekday = WEEKDAYS.find((d) => phrase.includes(d));
  if (weekday) {
    const onDay = pool.filter((e) => weekdayOf(e.date) === weekday);
    const idx = /\bnext\b/.test(phrase) ? 1 : 0;
    return onDay[idx] ?? null;
  }

  // 2. Named event ("Calapalooza tabling").
  const named = pool.find((e) =>
    e.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5)
      .some((w) => phrase.includes(w)),
  );
  if (named) return named;

  // 3. "next GM" / just the type.
  if (/\bnext\b/.test(phrase)) return pool[0] ?? null;
  return pool[0] ?? null;
}

export function upcomingCountOfType(type: string): number {
  return upcomingEvents().filter((e) => e.type === type).length;
}
