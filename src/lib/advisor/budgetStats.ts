/**
 * Every number the Advisor may say is computed here, by code, as a citable
 * budget_stat. Claude only words them via [[S-…]] placeholders.
 */
import { formatCents, divRound } from '../money';
import type { BudgetStat } from '../types';

export type StatPrecedent = {
  id: string;
  amountCents: number;
  approvedCents: number | null;
  attendeeCount: number | null;
  outcome: 'approved' | 'approved_reduced' | 'denied';
  decidedAt: string;
};

export type StatCriterion = { id: string; paramCents: number | null; paramKind: 'per_head_target' | 'reserve_floor' | 'threshold' | null };

export type StatsInput = {
  amountCents: number;
  attendeeCount: number | null;
  line: { name: string; sourceRow: number; remainingCents: number };
  /** Same line + purpose tag, any order (sorted here). */
  precedents: StatPrecedent[];
  criteria: StatCriterion[];
  /** Upcoming same-type events on/after today, including this request's event. */
  upcomingSameType?: { count: number; typeLabel: string };
  /** Reimbursements: days between purchase and today. */
  daysSincePurchase?: number | null;
  /** Number of recent precedents averaged for the per-head stat. */
  recentN?: number;
};

const cents = (id: string, label: string, value: number, derivedFrom: string[]): BudgetStat => ({
  id,
  label,
  value,
  unit: 'cents',
  display: formatCents(value),
  derivedFrom,
});
const count = (id: string, label: string, value: number, derivedFrom: string[]): BudgetStat => ({
  id,
  label,
  value,
  unit: 'count',
  display: String(value),
  derivedFrom,
});

export function computeBudgetStats(input: StatsInput): BudgetStat[] {
  const out: BudgetStat[] = [];
  const sheet = `sheet row ${input.line.sourceRow}`;
  const n = input.recentN ?? 5;

  out.push(cents('S-amount', 'Requested amount', input.amountCents, []));
  out.push(cents('S-line-remaining', `${input.line.name} remaining before this request`, input.line.remainingCents, [sheet]));
  out.push(cents('S-line-remaining-after', `${input.line.name} remaining if approved`, input.line.remainingCents - input.amountCents, [sheet]));

  if (input.attendeeCount) {
    out.push(count('S-attendees', 'Attendees (RSVPs)', input.attendeeCount, []));
    out.push(cents('S-per-head', 'Requested per head', divRound(input.amountCents, input.attendeeCount), []));
  }

  // Average per head over the last N approved, same-tag precedents that have attendee counts.
  const recent = input.precedents
    .filter((p) => p.outcome !== 'denied' && p.attendeeCount && (p.approvedCents ?? 0) > 0)
    .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : b.id.localeCompare(a.id)))
    .slice(0, n);
  if (recent.length >= 2) {
    const total = recent.reduce((a, p) => a + (p.approvedCents ?? 0), 0);
    const heads = recent.reduce((a, p) => a + (p.attendeeCount ?? 0), 0);
    out.push(
      cents(
        'S-recent-avg-per-head',
        `Average per head, last ${recent.length} similar approvals`,
        divRound(total, heads),
        recent.map((p) => p.id),
      ),
    );
    out.push(count('S-recent-count', 'Similar approvals averaged', recent.length, recent.map((p) => p.id)));
  }

  for (const c of input.criteria) {
    if (c.paramCents == null) continue;
    if (c.paramKind === 'per_head_target' && input.attendeeCount) {
      out.push(cents('S-target-per-head', `Per-head target (${c.id})`, c.paramCents, [c.id]));
      out.push(cents('S-suggested', `Suggested amount: target × attendees (${c.id})`, c.paramCents * input.attendeeCount, [c.id]));
    }
    if (c.paramKind === 'reserve_floor') {
      out.push(cents('S-reserve', `Reserve to keep (${c.id})`, c.paramCents, [c.id]));
      out.push(
        cents('S-above-reserve-after', `Left above the ${c.id} reserve if approved`, input.line.remainingCents - input.amountCents - c.paramCents, [c.id, sheet]),
      );
    }
    if (c.paramKind === 'threshold') {
      out.push(cents(`S-threshold-${c.id}`, `Threshold in ${c.id}`, c.paramCents, [c.id]));
    }
  }

  if (input.upcomingSameType) {
    out.push(count('S-events-left', `${input.upcomingSameType.typeLabel} left this semester (incl. this one)`, input.upcomingSameType.count, []));
  }
  if (input.daysSincePurchase != null) {
    out.push(count('S-days-since-purchase', 'Days since purchase', input.daysSincePurchase, []));
  }
  return out;
}
