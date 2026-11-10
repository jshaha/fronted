import { handle } from '@/lib/api';
import { approveRequest, denyRequest, markRepaid, resolveFlagged, retryFiling } from '@/lib/pipeline/treasurer';
import { simulatePurchase } from '@/lib/pipeline/issuerEvents';
import { BadRequestError, NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';

type Body = { actorId?: string; note?: string; amountCents?: number; saveAsCriterion?: boolean; decision?: 'accept' | 'cancel'; merchantName?: string; merchantCategory?: string };

export async function POST(req: Request, ctx: { params: Promise<{ shortId: string; action: string }> }) {
  const { shortId, action } = await ctx.params;
  return handle(async () => {
    const b = (await req.json().catch(() => ({}))) as Body;
    if (!b.actorId) throw new BadRequestError('actorId required');
    switch (action) {
      case 'approve':
        return { ok: true, request: (await approveRequest({ shortId, actorId: b.actorId, note: b.note, amountCents: b.amountCents ?? null, saveAsCriterion: b.saveAsCriterion })).status };
      case 'deny':
        return { ok: true, request: (await denyRequest({ shortId, actorId: b.actorId, note: b.note, saveAsCriterion: b.saveAsCriterion })).status };
      case 'simulate-purchase':
        if (!b.amountCents || !b.merchantCategory) throw new BadRequestError('amountCents and merchantCategory required');
        return { ok: true, ...(await simulatePurchase({ shortId, actorId: b.actorId, amountCents: b.amountCents, merchantName: b.merchantName ?? '', merchantCategory: b.merchantCategory })) };
      case 'resolve':
        if (b.decision !== 'accept' && b.decision !== 'cancel') throw new BadRequestError('decision must be accept or cancel');
        return { ok: true, request: (await resolveFlagged({ shortId, actorId: b.actorId, decision: b.decision })).status };
      case 'repaid':
        return { ok: true, request: (await markRepaid({ shortId, actorId: b.actorId })).status };
      case 'retry-filing':
        return { ok: true, request: (await retryFiling({ shortId, actorId: b.actorId })).status };
      default:
        throw new NotFoundError(`Unknown action ${action}`);
    }
  });
}
