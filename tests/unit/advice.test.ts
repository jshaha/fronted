import { describe, it, expect } from 'vitest';
import { verifyAdvice, renderText } from '@/lib/advisor/verify';
import { computeBudgetStats, type StatPrecedent, type StatCriterion } from '@/lib/advisor/budgetStats';
import type { AdvisorOutput, BudgetStat } from '@/lib/types';
import type { KnownIds } from '@/lib/advisor/verify';

describe('advisor', () => {
  describe('computeBudgetStats', () => {
    it('computes basic stats for single amount', () => {
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: null,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [],
        criteria: [],
      });
      const amount = stats.find((s) => s.id === 'S-amount');
      expect(amount?.value).toBe(5000);
      expect(amount?.display).toBe('$50.00');
    });

    it('reads a per-head ceiling from the newest treasurer note', () => {
      const stats = computeBudgetStats({
        amountCents: 6000,
        attendeeCount: 14,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [
          { id: 'P-09', amountCents: 9000, approvedCents: null, attendeeCount: 15, outcome: 'denied', decidedAt: '2026-10-01', treasurerNote: 'Too much. Keep it under $3 a head.' },
          { id: 'P-31', amountCents: 5000, approvedCents: 5000, attendeeCount: 12, outcome: 'approved', decidedAt: '2026-11-10', treasurerNote: 'Recruiting GMs can go up to about $4.50 a head.' },
        ],
        criteria: [],
      });
      const cap = stats.find((s) => s.id === 'S-note-cap-per-head');
      expect(cap?.value).toBe(450);
      expect(cap?.derivedFrom).toEqual(['P-31']);
    });

    it('ignores per-head amounts that describe spending rather than set a ceiling', () => {
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [
          { id: 'P-05', amountCents: 5580, approvedCents: 4800, attendeeCount: 16, outcome: 'approved_reduced', decidedAt: '2026-03-05', treasurerNote: 'Trim the soda. Aim for about $3 a head.' },
          { id: 'P-19', amountCents: 4640, approvedCents: 4640, attendeeCount: 16, outcome: 'approved', decidedAt: '2026-10-15', treasurerNote: 'Good: 16 RSVPs, about $2.90 a head.' },
        ],
        criteria: [],
      });
      expect(stats.find((s) => s.id === 'S-note-cap-per-head')).toBeUndefined();
    });

    it('computes per-head stat when attendee count present', () => {
      const stats = computeBudgetStats({
        amountCents: 9600,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [],
        criteria: [],
      });
      const perHead = stats.find((s) => s.id === 'S-per-head');
      expect(perHead).toBeDefined();
      expect(perHead!.value).toBe(800); // 9600 / 12
      expect(perHead!.display).toBe('$8.00');
    });

    it('computes recent average per head from approved precedents', () => {
      const precedents: StatPrecedent[] = [
        { id: 'P-11', amountCents: 4032, approvedCents: 4032, attendeeCount: 12, outcome: 'approved', decidedAt: '2026-09-03' },
        { id: 'P-14', amountCents: 5880, approvedCents: 5880, attendeeCount: 14, outcome: 'approved', decidedAt: '2026-09-17' },
        { id: 'P-16', amountCents: 2900, approvedCents: 2900, attendeeCount: 10, outcome: 'approved', decidedAt: '2026-10-01' },
        { id: 'P-19', amountCents: 7440, approvedCents: 7440, attendeeCount: 16, outcome: 'approved', decidedAt: '2026-10-15' },
        { id: 'P-22', amountCents: 4901, approvedCents: 4901, attendeeCount: 13, outcome: 'approved', decidedAt: '2026-10-29' },
      ];
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents,
        criteria: [],
        recentN: 5,
      });
      const recentAvg = stats.find((s) => s.id === 'S-recent-avg-per-head');
      expect(recentAvg).toBeDefined();
      // Sum of approved: 4032 + 5880 + 2900 + 7440 + 4901 = 25153
      // Sum of attendees: 12 + 14 + 10 + 16 + 13 = 65
      // Avg: 25153 / 65 = 386.97... ≈ $3.87
      expect(recentAvg!.display).toBe('$3.87');
      // newest first
      expect(recentAvg!.derivedFrom).toEqual(['P-22', 'P-19', 'P-16', 'P-14', 'P-11']);
    });

    it('excludes denied precedents from recent average', () => {
      const precedents: StatPrecedent[] = [
        { id: 'P-08', amountCents: 4410, approvedCents: null, attendeeCount: 14, outcome: 'denied', decidedAt: '2026-04-02' },
        { id: 'P-09', amountCents: 12000, approvedCents: null, attendeeCount: 20, outcome: 'denied', decidedAt: '2026-05-01' },
        { id: 'P-14', amountCents: 5880, approvedCents: 5880, attendeeCount: 14, outcome: 'approved', decidedAt: '2026-09-17' },
        { id: 'P-16', amountCents: 2900, approvedCents: 2900, attendeeCount: 10, outcome: 'approved', decidedAt: '2026-10-01' },
      ];
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents,
        criteria: [],
      });
      const recentAvg = stats.find((s) => s.id === 'S-recent-avg-per-head');
      expect(recentAvg?.derivedFrom).toEqual(['P-16', 'P-14']);
    });

    it('computes per-head target from criteria', () => {
      const criteria: StatCriterion[] = [
        { id: 'C-03', paramCents: 300, paramKind: 'per_head_target' },
      ];
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [],
        criteria,
      });
      const suggested = stats.find((s) => s.id === 'S-suggested');
      expect(suggested).toBeDefined();
      expect(suggested!.value).toBe(3600); // 300 * 12
      expect(suggested!.display).toBe('$36.00');
    });

    it('computes reserve floor stat', () => {
      const criteria: StatCriterion[] = [
        { id: 'C-04', paramCents: 20000, paramKind: 'reserve_floor' },
      ];
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: null,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [],
        criteria,
      });
      const aboveReserve = stats.find((s) => s.id === 'S-above-reserve-after');
      expect(aboveReserve).toBeDefined();
      expect(aboveReserve!.value).toBe(11815); // 36815 - 5000 - 20000
    });

    it('computes upcoming events count', () => {
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: 12,
        line: { name: 'Food & Events', sourceRow: 2, remainingCents: 36815 },
        precedents: [],
        criteria: [],
        upcomingSameType: { count: 3, typeLabel: 'GMs' },
      });
      const eventsLeft = stats.find((s) => s.id === 'S-events-left');
      expect(eventsLeft).toBeDefined();
      expect(eventsLeft!.value).toBe(3);
      expect(eventsLeft!.display).toBe('3');
    });

    it('includes days since purchase for reimbursements', () => {
      const stats = computeBudgetStats({
        amountCents: 5000,
        attendeeCount: null,
        line: { name: 'Project Hardware', sourceRow: 3, remainingCents: 105233 },
        precedents: [],
        criteria: [],
        daysSincePurchase: 5,
      });
      const days = stats.find((s) => s.id === 'S-days-since-purchase');
      expect(days).toBeDefined();
      expect(days!.value).toBe(5);
    });
  });

  describe('verifyAdvice', () => {
    const stats: BudgetStat[] = [
      { id: 'S-per-head', label: 'Per head', value: 417, unit: 'cents', display: '$4.17', derivedFrom: [] },
      { id: 'S-recent-avg-per-head', label: 'Recent avg', value: 290, unit: 'cents', display: '$2.90', derivedFrom: ['P-14', 'P-19'] },
      { id: 'S-suggested', label: 'Suggested', value: 3600, unit: 'cents', display: '$36.00', derivedFrom: ['C-03'] },
      { id: 'S-above-reserve-after', label: 'Reserve', value: 11815, unit: 'cents', display: '$118.15', derivedFrom: ['C-04'] },
      { id: 'S-events-left', label: 'Events left', value: 3, unit: 'count', display: '3', derivedFrom: [] },
    ];

    const known: KnownIds = {
      rules: new Map([
        ['C-03', { label: 'Per-head target', detail: 'Target $3/head' }],
        ['H-REM', { label: 'Remaining', detail: 'Budget remaining' }],
      ]),
      pastSpending: new Map([
        ['P-14', { label: 'GM Sep 17', detail: 'Approved $58.80' }],
        ['P-19', { label: 'GM Oct 15', detail: 'Approved $74.40' }],
      ]),
      signals: new Map([['SL-01', { label: 'SL-01', detail: 'Slack #events, Priya Raman: 41 people signed the interest sheet' }]]),
      stats,
    };

    it('accepts a reason that cites an org input (Slack) by ID', () => {
      const out = verifyAdvice(
        { verdict: 'caution', headline: 'Turnout may beat RSVPs.', reasons: [{ text: 'Tabling interest suggests walk-ins.', cites: [{ type: 'signal', id: 'SL-01' }] }], suggested_amount_stat: null },
        known,
      );
      expect(out.reasons).toHaveLength(1);
      expect(out.reasons[0].cites[0]).toMatchObject({ type: 'signal', id: 'SL-01', label: 'SL-01' });
    });

    it('drops a reason that cites an org input that does not exist', () => {
      const out = verifyAdvice(
        {
          verdict: 'caution',
          headline: 'x',
          reasons: [
            { text: 'Email says it is fine.', cites: [{ type: 'signal', id: 'EM-99' }] },
            { text: 'Above the recent average.', cites: [{ type: 'past_spending', id: 'P-14' }] },
          ],
          suggested_amount_stat: null,
        },
        known,
      );
      expect(out.reasons).toHaveLength(1);
      expect(out.dropped[0].why).toMatch(/EM-99/);
    });

    it('accepts valid advice with all placeholders resolved', () => {
      const output: AdvisorOutput = {
        verdict: 'caution',
        headline: 'Your spend is [[S-per-head]], recent was [[S-recent-avg-per-head]]',
        reasons: [
          { text: 'You spent [[S-per-head]] per head, vs recent [[S-recent-avg-per-head]].', cites: [{ type: 'budget_stat', id: 'S-per-head' }] },
        ],
        suggested_amount_stat: 'S-suggested',
      };
      const result = verifyAdvice(output, known);
      expect(result.verdict).toBe('caution');
      expect(result.headline).toBe('Your spend is $4.17, recent was $2.90');
      expect(result.reasons).toHaveLength(1);
      expect(result.suggestedAmountCents).toBe(3600);
    });

    it('drops reason citing nonexistent precedent', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good spend',
        reasons: [{ text: 'You matched P-99 which is great.', cites: [{ type: 'past_spending', id: 'P-99' }] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].why).toContain('P-99');
    });

    it('drops reason with no citations', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [{ text: 'Just feels right.', cites: [] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].why).toBe('cites nothing');
    });

    it('drops reason with raw dollar amount (not placeholder)', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [{ text: 'This matches our $4.50 guideline.', cites: [{ type: 'rule', id: 'C-03' }] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].why).toContain('states a dollar amount');
    });

    it('drops reason with unknown placeholder', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [{ text: 'You spent [[S-nope]] which is unusual.', cites: [{ type: 'past_spending', id: 'P-14' }] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].why).toContain('unknown number');
    });

    it('renders valid reason with stat citation', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Great choice',
        reasons: [{ text: 'You matched the [[S-per-head]] target.', cites: [{ type: 'budget_stat', id: 'S-per-head' }] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].text).toBe('You matched the $4.17 target.');
      expect(result.reasons[0].cites).toHaveLength(1);
      expect(result.reasons[0].cites[0].id).toBe('S-per-head');
    });

    it('renders citation details from rules and past spending', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [
          {
            text: 'Consistent with precedent [[S-per-head]].',
            cites: [
              { type: 'rule', id: 'C-03' },
              { type: 'past_spending', id: 'P-14' },
            ],
          },
        ],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].cites).toHaveLength(2);
      expect(result.reasons[0].cites[0].label).toBe('Per-head target');
      expect(result.reasons[0].cites[1].label).toBe('GM Sep 17');
    });

    it('returns unavailable verdict when all reasons are dropped', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [
          { text: 'Cites P-99 which does not exist.', cites: [{ type: 'past_spending', id: 'P-99' }] },
          { text: 'Also no cites.', cites: [] },
        ],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.verdict).toBe('unavailable');
      expect(result.headline).toBe('No recommendation.');
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(2);
    });

    it('suggested_amount_stat pointing to non-cents stat returns null', () => {
      const countStat: BudgetStat = { id: 'S-count', label: 'Count', value: 5, unit: 'count', display: '5', derivedFrom: [] };
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [],
        suggested_amount_stat: 'S-count',
      };
      const resultKnown: KnownIds = { ...known, stats: [...stats, countStat] };
      const result = verifyAdvice(output, resultKnown);
      expect(result.suggestedAmountCents).toBeNull();
    });

    it('suggested_amount_stat to nonexistent stat returns null', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [],
        suggested_amount_stat: 'S-nonexistent',
      };
      const result = verifyAdvice(output, known);
      expect(result.suggestedAmountCents).toBeNull();
    });

    it('drops reason with rule ID but wrong type (type=rule but id=precedent)', () => {
      const output: AdvisorOutput = {
        verdict: 'support',
        headline: 'Good',
        reasons: [{ text: 'Matches the precedent.', cites: [{ type: 'rule', id: 'P-14' }] }],
        suggested_amount_stat: null,
      };
      const result = verifyAdvice(output, known);
      expect(result.reasons).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
      // P-14 is not in the rules map, so it's dropped as nonexistent
    });
  });

  describe('renderText', () => {
    const stats: BudgetStat[] = [
      { id: 'S-per-head', label: 'Per head', value: 417, unit: 'cents', display: '$4.17', derivedFrom: [] },
    ];

    it('renders placeholder to stat display', () => {
      const result = renderText('You spent [[S-per-head]] per attendee.', stats);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.text).toBe('You spent $4.17 per attendee.');
    });

    it('rejects unknown placeholder', () => {
      const result = renderText('You spent [[S-unknown]] per attendee.', stats);
      expect(result.ok).toBe(false);
      expect((result as { why?: string }).why).toContain('S-unknown');
    });

    it('rejects raw dollar amount', () => {
      const result = renderText('You spent $4.17 per attendee.', stats);
      expect(result.ok).toBe(false);
      expect((result as { why?: string }).why).toContain('dollar amount');
    });

    it('allows dollar amount in a placeholder context', () => {
      const result = renderText('Target is [[S-per-head]].', stats);
      expect(result.ok).toBe(true);
    });

    it('allows text with no dollar amounts or placeholders', () => {
      const result = renderText('This is fine.', stats);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.text).toBe('This is fine.');
    });
  });
});
