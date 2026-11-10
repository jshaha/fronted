import { buildState } from '@/lib/view';
import { sweepExpired } from '@/lib/pipeline/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await sweepExpired();
  return Response.json(buildState(), { headers: { 'cache-control': 'no-store' } });
}
