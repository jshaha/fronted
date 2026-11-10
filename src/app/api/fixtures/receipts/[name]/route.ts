import fs from 'node:fs';
import path from 'node:path';
import { safeName, serveFile } from '@/lib/api';
import { SAMPLE_RECEIPTS } from '@/lib/demoScript';

export const runtime = 'nodejs';

/** Sample receipts for the demo; the simulator uploads them through the normal receipt path. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = safeName((await ctx.params).name);
  if (!name || !SAMPLE_RECEIPTS.some((r) => r.file === name)) return new Response('not found', { status: 404 });
  return serveFile(fs.readFileSync(path.join(process.cwd(), 'fixtures', 'receipts', name)), name);
}
