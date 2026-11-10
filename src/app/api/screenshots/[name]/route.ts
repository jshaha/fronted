import fs from 'node:fs';
import path from 'node:path';
import { safeName, serveFile } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = safeName((await ctx.params).name);
  if (!name) return new Response('bad name', { status: 400 });
  const file = path.join(process.cwd(), 'data', 'screenshots', name);
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  return serveFile(fs.readFileSync(file), name);
}
