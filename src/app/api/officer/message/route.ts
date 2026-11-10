import { handle } from '@/lib/api';
import { handleOfficerMessage } from '@/lib/pipeline/officer';
import { BadRequestError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const memberId = String(form.get('memberId') ?? '');
    const text = String(form.get('text') ?? '');
    if (!memberId) throw new BadRequestError('memberId required');
    const file = form.get('image');
    const image =
      file instanceof File && file.size > 0 ? { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, fileName: file.name } : undefined;
    return { ok: true, ...(await handleOfficerMessage({ memberId, text, image })) };
  });
}
