/**
 * Receipt vision: Claude reads the photo into line items with category tags.
 * Amounts stay as printed text; code parses and reconciles them.
 */
import { callClaude, type ImageInput } from './client';
import { RECEIPT_ITEM_CATEGORIES, RECEIPT_SCHEMA_VERSION, ReceiptExtractionSchema, type ReceiptExtraction } from '../types';

export const RECEIPT_SYSTEM = `You transcribe a photographed purchase receipt into JSON. You never compute totals or fix the receipt's math — copy what is printed.

Rules:
- Copy every amount exactly as printed, without the currency symbol (e.g. "35.00").
- One entry per printed line item; amount_text is the line's printed total; quantity if printed.
- category per item, from: ${RECEIPT_ITEM_CATEGORIES.join(', ')}. Any beer, wine, spirits, hard cider/seltzer or other alcoholic drink is "alcohol", even if the brand name is the only clue.
- receipt_date as YYYY-MM-DD converted from what is printed, or null.
- payment_last4: the card's last four digits if printed.
- is_itemized: false if the receipt only shows a total.
- legibility: how confidently you could read it.
Return only JSON matching the schema.`;

export function receiptFixtureKey(sha256: string): string {
  return sha256.slice(0, 16);
}

export async function readReceipt(image: ImageInput) {
  return callClaude<ReceiptExtraction>({
    site: 'receipt',
    fixtureKey: receiptFixtureKey(image.sha256),
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    schema: ReceiptExtractionSchema,
    system: RECEIPT_SYSTEM,
    text: 'Transcribe this receipt.',
    image,
  });
}
