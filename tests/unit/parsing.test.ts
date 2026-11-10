import { describe, it, expect } from 'vitest';
import { parseMoneyToCents, formatCents, centsToPlain, withBuffer, divRound } from '@/lib/money';
import { slugify } from '@/lib/claude/client';
import { parseTreasurerCommand } from '@/lib/pipeline/treasurer';
import { nextWeekday, ymdToUs, addDays, daysBetween, WEEKDAYS } from '@/lib/dates';

describe('parsing and formatting', () => {
  describe('parseMoneyToCents', () => {
    it('parses "$50" to 5000', () => {
      expect(parseMoneyToCents('$50')).toBe(5000);
    });

    it('parses "50.00" to 5000', () => {
      expect(parseMoneyToCents('50.00')).toBe(5000);
    });

    it('parses "$1,149.00" to 114900', () => {
      expect(parseMoneyToCents('$1,149.00')).toBe(114900);
    });

    it('parses "86.4" to 8640', () => {
      expect(parseMoneyToCents('86.4')).toBe(8640);
    });

    it('parses "50" with no decimals', () => {
      expect(parseMoneyToCents('50')).toBe(5000);
    });

    it('handles single decimal digit "48.7"', () => {
      expect(parseMoneyToCents('48.7')).toBe(4870);
    });

    it('returns null for "$4.5.0"', () => {
      expect(parseMoneyToCents('$4.5.0')).toBeNull();
    });

    it('returns null for "fifty"', () => {
      expect(parseMoneyToCents('fifty')).toBeNull();
    });

    it('returns null for ""', () => {
      expect(parseMoneyToCents('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(parseMoneyToCents(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseMoneyToCents(undefined)).toBeNull();
    });

    it('strips "USD" prefix', () => {
      expect(parseMoneyToCents('USD 50')).toBe(5000);
    });

    it('strips "dollars" suffix', () => {
      expect(parseMoneyToCents('50 dollars')).toBe(5000);
    });

    it('strips "bucks" suffix', () => {
      expect(parseMoneyToCents('50 bucks')).toBe(5000);
    });

    it('handles negative amount', () => {
      expect(parseMoneyToCents('-50')).toBe(-5000);
    });
  });

  describe('formatCents', () => {
    it('formats 5000 to "$50.00"', () => {
      expect(formatCents(5000)).toBe('$50.00');
    });

    it('formats 417 to "$4.17"', () => {
      expect(formatCents(417)).toBe('$4.17');
    });

    it('formats 1 to "$0.01"', () => {
      expect(formatCents(1)).toBe('$0.01');
    });

    it('formats 0 to "$0.00"', () => {
      expect(formatCents(0)).toBe('$0.00');
    });

    it('formats with thousand separators', () => {
      expect(formatCents(114900)).toBe('$1,149.00');
    });
  });

  describe('centsToPlain', () => {
    it('converts 4873 to "48.73"', () => {
      expect(centsToPlain(4873)).toBe('48.73');
    });

    it('converts 5000 to "50.00"', () => {
      expect(centsToPlain(5000)).toBe('50.00');
    });

    it('converts 1 to "0.01"', () => {
      expect(centsToPlain(1)).toBe('0.01');
    });

    it('converts 0 to "0.00"', () => {
      expect(centsToPlain(0)).toBe('0.00');
    });

    it('converts 114900 to "1149.00"', () => {
      expect(centsToPlain(114900)).toBe('1149.00');
    });

    it('handles negative amounts', () => {
      expect(centsToPlain(-5000)).toBe('-50.00');
    });
  });

  describe('withBuffer', () => {
    it('withBuffer(5000, 20) = 6000', () => {
      expect(withBuffer(5000, 20)).toBe(6000);
    });

    it('rounds up to the cent', () => {
      expect(withBuffer(5001, 20)).toBe(6002); // 5001 * 1.2 = 6001.2 → 6002
    });

    it('withBuffer(10000, 0) = 10000', () => {
      expect(withBuffer(10000, 0)).toBe(10000);
    });

    it('withBuffer(1, 100) = 2', () => {
      expect(withBuffer(1, 100)).toBe(2);
    });
  });

  describe('divRound', () => {
    it('divRound(12000, 12) = 1000', () => {
      expect(divRound(12000, 12)).toBe(1000);
    });

    it('divRound(9600, 12) = 800', () => {
      expect(divRound(9600, 12)).toBe(800);
    });

    it('divRound(25153, 65) ≈ 387 (round half up)', () => {
      expect(divRound(25153, 65)).toBe(387);
    });

    it('throws on division by zero', () => {
      expect(() => divRound(100, 0)).toThrow('division by zero');
    });
  });

  describe('slugify', () => {
    it('slugifies "Can I spend $50 on pizza for Thursday\'s GM?"', () => {
      const result = slugify("Can I spend $50 on pizza for Thursday's GM?");
      expect(result).toBe('can-i-spend-50-on-pizza-for-thursdays-gm');
    });

    it('removes apostrophes and curly quotes', () => {
      const result = slugify("test's value 'quoted'");
      expect(result).toBe('tests-value-quoted');
    });

    it('converts "$50.00" to "50"', () => {
      const result = slugify('Amount $50.00 is good');
      expect(result).toBe('amount-50-is-good');
    });

    it('collapses multiple spaces to single dash', () => {
      const result = slugify('too   many    spaces');
      expect(result).toBe('too-many-spaces');
    });

    it('removes leading/trailing dashes', () => {
      const result = slugify('-leading-trailing-');
      expect(result).toBe('leading-trailing');
    });

    it('truncates long text with hash suffix', () => {
      const longText = 'a'.repeat(100);
      const result = slugify(longText, 80);
      expect(result).toHaveLength(87); // 80 base + 1 dash + 6 hash
      expect(result).toMatch(/-[a-f0-9]{6}$/);
    });

    it('keeps total length <= max', () => {
      const longText = 'can i spend 50 on pizza for very long event name on thursday for special gm event';
      const result = slugify(longText, 80);
      expect(result.length).toBeLessThanOrEqual(87); // 80 + dash + 6 char hash
    });

    it('returns "empty" for empty string', () => {
      expect(slugify('')).toBe('empty');
    });

    it('returns "empty" for whitespace-only string', () => {
      expect(slugify('   ')).toBe('empty');
    });
  });

  describe('parseTreasurerCommand', () => {
    it('parses "Y R-12" as approve with no note', () => {
      const result = parseTreasurerCommand('Y R-12');
      expect(result.kind).toBe('approve');
      expect((result as any).shortId).toBe('R-12');
      expect((result as any).amountCents).toBeNull();
      expect((result as any).note).toBeNull();
    });

    it('parses "y r12 looks good" as approve with note', () => {
      const result = parseTreasurerCommand('y r12 looks good');
      expect(result.kind).toBe('approve');
      expect((result as any).shortId).toBe('R-12');
      expect((result as any).note).toBe('looks good');
    });

    it('parses "Y R-12 @ $36 trim it" with amount and note', () => {
      const result = parseTreasurerCommand('Y R-12 @ $36 trim it');
      expect(result.kind).toBe('approve');
      expect((result as any).shortId).toBe('R-12');
      expect((result as any).amountCents).toBe(3600);
      expect((result as any).note).toBe('trim it');
    });

    it('parses "N R-13 too much" as deny with note', () => {
      const result = parseTreasurerCommand('N R-13 too much');
      expect(result.kind).toBe('deny');
      expect((result as any).shortId).toBe('R-13');
      expect((result as any).note).toBe('too much');
    });

    it('parses "approve R-14"', () => {
      const result = parseTreasurerCommand('approve R-14');
      expect(result.kind).toBe('approve');
      expect((result as any).shortId).toBe('R-14');
    });

    it('parses "deny R-14"', () => {
      const result = parseTreasurerCommand('deny R-14');
      expect(result.kind).toBe('deny');
      expect((result as any).shortId).toBe('R-14');
    });

    it('parses "yes R-15"', () => {
      const result = parseTreasurerCommand('yes R-15');
      expect(result.kind).toBe('approve');
    });

    it('parses "no R-16"', () => {
      const result = parseTreasurerCommand('no R-16');
      expect(result.kind).toBe('deny');
    });

    it('parses "ok R-17"', () => {
      const result = parseTreasurerCommand('ok R-17');
      expect(result.kind).toBe('approve');
    });

    it('parses "hello" as unknown', () => {
      const result = parseTreasurerCommand('hello');
      expect(result.kind).toBe('unknown');
    });

    it('parses empty string as unknown', () => {
      const result = parseTreasurerCommand('');
      expect(result.kind).toBe('unknown');
    });

    it('normalizes R prefix (handles both "R-12" and "R12")', () => {
      const result1 = parseTreasurerCommand('Y R-12');
      const result2 = parseTreasurerCommand('Y R12');
      expect((result1 as any).shortId).toBe('R-12');
      expect((result2 as any).shortId).toBe('R-12');
    });

    it('parses with various separators (dash, colon, comma)', () => {
      const r1 = parseTreasurerCommand('Y R-12 - good');
      const r2 = parseTreasurerCommand('Y R-12: good');
      const r3 = parseTreasurerCommand('Y R-12, good');
      expect((r1 as any).kind).toBe('approve');
      expect((r2 as any).kind).toBe('approve');
      expect((r3 as any).kind).toBe('approve');
    });
  });

  describe('dates', () => {
    describe('nextWeekday', () => {
      it('nextWeekday("2026-11-08", "thursday") returns "2026-11-12"', () => {
        // Nov 8, 2026 is a Sunday
        expect(nextWeekday('2026-11-08', 'thursday')).toBe('2026-11-12');
      });

      it('returns the same day if already on the target weekday', () => {
        // 2026-11-12 is a Thursday
        expect(nextWeekday('2026-11-12', 'thursday')).toBe('2026-11-12');
      });

      it('advances to next monday from friday', () => {
        // 2026-11-13 is a Friday
        expect(nextWeekday('2026-11-13', 'monday')).toBe('2026-11-16');
      });

      it('finds Sunday from Monday', () => {
        // 2026-11-16 is a Monday
        expect(nextWeekday('2026-11-16', 'sunday')).toBe('2026-11-22');
      });
    });

    describe('ymdToUs', () => {
      it('converts "2026-11-12" to "11/12/2026"', () => {
        expect(ymdToUs('2026-11-12')).toBe('11/12/2026');
      });

      it('converts "2026-01-05" to "01/05/2026"', () => {
        expect(ymdToUs('2026-01-05')).toBe('01/05/2026');
      });
    });

    describe('addDays', () => {
      it('adds 5 days to "2026-11-08"', () => {
        expect(addDays('2026-11-08', 5)).toBe('2026-11-13');
      });

      it('handles month boundary', () => {
        expect(addDays('2026-11-28', 5)).toBe('2026-12-03');
      });

      it('handles year boundary', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      });

      it('handles negative days', () => {
        expect(addDays('2026-11-10', -5)).toBe('2026-11-05');
      });

      it('handles 0 days', () => {
        expect(addDays('2026-11-08', 0)).toBe('2026-11-08');
      });
    });

    describe('daysBetween', () => {
      it('returns 5 for 5 days apart', () => {
        expect(daysBetween('2026-11-08', '2026-11-13')).toBe(5);
      });

      it('returns 0 for same day', () => {
        expect(daysBetween('2026-11-08', '2026-11-08')).toBe(0);
      });

      it('returns negative for reversed dates', () => {
        expect(daysBetween('2026-11-13', '2026-11-08')).toBe(-5);
      });

      it('counts days across month boundary', () => {
        expect(daysBetween('2026-11-28', '2026-12-03')).toBe(5);
      });

      it('counts days across year boundary', () => {
        expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
      });
    });

    describe('WEEKDAYS constant', () => {
      it('has 7 days in order', () => {
        expect(WEEKDAYS).toHaveLength(7);
        expect(WEEKDAYS).toEqual(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
      });
    });
  });
});
