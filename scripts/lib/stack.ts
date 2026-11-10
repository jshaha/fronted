/** Start/stop the Next.js app and the portal worker as child processes. */
import { spawn, type ChildProcess } from 'node:child_process';

export type Stack = { app: ChildProcess; worker: ChildProcess; baseUrl: string; stop: () => Promise<void> };

export async function waitFor(url: string, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function prefix(child: ChildProcess, tag: string, quiet: boolean) {
  const out = (d: Buffer) => {
    if (quiet) return;
    for (const line of d.toString().split('\n')) if (line.trim()) console.log(`${tag} ${line}`);
  };
  child.stdout?.on('data', out);
  child.stderr?.on('data', out);
}

export async function startStack(opts: { port: number; env: Record<string, string>; mode: 'dev' | 'prod'; quiet?: boolean }): Promise<Stack> {
  const baseUrl = `http://localhost:${opts.port}`;
  const env = {
    ...process.env,
    ...opts.env,
    PORT: String(opts.port),
    PORTAL_URL: `${baseUrl}/mock-portal`,
    PORTAL_ALLOWED_ORIGINS: `${baseUrl},http://127.0.0.1:${opts.port}`,
  };
  const nextArgs = opts.mode === 'dev' ? ['next', 'dev', '-p', String(opts.port)] : ['next', 'start', '-p', String(opts.port)];
  const app = spawn('npx', nextArgs, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  prefix(app, '[app]', !!opts.quiet);
  await waitFor(`${baseUrl}/api/state`);
  // Warm the routes so the first demo click is fast in dev mode.
  await Promise.all(['/simulator', '/mock-portal'].map((p) => fetch(`${baseUrl}${p}`).catch(() => null)));
  const worker = spawn('npx', ['tsx', 'worker/portal-worker.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  prefix(worker, '[worker]', !!opts.quiet);
  const stop = async () => {
    for (const c of [worker, app]) {
      try {
        if (c.pid) process.kill(-c.pid, 'SIGTERM');
      } catch {
        /* gone */
      }
    }
    await new Promise((r) => setTimeout(r, 800));
    for (const c of [worker, app]) {
      try {
        if (c.pid) process.kill(-c.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
  };
  return { app, worker, baseUrl, stop };
}
