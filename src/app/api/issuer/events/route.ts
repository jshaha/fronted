/** Webhook-shaped endpoint for normalized issuer events (what a real adapter would POST). */
import { z } from 'zod';
import { handle } from '@/lib/api';
import { handleIssuerEvent } from '@/lib/pipeline/issuerEvents';
import type { IssuerEvent } from '@/lib/card/issuer';

export const runtime = 'nodejs';

const Settled = z.object({
  type: z.literal('transaction.settled'),
  event_id: z.string(),
  external_card_id: z.string(),
  external_transaction_id: z.string(),
  amount_cents: z.number().int().positive(),
  merchant_name: z.string(),
  merchant_category: z.string(),
  settled_at: z.string(),
});
const Declined = z.object({
  type: z.literal('authorization.declined'),
  event_id: z.string(),
  external_card_id: z.string(),
  amount_cents: z.number().int().positive(),
  merchant_name: z.string(),
  merchant_category: z.string(),
  reason: z.enum(['card_inactive', 'card_expired', 'over_limit', 'category_blocked']),
});

export async function POST(req: Request) {
  return handle(async () => {
    const event = z.discriminatedUnion('type', [Settled, Declined]).parse(await req.json()) as IssuerEvent;
    return { ok: true, ...(await handleIssuerEvent(event)) };
  });
}
