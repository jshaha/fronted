import { handle } from '@/lib/api';
import { resetAndSeed } from '@/lib/db/seed';

export const runtime = 'nodejs';

/** Demo reset: wipes rows and reseeds. Local demo tool; disabled when FRONTED_DISABLE_RESET=1. */
export async function POST() {
  return handle(async () => {
    if (process.env.FRONTED_DISABLE_RESET === '1') throw new Error('reset disabled');
    return { ok: true, seeded: resetAndSeed() };
  });
}
