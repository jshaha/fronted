/**
 * RuleEngine — pure TypeScript. Tier A (school) then Tier B (org sheet).
 * Stops at the first rule that does not pass. Never calls Claude.
 */
import { formatCents, divRound } from '../money';
import { alcoholKeywordHits, bannedHits } from './alcohol';
import type { FundingSource } from '../types';

export type RuleOutcome = 'pass' | 'fail' | 'needs_info';

export type RuleResult = {
  tier: 'A' | 'B';
  ruleId: string;
  outcome: RuleOutcome;
  message: string;
  suggestion?: string;
  /** Where the rule comes from, e.g. "ASUC Finance Policy (mock) §4.2" or "sheet row 4". */
  citation: string;
};

export type LineFacts = {
  id: string;
  name: string;
  sourceRow: number;
  perHeadCapCents: number | null;
  maxPerPurchaseCents: number | null;
  requiredFields: string[];
  remainingCents: number;
};

export type RequestFacts = {
  fundingSource: FundingSource;
  amountCents: number | null;
  purpose: string | null;
  items: string[];
  line: LineFacts | null;
  eventName: string | null;
  attendeeCount: number | null;
  projectName: string | null;
  /** Receipt line items when evaluating a reimbursement (category from Claude, text for keywords). */
  receiptItems?: { description: string; category: string }[];
};

export type SchoolRuleRef = { id: string; source: string };

export type EngineResult = {
  outcome: RuleOutcome;
  results: RuleResult[];
  failed?: RuleResult;
};

const SCHOOL_SOURCES: Record<string, string> = {
  'ASUC-ALC': 'ASUC Finance Policy (mock) §4.2',
  'ASUC-BAN': 'ASUC Finance Policy (mock) §4.5',
  'ASUC-REQ': 'ASUC Finance Policy (mock) §3.1',
};

type Rule = (f: RequestFacts) => RuleResult;

/* ---------------------------------------------------------------- Tier A */

const asucAlcohol: Rule = (f) => {
  const kw = alcoholKeywordHits([f.purpose, ...f.items, ...(f.receiptItems ?? []).map((i) => i.description)]);
  const tagged = (f.receiptItems ?? []).filter((i) => i.category === 'alcohol').map((i) => i.description);
  const hit = kw.length > 0 || tagged.length > 0;
  return {
    tier: 'A',
    ruleId: 'ASUC-ALC',
    outcome: hit ? 'fail' : 'pass',
    message: hit
      ? `Alcohol isn't fundable with ASUC money (${[...new Set([...kw, ...tagged.map((t) => t.toLowerCase())])].join(', ')}).`
      : 'No alcohol in the request.',
    suggestion: hit ? 'Remove the alcohol and send the request again.' : undefined,
    citation: SCHOOL_SOURCES['ASUC-ALC'],
  };
};

const asucBanned: Rule = (f) => {
  const hits = bannedHits([f.purpose, ...f.items]);
  return {
    tier: 'A',
    ruleId: 'ASUC-BAN',
    outcome: hits.length ? 'fail' : 'pass',
    message: hits.length ? `ASUC funds can't buy: ${hits.join(', ')}.` : 'No banned categories.',
    citation: SCHOOL_SOURCES['ASUC-BAN'],
  };
};

const asucRequired: Rule = (f) => {
  const missing: string[] = [];
  if (f.amountCents == null || f.amountCents <= 0) missing.push('amount');
  if (!f.purpose || !f.purpose.trim()) missing.push('business purpose');
  if (!f.line) missing.push('budget line');
  return {
    tier: 'A',
    ruleId: 'ASUC-REQ',
    outcome: missing.length ? 'needs_info' : 'pass',
    message: missing.length ? `Missing: ${missing.join(', ')}.` : 'Amount, purpose and budget line present.',
    suggestion: missing.length ? `Tell me the ${missing.join(' and ')}.` : undefined,
    citation: SCHOOL_SOURCES['ASUC-REQ'],
  };
};

/* ---------------------------------------------------------------- Tier B */

const sheet = (l: LineFacts) => `sheet row ${l.sourceRow}`;

const FIELD_LABELS: Record<string, string> = {
  event: 'which event it is for',
  attendee_count: 'how many people are coming',
  project_name: 'which project it is for',
};

const hRequired: Rule = (f) => {
  const l = f.line!;
  const missing = l.requiredFields.filter((field) => {
    if (field === 'event') return !f.eventName;
    if (field === 'attendee_count') return !f.attendeeCount;
    if (field === 'project_name') return !f.projectName;
    return false;
  });
  return {
    tier: 'B',
    ruleId: 'H-REQ',
    outcome: missing.length ? 'needs_info' : 'pass',
    message: missing.length
      ? `${l.name} requests need ${missing.map((m) => FIELD_LABELS[m] ?? m).join(' and ')}.`
      : `${l.name} required fields present.`,
    suggestion: missing.length ? `Reply with ${missing.map((m) => FIELD_LABELS[m] ?? m).join(' and ')}.` : undefined,
    citation: sheet(l),
  };
};

const hRemaining: Rule = (f) => {
  const l = f.line!;
  const amount = f.amountCents!;
  const ok = amount <= l.remainingCents;
  return {
    tier: 'B',
    ruleId: 'H-REM',
    outcome: ok ? 'pass' : 'fail',
    message: ok
      ? `${formatCents(amount)} fits in ${l.name}'s ${formatCents(l.remainingCents)} remaining.`
      : `${l.name} has ${formatCents(Math.max(0, l.remainingCents))} left (${sheet(l)}); this request is ${formatCents(amount)}.`,
    suggestion: ok
      ? undefined
      : l.remainingCents > 0
        ? `Reduce it to ${formatCents(l.remainingCents)} or less, or ask the treasurer to move funds into ${l.name}.`
        : `Ask the treasurer to move funds into ${l.name}.`,
    citation: sheet(l),
  };
};

const hMax: Rule = (f) => {
  const l = f.line!;
  const amount = f.amountCents!;
  if (l.maxPerPurchaseCents == null)
    return { tier: 'B', ruleId: 'H-MAX', outcome: 'pass', message: `${l.name} has no per-purchase max.`, citation: sheet(l) };
  const ok = amount <= l.maxPerPurchaseCents;
  return {
    tier: 'B',
    ruleId: 'H-MAX',
    outcome: ok ? 'pass' : 'fail',
    message: ok
      ? `Under the ${formatCents(l.maxPerPurchaseCents)} per-purchase max.`
      : `${formatCents(amount)} is over ${l.name}'s ${formatCents(l.maxPerPurchaseCents)} per-purchase max (${sheet(l)}).`,
    suggestion: ok ? undefined : `Keep it at ${formatCents(l.maxPerPurchaseCents)} or less, or bring it to an exec vote.`,
    citation: sheet(l),
  };
};

const hCap: Rule = (f) => {
  const l = f.line!;
  if (l.perHeadCapCents == null || !f.attendeeCount)
    return { tier: 'B', ruleId: 'H-CAP', outcome: 'pass', message: `No per-attendee cap applies.`, citation: sheet(l) };
  const perHead = divRound(f.amountCents!, f.attendeeCount);
  const ok = perHead <= l.perHeadCapCents;
  const maxTotal = l.perHeadCapCents * f.attendeeCount;
  return {
    tier: 'B',
    ruleId: 'H-CAP',
    outcome: ok ? 'pass' : 'fail',
    message: ok
      ? `${formatCents(perHead)} per attendee is under the ${formatCents(l.perHeadCapCents)} cap.`
      : `${formatCents(perHead)} per attendee is over the ${formatCents(l.perHeadCapCents)} cap (${sheet(l)}).`,
    suggestion: ok ? undefined : `For ${f.attendeeCount} attendees, ${formatCents(maxTotal)} is the most that passes.`,
    citation: sheet(l),
  };
};

export const TIER_A: Rule[] = [asucAlcohol, asucBanned, asucRequired];
export const TIER_B: Rule[] = [hRequired, hRemaining, hMax, hCap];

export function evaluateRules(facts: RequestFacts): EngineResult {
  const results: RuleResult[] = [];
  for (const rule of [...TIER_A, ...TIER_B]) {
    const r = rule(facts);
    results.push(r);
    if (r.outcome !== 'pass') return { outcome: r.outcome, results, failed: r };
  }
  return { outcome: 'pass', results };
}
