/**
 * Citation check: code drops any reason that cites an ID that doesn't exist,
 * cites nothing, uses an unknown [[S-…]] placeholder, or states a raw $ amount.
 * If nothing survives, the advice is "unavailable" (no recommendation).
 */
import type { AdvisorOutput, BudgetStat, Citation, DroppedReason, RenderedCitation, RenderedReason } from '../types';

export type KnownIds = {
  rules: Map<string, { label: string; detail: string }>;
  pastSpending: Map<string, { label: string; detail: string }>;
  stats: BudgetStat[];
};

export type VerifiedAdvice = {
  verdict: AdvisorOutput['verdict'];
  headline: string;
  reasons: RenderedReason[];
  dropped: DroppedReason[];
  suggestedAmountCents: number | null;
};

const PLACEHOLDER = /\[\[(S-[A-Za-z0-9-]+)\]\]/g;
const RAW_DOLLAR = /\$\s?\d/;

const HEADLINES: Record<AdvisorOutput['verdict'], string> = {
  support: 'Consistent with how the org usually spends.',
  caution: 'Passes the checks, but worth a second look.',
  against: 'Passes the checks, but cuts against past decisions.',
  unavailable: 'No recommendation.',
};

/** Substitute placeholders; returns null if any placeholder is unknown or a raw $ amount is present. */
export function renderText(text: string, stats: BudgetStat[]): { ok: true; text: string } | { ok: false; why: string } {
  const withoutPlaceholders = text.replace(PLACEHOLDER, '');
  if (RAW_DOLLAR.test(withoutPlaceholders)) return { ok: false, why: 'states a dollar amount code did not compute' };
  let unknown: string | null = null;
  const rendered = text.replace(PLACEHOLDER, (_, id: string) => {
    const s = stats.find((x) => x.id === id);
    if (!s) {
      unknown = id;
      return '';
    }
    return s.display;
  });
  if (unknown) return { ok: false, why: `uses unknown number ${unknown}` };
  return { ok: true, text: rendered };
}

function resolveCite(c: Citation, known: KnownIds): RenderedCitation | null {
  if (c.type === 'rule') {
    const r = known.rules.get(c.id);
    return r ? { ...c, ...r } : null;
  }
  if (c.type === 'past_spending') {
    const p = known.pastSpending.get(c.id);
    return p ? { ...c, ...p } : null;
  }
  const s = known.stats.find((x) => x.id === c.id);
  return s ? { ...c, label: s.id, detail: `${s.label}: ${s.display}` } : null;
}

export function verifyAdvice(out: AdvisorOutput, known: KnownIds): VerifiedAdvice {
  const reasons: RenderedReason[] = [];
  const dropped: DroppedReason[] = [];

  for (const r of out.reasons) {
    if (r.cites.length === 0) {
      dropped.push({ text: r.text, why: 'cites nothing' });
      continue;
    }
    const resolved = r.cites.map((c) => ({ c, rc: resolveCite(c, known) }));
    const missing = resolved.filter((x) => !x.rc).map((x) => x.c.id);
    if (missing.length) {
      dropped.push({ text: r.text, why: `cites ${missing.join(', ')}, which ${missing.length > 1 ? "don't" : "doesn't"} exist` });
      continue;
    }
    const rendered = renderText(r.text, known.stats);
    if (!rendered.ok) {
      dropped.push({ text: r.text, why: rendered.why });
      continue;
    }
    reasons.push({ text: rendered.text, cites: resolved.map((x) => x.rc!) });
  }

  if (out.verdict === 'unavailable' || reasons.length === 0) {
    return { verdict: 'unavailable', headline: HEADLINES.unavailable, reasons: [], dropped, suggestedAmountCents: null };
  }

  const h = renderText(out.headline, known.stats);
  const headline = h.ok ? h.text : HEADLINES[out.verdict];

  let suggestedAmountCents: number | null = null;
  if (out.suggested_amount_stat) {
    const s = known.stats.find((x) => x.id === out.suggested_amount_stat && x.unit === 'cents');
    suggestedAmountCents = s ? s.value : null;
  }
  return { verdict: out.verdict, headline, reasons, dropped, suggestedAmountCents };
}
