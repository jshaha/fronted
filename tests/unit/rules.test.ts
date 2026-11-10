import { describe, it, expect } from 'vitest';
import { evaluateRules, type RequestFacts, type LineFacts } from '@/lib/rules/engine';
import { alcoholKeywordHits, bannedHits } from '@/lib/rules/alcohol';
import { formatCents } from '@/lib/money';

describe('rules', () => {
  const baseLine: LineFacts = {
    id: 'L-FOOD',
    name: 'Food & Events',
    sourceRow: 2,
    perHeadCapCents: 800,
    maxPerPurchaseCents: 40000,
    requiredFields: ['event', 'attendee_count'],
    remainingCents: 36815,
  };

  const baseFacts: RequestFacts = {
    fundingSource: 'program_card',
    amountCents: 5000,
    purpose: 'pizza for GM',
    items: ['pizza'],
    line: baseLine,
    eventName: 'GM',
    attendeeCount: 12,
    projectName: null,
  };

  const facts = (overrides?: Partial<RequestFacts>): RequestFacts => ({ ...baseFacts, ...overrides });

  describe('evaluateRules', () => {
    it('baseline passes all 7 rules (3 Tier A + 4 Tier B)', () => {
      const result = evaluateRules(facts());
      expect(result.outcome).toBe('pass');
      expect(result.results).toHaveLength(7);
      expect(result.results.every((r) => r.outcome === 'pass')).toBe(true);
      expect(result.failed).toBeUndefined();
    });

    describe('Tier A: school rules', () => {
      it('alcohol keyword in items → ASUC-ALC fail', () => {
        const result = evaluateRules(facts({ items: ['beer'] }));
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-ALC');
        expect(result.results).toHaveLength(1); // stops at first failure
      });

      it('alcohol keyword in purpose → ASUC-ALC fail', () => {
        const result = evaluateRules(facts({ purpose: 'wine for event' }));
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-ALC');
      });

      it('hard cider detected in items → ASUC-ALC fail', () => {
        const result = evaluateRules(facts({ items: ['hard cider'] }));
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-ALC');
      });

      it('plain apple cider not detected as alcohol', () => {
        const result = evaluateRules(facts({ items: ['apple cider'] }));
        expect(result.outcome).toBe('pass');
      });

      it('ginger ale: check actual regex behavior', () => {
        const hits = alcoholKeywordHits(['ginger ale']);
        // ginger ale should not be flagged by the patterns
        expect(hits).toHaveLength(0);
      });

      it('receipt category alcohol flag → ASUC-ALC fail', () => {
        const result = evaluateRules(
          facts({
            receiptItems: [{ description: 'juice', category: 'alcohol' }],
          })
        );
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-ALC');
      });

      it('ASUC-BAN: gift card → fail', () => {
        const result = evaluateRules(facts({ items: ['gift card'] }));
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-BAN');
      });

      it('ASUC-BAN: cash equivalent (venmo payment) → fail', () => {
        const result = evaluateRules(facts({ purpose: 'venmo payment to alice' }));
        expect(result.outcome).toBe('fail');
        expect(result.failed?.ruleId).toBe('ASUC-BAN');
      });

      it('ASUC-REQ: missing amount → needs_info', () => {
        const result = evaluateRules(facts({ amountCents: null }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('ASUC-REQ');
      });

      it('ASUC-REQ: amount <= 0 → needs_info', () => {
        const result = evaluateRules(facts({ amountCents: 0 }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('ASUC-REQ');
      });

      it('ASUC-REQ: missing purpose → needs_info', () => {
        const result = evaluateRules(facts({ purpose: null }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('ASUC-REQ');
      });

      it('ASUC-REQ: missing line → needs_info', () => {
        const result = evaluateRules(facts({ line: null }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('ASUC-REQ');
      });
    });

    describe('Tier B: org sheet rules', () => {
      it('H-REQ: missing required attendeeCount → needs_info', () => {
        const result = evaluateRules(facts({ attendeeCount: null }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('H-REQ');
      });

      it('H-REQ: missing required eventName → needs_info', () => {
        const result = evaluateRules(facts({ eventName: null }));
        expect(result.outcome).toBe('needs_info');
        expect(result.failed?.ruleId).toBe('H-REQ');
      });

      it('H-REM: amount fits remaining → pass', () => {
        // $90 for 12 attendees = $7.50/head: fits remaining and stays under the $8 cap.
        const result = evaluateRules(facts({ amountCents: 9000 }));
        expect(result.outcome).toBe('pass');
        const hRem = result.results.find((r) => r.ruleId === 'H-REM');
        expect(hRem?.outcome).toBe('pass');
      });

      it('H-REM: amount over remaining → fail with suggestion', () => {
        const marketing = { id: 'L-MKT', name: 'Marketing', sourceRow: 4, perHeadCapCents: null, maxPerPurchaseCents: 15000, requiredFields: [], remainingCents: 8550 };
        const result = evaluateRules(facts({ amountCents: 12000, line: marketing, eventName: null, attendeeCount: null, purpose: 'stickers', items: ['stickers'] }));
        expect(result.failed?.ruleId).toBe('H-REM');
        expect(result.failed?.message).toContain('$85.50');
        expect(result.failed?.message).toContain('sheet row 4');
        expect(result.failed?.suggestion).toBeDefined();
        expect(result.failed?.suggestion).toContain('$85.50');
      });

      it('H-MAX: amount over max per purchase → fail', () => {
        const tooMuch = facts({
          line: { ...baseLine, maxPerPurchaseCents: 15000 },
          amountCents: 20000,
        });
        const result = evaluateRules(tooMuch);
        expect(result.failed?.ruleId).toBe('H-MAX');
        expect(result.failed?.message).toContain('over');
      });

      it('H-CAP: per-head over cap → fail with suggestion', () => {
        const result = evaluateRules(facts({ amountCents: 12000, attendeeCount: 12 }));
        // 12000 / 12 = $1000/head, cap is $800/head
        expect(result.failed?.ruleId).toBe('H-CAP');
        expect(result.failed?.message).toContain('over');
        expect(result.failed?.suggestion).toBeDefined();
        expect(result.failed?.suggestion).toContain('$96.00'); // 800 * 12 / 100
      });

      it('H-CAP: per-head within cap → pass', () => {
        const result = evaluateRules(facts({ amountCents: 9600, attendeeCount: 12 }));
        // 9600 / 12 = $800/head, exactly at cap
        expect(result.outcome).toBe('pass');
      });

      it('order of Tier B checks: H-REQ comes before H-REM', () => {
        const result = evaluateRules(facts({ attendeeCount: null, amountCents: 50000 }));
        // Should fail on H-REQ (missing attendee) not H-REM (over budget)
        expect(result.failed?.ruleId).toBe('H-REQ');
      });
    });

    describe('stop-at-first-failure', () => {
      it('stops at ASUC-ALC even if other issues exist', () => {
        const result = evaluateRules(
          facts({ items: ['beer'], amountCents: 50000 }) // both alcohol and over budget
        );
        expect(result.results).toHaveLength(1);
        expect(result.failed?.ruleId).toBe('ASUC-ALC');
      });

      it('stops at first Tier B failure', () => {
        const result = evaluateRules(
          facts({
            attendeeCount: null, // missing required field
            amountCents: 50000, // also over budget
          })
        );
        expect(result.results.length).toBeLessThan(7);
        expect(result.failed?.ruleId).toBe('H-REQ');
      });
    });
  });

  describe('alcohol detection', () => {
    it('alcoholKeywordHits finds beer', () => {
      const hits = alcoholKeywordHits(['beer']);
      expect(hits).toContain('beer');
    });

    it('alcoholKeywordHits finds hard seltzer', () => {
      const hits = alcoholKeywordHits(['hard seltzer']);
      expect(hits).toContain('hard seltzer');
    });

    it('alcoholKeywordHits finds brand names', () => {
      const hits = alcoholKeywordHits(['Corona']);
      expect(hits).toContain('corona');
    });

    it('bannedHits finds gift card', () => {
      const hits = bannedHits(['buy gift cards for raffle']);
      expect(hits).toContain('gift card');
    });

    it('bannedHits finds donation', () => {
      const hits = bannedHits(['donations to homeless shelter']);
      expect(hits).toContain('donation');
    });

    it('bannedHits finds personal use', () => {
      const hits = bannedHits(['personal use items']);
      expect(hits).toContain('personal-use item');
    });
  });
});
