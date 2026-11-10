import { describe, it, expect } from 'vitest';
import { computeTotals, lineSummaries } from '@/lib/ledger';
import { useFreshDb } from '@/lib/db/client';
import { resetAndSeed } from '@/lib/db/seed';
import type { LedgerRow } from '@/lib/ledger';

describe('ledger', () => {
  describe('computeTotals(allocated, rows)', () => {
    it('returns correct totals for empty ledger', () => {
      const result = computeTotals(50000, []);
      expect(result).toEqual({
        allocated: 50000,
        spent: 0,
        committed: 0,
        remaining: 50000,
        unreconciled: 0,
      });
    });

    it('commit adds to committed', () => {
      const rows: LedgerRow[] = [{ lineId: 'L-FOOD', kind: 'commit', amountCents: 5000, fundingSource: 'program_card' }];
      const result = computeTotals(50000, rows);
      expect(result.committed).toBe(5000);
      expect(result.remaining).toBe(45000); // 50000 - 0 - 5000
    });

    it('release subtracts from committed', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'commit', amountCents: 5000, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'release', amountCents: 5000, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.committed).toBe(0);
      expect(result.remaining).toBe(50000);
    });

    it('card_settled adds to both spent and unreconciled', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: 4873, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.spent).toBe(4873);
      expect(result.unreconciled).toBe(4873);
      expect(result.remaining).toBe(45127); // 50000 - 4873 - 0
    });

    it('filed(program_card) reduces unreconciled only', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: 4873, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'filed', amountCents: 4873, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.spent).toBe(4873);
      expect(result.unreconciled).toBe(0); // card_settled 4873 - filed 4873
      expect(result.remaining).toBe(45127);
    });

    it('filed(out_of_pocket) adds to spent', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'filed', amountCents: 4873, fundingSource: 'out_of_pocket' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.spent).toBe(4873);
      expect(result.unreconciled).toBe(0);
      expect(result.remaining).toBe(45127);
    });

    it('adjust (positive) adds to spent and unreconciled for program_card', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: 5000, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'adjust', amountCents: -5000, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      // card_settled: spent += 5000, unreconciled += 5000
      // adjust: spent -= 5000, unreconciled -= 5000
      expect(result.spent).toBe(0);
      expect(result.unreconciled).toBe(0);
    });

    it('full card lifecycle: commit → release + card_settled → filed', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'commit', amountCents: 5000, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'release', amountCents: 5000, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: 4873, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'filed', amountCents: 4873, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.committed).toBe(0); // 5000 - 5000
      expect(result.spent).toBe(4873); // card_settled 4873
      expect(result.unreconciled).toBe(0); // 4873 - 4873
      expect(result.remaining).toBe(45127); // 50000 - 4873 - 0
    });

    it('alcohol-cancel lifecycle: commit → release + card_settled, never filed → adjust clears unreconciled', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'commit', amountCents: 5952, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'release', amountCents: 5952, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: 5952, fundingSource: 'program_card' },
        { lineId: 'L-FOOD', kind: 'adjust', amountCents: -5952, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.committed).toBe(0);
      expect(result.spent).toBe(0); // 5952 - 5952
      expect(result.unreconciled).toBe(0); // 5952 - 5952
      expect(result.remaining).toBe(50000);
    });

    it('throws for negative non-adjust amounts', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'commit', amountCents: -5000, fundingSource: 'program_card' },
      ];
      expect(() => computeTotals(50000, rows)).toThrow('ledger commit amount must be positive');
    });

    it('throws for negative card_settled amount', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'card_settled', amountCents: -100, fundingSource: 'program_card' },
      ];
      expect(() => computeTotals(50000, rows)).toThrow('ledger card_settled amount must be positive');
    });

    it('throws for negative filed amount', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'filed', amountCents: -100, fundingSource: 'program_card' },
      ];
      expect(() => computeTotals(50000, rows)).toThrow('ledger filed amount must be positive');
    });

    it('allows negative adjust amounts', () => {
      const rows: LedgerRow[] = [
        { lineId: 'L-FOOD', kind: 'adjust', amountCents: -100, fundingSource: 'program_card' },
      ];
      const result = computeTotals(50000, rows);
      expect(result.spent).toBe(-100);
    });
  });

  describe('lineSummaries() integration test with DB', () => {
    it('returns correct summaries after seeding', () => {
      useFreshDb();
      resetAndSeed();
      const summaries = lineSummaries();

      const food = summaries.find((l) => l.id === 'L-FOOD');
      expect(food).toBeDefined();
      expect(food!.name).toBe('Food & Events');
      expect(food!.remaining).toBe(36815);
      expect(food!.unreconciled).toBe(0);
      expect(food!.committed).toBe(0);

      const hardware = summaries.find((l) => l.id === 'L-HW');
      expect(hardware).toBeDefined();
      expect(hardware!.name).toBe('Project Hardware');
      expect(hardware!.remaining).toBe(105233);
      expect(hardware!.unreconciled).toBe(0);

      const marketing = summaries.find((l) => l.id === 'L-MKT');
      expect(marketing).toBeDefined();
      expect(marketing!.name).toBe('Marketing');
      expect(marketing!.remaining).toBe(8550);
      expect(marketing!.unreconciled).toBe(0);
    });
  });
});
