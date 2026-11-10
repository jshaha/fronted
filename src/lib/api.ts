import { AppError } from './errors';
import { ReplayMissingError } from './claude/client';
import { InvalidTransitionError } from './state/machine';

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await fn();
    return Response.json(body ?? { ok: true });
  } catch (err) {
    if (err instanceof AppError) return Response.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
    if (err instanceof ReplayMissingError) return Response.json({ ok: false, error: err.message, code: 'replay_missing' }, { status: 409 });
    if (err instanceof InvalidTransitionError) return Response.json({ ok: false, error: err.message, code: 'invalid_transition' }, { status: 409 });
    console.error(err);
    return Response.json({ ok: false, error: (err as Error).message ?? 'Server error', code: 'server_error' }, { status: 500 });
  }
}

export function serveFile(buf: Buffer, name: string): Response {
  const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream';
  return new Response(new Uint8Array(buf), { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
}

/** Only plain file names: no slashes, no dot-dot. */
export function safeName(name: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..') ? name : null;
}
