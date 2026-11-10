/**
 * Org inputs: what the org's Slack, email, calendar and meeting notes say about
 * a request. Each source is a connector; in this build every connector reads
 * seeded items from the database (a live Slack or Gmail connector would pull
 * into the same table). Code picks the relevant items with a fixed query, no
 * RAG, and the Advisor may cite them by ID like precedents.
 */
import { asc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { signals } from '../db/schema';
import { addDays, todayYmd } from '../dates';
import { shortHash } from '../claude/client';

export type SignalRow = typeof signals.$inferSelect;
export type SignalSourceId = SignalRow['source'];

export type SignalConnector = {
  id: SignalSourceId;
  label: string;
  /** What this connector reads, e.g. channels or an inbox. */
  scope: string;
  /** "seeded" until a live connector is configured. */
  mode: 'seeded' | 'live';
};

export const CONNECTORS: SignalConnector[] = [
  { id: 'slack', label: 'Slack', scope: '#events, #hardware, #general', mode: 'seeded' },
  { id: 'email', label: 'Email', scope: 'treasurer@ inbox', mode: 'seeded' },
  { id: 'calendar', label: 'Calendar', scope: 'Neurotech@Berkeley events', mode: 'seeded' },
  { id: 'notes', label: 'Meeting notes', scope: 'Board meeting notes', mode: 'seeded' },
];

export const SOURCE_LABEL: Record<SignalSourceId, string> = Object.fromEntries(CONNECTORS.map((c) => [c.id, c.label])) as Record<SignalSourceId, string>;

/** How far back the Advisor looks, and how many items it sees at most. */
export const SIGNAL_WINDOW_DAYS = 14;
export const SIGNAL_LIMIT = 6;

const tagsOf = (g: SignalRow): string[] => JSON.parse(g.purposeTags) as string[];

/**
 * Items about this request: the same event, or the same purpose tag, or the same
 * budget line when the item has no tags. Newest first, within the window.
 */
export function relevantSignals(q: { lineId: string; purposeTag: string; eventId: string | null }): SignalRow[] {
  const since = `${addDays(todayYmd(), -SIGNAL_WINDOW_DAYS)}T00:00:00.000Z`;
  return getDb()
    .select()
    .from(signals)
    .orderBy(asc(signals.id))
    .all()
    .filter((g) => g.sentAt >= since)
    .filter((g) => {
      const tags = tagsOf(g);
      if (q.eventId && g.eventId === q.eventId) return true;
      if (tags.includes(q.purposeTag)) return true;
      return g.lineId === q.lineId && tags.length === 0 && !g.eventId;
    })
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : a.id.localeCompare(b.id)))
    .slice(0, SIGNAL_LIMIT);
}

export function describeSignal(g: SignalRow): string {
  const head = `${SOURCE_LABEL[g.source]} ${g.location}, ${g.author}${g.subject ? `, “${g.subject}”` : ''}`;
  return `${head}: ${g.body}`;
}

/** Part of the advisor replay key: IDs and text, never dates relative to today. */
export function signalsFingerprint(rows: SignalRow[]): string {
  return shortHash(JSON.stringify(rows.map((g) => [g.id, g.body]).sort()));
}

export function allSignals(): SignalRow[] {
  return getDb().select().from(signals).all();
}
