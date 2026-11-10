/**
 * The org knowledge the Advisor sees for one request: a fixed query, no RAG.
 * Criteria that apply to the line/tag, precedents with the same line + purpose tag.
 */
import { and, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import { orgCriteria, precedents, schoolRules, orgHardRules, budgetLines } from '../db/schema';
import { formatCents } from '../money';
import { config } from '../config';
import { shortHash } from '../claude/client';
import type { KnownIds } from './verify';
import { allSignals, describeSignal } from '../signals/sources';

export type CriterionRow = typeof orgCriteria.$inferSelect;
export type PrecedentRow = typeof precedents.$inferSelect;

export function applicableCriteria(lineId: string, purposeTag: string): CriterionRow[] {
  return getDb()
    .select()
    .from(orgCriteria)
    .where(
      and(
        or(isNull(orgCriteria.lineId), eq(orgCriteria.lineId, lineId)),
        or(isNull(orgCriteria.purposeTag), eq(orgCriteria.purposeTag, purposeTag)),
      ),
    )
    .all()
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function relevantPrecedents(lineId: string, purposeTag: string): PrecedentRow[] {
  return getDb()
    .select()
    .from(precedents)
    .where(and(eq(precedents.lineId, lineId), eq(precedents.purposeTag, purposeTag)))
    .all()
    .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : b.id.localeCompare(a.id)))
    .slice(0, config.precedentWindow);
}

/**
 * Fingerprint of the knowledge rows the Advisor sees (IDs + text/notes/amounts, no dates
 * relative to "now"). Part of the advisor replay key: a new treasurer note → new key.
 */
export function knowledgeFingerprint(criteria: CriterionRow[], precs: PrecedentRow[]): string {
  const c = criteria.map((r) => [r.id, r.text, r.paramCents ?? ''].join('|'));
  const p = precs.map((r) => [r.id, r.outcome, r.amountCents, r.approvedCents ?? '', r.attendeeCount ?? '', r.treasurerNote ?? ''].join('|'));
  return shortHash(JSON.stringify([c.sort(), p.sort()]));
}

export function describePrecedent(p: PrecedentRow): string {
  const outcome = p.outcome === 'approved_reduced' ? `approved at ${formatCents(p.approvedCents ?? 0)}` : p.outcome;
  const heads = p.attendeeCount ? `, ${p.attendeeCount} attendees` : '';
  const note = p.treasurerNote ? ` Treasurer: “${p.treasurerNote}”` : '';
  return `${p.description}, ${formatCents(p.amountCents)}${heads}, ${outcome} ${p.decidedAt}.${note}`;
}

/** Every ID that exists in the database, for the citation check. */
export function knownIdsFromDb(stats: KnownIds['stats']): KnownIds {
  const db = getDb();
  const rules = new Map<string, { label: string; detail: string }>();
  for (const c of db.select().from(orgCriteria).all()) rules.set(c.id, { label: c.id, detail: `${c.text} (${c.source})` });
  for (const r of db.select().from(schoolRules).all()) rules.set(r.id, { label: r.id, detail: `“${r.quote}” (${r.source})` });
  for (const r of db.select().from(orgHardRules).all()) rules.set(r.id, { label: r.id, detail: r.description });
  for (const l of db.select().from(budgetLines).all())
    rules.set(`sheet row ${l.sourceRow}`, { label: `sheet row ${l.sourceRow}`, detail: `${l.name}: allocated ${formatCents(l.allocatedCents)}` });
  const pastSpending = new Map<string, { label: string; detail: string }>();
  for (const p of db.select().from(precedents).all()) pastSpending.set(p.id, { label: p.id, detail: describePrecedent(p) });
  const signalMap = new Map<string, { label: string; detail: string }>();
  for (const g of allSignals()) signalMap.set(g.id, { label: g.id, detail: describeSignal(g) });
  return { rules, pastSpending, signals: signalMap, stats };
}
