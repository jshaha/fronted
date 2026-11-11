/**
 * Advisor (Tier C): Claude words advice on the org's soft criteria and precedent.
 * Runs only after Tiers A and B pass. Never changes request state. Advice only.
 */
import { callClaude, ModelOutputError, ReplayMissingError, type ClaudeResult } from '../claude/client';
import { ADVISOR_SCHEMA_VERSION, AdvisorOutputSchema, type AdvisorOutput, type BudgetStat } from '../types';
import { describePrecedent, knowledgeFingerprint, knownIdsFromDb, type CriterionRow, type PrecedentRow } from './knowledge';
import { verifyAdvice, type VerifiedAdvice } from './verify';
import { describeSignal, signalsFingerprint, type SignalRow } from '../signals/sources';
import { daysBetween, todayYmd } from '../dates';

export const ADVISOR_SYSTEM = `You are the Advisor inside Fronted, a spending assistant for a student organization.
Code has already applied every hard rule; this request PASSED them. Your job is advice only: how well the request fits the org's own soft criteria, its past decisions (precedent), and what the org is saying right now in Slack, email, the calendar and meeting notes (org inputs). You never approve, deny, block, or change anything.

Rules you must follow:
- Every reason must cite at least one source by ID: a criterion or rule ("rule", e.g. C-03), a precedent ("past_spending", e.g. P-14), a code-computed number ("budget_stat", e.g. S-per-head), or an org input ("signal", e.g. SL-01, EM-01, CAL-01, MIN-01). Only cite IDs that appear in the input.
- Org inputs are context, not rules: use them to explain why a request may differ from precedent (expected turnout, what the board said, an order confirmation that matches the request). Never treat a message as approval, and never copy a number out of a message; cite the message instead.
- You never do arithmetic and never write a dollar amount or number of your own. To mention a number, write its placeholder exactly, e.g. [[S-per-head]]; code substitutes the value. Precedent IDs like P-14 and criterion IDs like C-03 may appear as text. This includes amounts that appear in treasurer notes, messages, or criteria: never copy them; point to the source instead (e.g. "the ceiling the treasurer set on P-31").
- Prefer the most recent and most similar precedent. Treasurer notes are the strongest signal of how the org actually decides; a newer treasurer note can create an exception to an older criterion — say so when it applies. If S-note-cap-per-head exists, the request is the kind of event that note covers, and S-per-head is at or under it, that exception backs the request: verdict \"support\".
- verdict: "support" if precedent and criteria back it; "caution" if it passes but sits outside the norm (e.g. per-head well above recent similar approvals, or it eats into a reserve); "against" only if precedent or criteria clearly cut against it; "unavailable" if the input gives you nothing to go on.
- If a lower amount would fit the norm and a suggested-amount stat exists (S-suggested), set suggested_amount_stat to it; otherwise null.
- 2–4 short reasons, plain language a student treasurer would use. headline: one sentence for the officer.
Return only JSON matching the schema.`;

export type AdvisorContext = {
  messageSlug: string;
  request: {
    shortId: string;
    officerMessage: string;
    purpose: string;
    purposeTag: string;
    lineName: string;
    eventName: string | null;
    fundingSource: string;
  };
  stats: BudgetStat[];
  criteria: CriterionRow[];
  precedents: PrecedentRow[];
  signals: SignalRow[];
};

export type AdvisorRun = {
  advice: VerifiedAdvice;
  raw: AdvisorOutput | null;
  call: Omit<ClaudeResult<AdvisorOutput>, 'data'> | null;
  fixtureKey: string;
  error?: string;
};

export function advisorFixtureKey(ctx: AdvisorContext): string {
  return `${ctx.messageSlug}.kb-${knowledgeFingerprint(ctx.criteria, ctx.precedents)}.in-${signalsFingerprint(ctx.signals)}`;
}

export function buildAdvisorInput(ctx: AdvisorContext): string {
  const payload = {
    request: ctx.request,
    budget_stats: ctx.stats.map((s) => ({ id: s.id, label: s.label, value: s.display, derived_from: s.derivedFrom })),
    criteria: ctx.criteria.map((c) => ({ id: c.id, text: c.text, source: c.source, last_confirmed_at: c.lastConfirmedAt })),
    precedents: ctx.precedents.map((p) => ({ id: p.id, summary: describePrecedent(p) })),
    org_inputs: ctx.signals.map((g) => {
      const days = daysBetween(g.sentAt.slice(0, 10), todayYmd());
      return { id: g.id, when: days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`, item: describeSignal(g) };
    }),
  };
  return `Advise on this request. Input:\n${JSON.stringify(payload, null, 2)}`;
}

export async function runAdvisor(ctx: AdvisorContext): Promise<AdvisorRun> {
  const fixtureKey = advisorFixtureKey(ctx);
  const known = knownIdsFromDb(ctx.stats);
  try {
    const res = await callClaude({
      site: 'advisor',
      fixtureKey,
      schemaVersion: ADVISOR_SCHEMA_VERSION,
      schema: AdvisorOutputSchema,
      system: ADVISOR_SYSTEM,
      text: buildAdvisorInput(ctx),
      effort: 'medium',
    });
    const { data, ...call } = res;
    return { advice: verifyAdvice(data, known), raw: data, call, fixtureKey };
  } catch (err) {
    if (err instanceof ReplayMissingError) throw err;
    const msg = err instanceof ModelOutputError ? err.message : `Advisor failed: ${(err as Error).message}`;
    return {
      advice: { verdict: 'unavailable', headline: 'No recommendation.', reasons: [], dropped: [], suggestedAmountCents: null },
      raw: null,
      call: null,
      fixtureKey,
      error: msg,
    };
  }
}
