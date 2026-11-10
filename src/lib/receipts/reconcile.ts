/**
 * Code-side receipt checks. Claude transcribed the receipt; code parses every
 * amount, checks the math, looks for alcohol (keyword OR category), and
 * reconciles the total against the card charge (or the officer's stated amount).
 */
import { parseMoneyToCents, formatCents } from '../money';
import { alcoholKeywordHits } from '../rules/alcohol';
import type { ReceiptExtraction } from '../types';

export type ReceiptFlag = { code: 'unreadable' | 'low_confidence' | 'math' | 'not_itemized' | 'charge_mismatch' | 'amount_mismatch'; message: string };

export type ReconcileResult = {
  outcome: 'ok' | 'flagged' | 'alcohol' | 'unreadable';
  totalCents: number | null;
  subtotalCents: number | null;
  taxCents: number | null;
  tipCents: number | null;
  items: { description: string; amountCents: number | null; category: string; alcohol: boolean }[];
  alcoholItems: string[];
  flags: ReceiptFlag[];
};

export function reconcileReceipt(
  r: ReceiptExtraction,
  ctx: { toleranceCents: number; chargeCents?: number | null; statedAmountCents?: number | null },
): ReconcileResult {
  const totalCents = parseMoneyToCents(r.total_text);
  const subtotalCents = parseMoneyToCents(r.subtotal_text);
  const taxCents = parseMoneyToCents(r.tax_text);
  const tipCents = parseMoneyToCents(r.tip_text);
  const items = r.line_items.map((i) => {
    const kw = alcoholKeywordHits([i.description]);
    return { description: i.description, amountCents: parseMoneyToCents(i.amount_text), category: i.category, alcohol: i.category === 'alcohol' || kw.length > 0 };
  });
  const alcoholItems = items.filter((i) => i.alcohol).map((i) => i.description);
  const flags: ReceiptFlag[] = [];

  if (totalCents === null) {
    return { outcome: 'unreadable', totalCents, subtotalCents, taxCents, tipCents, items, alcoholItems, flags: [{ code: 'unreadable', message: `Couldn't read a total from "${r.total_text}".` }] };
  }
  if (alcoholItems.length) {
    return { outcome: 'alcohol', totalCents, subtotalCents, taxCents, tipCents, items, alcoholItems, flags };
  }

  if (r.legibility === 'poor') flags.push({ code: 'low_confidence', message: 'The photo was hard to read.' });
  if (!r.is_itemized || items.length === 0) flags.push({ code: 'not_itemized', message: 'ASUC needs an itemized receipt.' });

  if (items.length && items.every((i) => i.amountCents !== null)) {
    const sum = items.reduce((a, i) => a + (i.amountCents ?? 0), 0) + (taxCents ?? 0) + (tipCents ?? 0);
    if (Math.abs(sum - totalCents) > ctx.toleranceCents)
      flags.push({ code: 'math', message: `Line items + tax + tip = ${formatCents(sum)}, but the total says ${formatCents(totalCents)}.` });
  }
  if (ctx.chargeCents != null && Math.abs(totalCents - ctx.chargeCents) > ctx.toleranceCents)
    flags.push({ code: 'charge_mismatch', message: `Receipt total ${formatCents(totalCents)} doesn't match the card charge ${formatCents(ctx.chargeCents)}.` });
  if (ctx.statedAmountCents != null && Math.abs(totalCents - ctx.statedAmountCents) > ctx.toleranceCents)
    flags.push({ code: 'amount_mismatch', message: `Receipt total ${formatCents(totalCents)} doesn't match the ${formatCents(ctx.statedAmountCents)} you mentioned.` });

  return { outcome: flags.length ? 'flagged' : 'ok', totalCents, subtotalCents, taxCents, tipCents, items, alcoholItems, flags };
}
