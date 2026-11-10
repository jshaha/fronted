import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

let worker: ChildProcess | null = null;

async function waitForWorkerStart(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Give the worker time to start
      await new Promise((r) => setTimeout(r, 500));
      return;
    } catch {
      // Not ready yet
    }
  }
  throw new Error('Worker failed to start');
}

async function globalSetup() {
  const env = {
    ...process.env,
    CLAUDE_MODE: 'replay',
    REPLAY_LATENCY_MS: '0',
    DB_PATH: 'data/e2e.sqlite',
    PORT: '3100',
    PORTAL_URL: 'http://localhost:3100/mock-portal',
    PORTAL_ALLOWED_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100',
    PORTAL_RUNNER: 'headless',
    MOCK_PORTAL_FAST: '1',
    PORTAL_STEP_DELAY_MS: '0',
  };

  worker = spawn('npx', ['tsx', 'worker/portal-worker.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  // Store the PID for cleanup in globalTeardown
  (globalThis as any).__WORKER_PID__ = worker.pid;

  await waitForWorkerStart();
}

export default globalSetup;
