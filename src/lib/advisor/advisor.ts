/**
 * Advisor (Tier C): Claude words advice on the org's soft criteria and precedent.
 * Runs only after Tiers A and B pass. Never changes request state. Advice only.
 */
import { callClaude, ModelOutputError, ReplayMissingError, type ClaudeResult } from '../claude/client';
import { ADVISOR_SCHEMA_VERSION, AdvisorOutputSchema, type AdvisorOutput, type BudgetStat } from '../types';
import { describePrecedent, knowledgeFingerprint, knownIdsFromDb, type CriterionRow, type PrecedentRow } from './knowledge';
import { verifyAdvice, type VerifiedAdvice } from './verify';

export const ADVISOR_SYSTEM = `You are the Advisor inside Fronted, a spending assistant for a student organization.
Code has already applied every hard rule; this request PASSED them. Your job is advice only: how well the request fits the org's own soft criteria and its past decisions (precedent). You never approve, deny, block, or change anything.

Rules you must follow:
- Every reason must cite at least one source by ID: a criterion or rule ("rule", e.g. C-03), a precedent ("past_spending", e.g. P-14), or a code-computed number ("budget_stat", e.g. S-per-head). Only cite IDs that appear in the input.
- You never do arithmetic and never write a dollar amount or number of your own. To mention a number, write its placeholder exactly, e.g. [[S-per-head]]; code substitutes the value. Precedent IDs like P-14 and criterion IDs like C-03 may appear as text.
- Prefer the most recent and most similar precedent. Treasurer notes are the strongest signal of how the org actually decides; a newer treasurer note can create an exception to an older criterion — say so when it applies.
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
};

export type AdvisorRun = {
  advice: VerifiedAdvice;
  raw: AdvisorOutput | null;
  call: Omit<ClaudeResult<AdvisorOutput>, 'data'> | null;
  fixtureKey: string;
  error?: string;
};

export function advisorFixtureKey(ctx: AdvisorContext): string {
  return `${ctx.messageSlug}.kb-${knowledgeFingerprint(ctx.criteria, ctx.precedents)}`;
}

export function buildAdvisorInput(ctx: AdvisorContext): string {
  const payload = {
    request: ctx.request,
    budget_stats: ctx.stats.map((s) => ({ id: s.id, label: s.label, value: s.display, derived_from: s.derivedFrom })),
    criteria: ctx.criteria.map((c) => ({ id: c.id, text: c.text, source: c.source, last_confirmed_at: c.lastConfirmedAt })),
    precedents: ctx.precedents.map((p) => ({ id: p.id, summary: describePrecedent(p) })),
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
