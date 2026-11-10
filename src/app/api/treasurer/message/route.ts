import { handle } from '@/lib/api';
import { handleTreasurerMessage } from '@/lib/pipeline/treasurer';
import { BadRequestError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { memberId?: string; text?: string };
    if (!body.memberId || !body.text?.trim()) throw new BadRequestError('memberId and text required');
    await handleTreasurerMessage({ memberId: body.memberId, text: body.text });
    return { ok: true };
  });
}
