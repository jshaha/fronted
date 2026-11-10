/**
 * Portal worker — a separate Node process. Polls portal_filings for queued jobs
 * and runs the Playwright browser agent against the mock ASUC portal.
 * Never runs inside a Next.js route.
 *
 *   PORTAL_RUNNER=headed|headless   (default headed)
 *   CLAUDE_MODE=live|replay         (default replay)
 */
import { chromium, type Browser } from 'playwright';
import { eq, sql } from 'drizzle-orm';
import { getDb, getSqlite } from '../src/lib/db/client';
import * as s from '../src/lib/db/schema';
import { config } from '../src/lib/config';
import { audit } from '../src/lib/audit';
import { nowIso } from '../src/lib/clock';
import { FilingAgent } from '../src/lib/portal/agent';
import { completeFiling, failFiling } from '../src/lib/pipeline/filingResults';
import { sweepExpired } from '../src/lib/pipeline/sweep';
import type { FilingPayload } from '../src/lib/types';

const POLL_MS = Number(process.env.WORKER_POLL_MS || 700);
let browser: Browser | null = null;
let stopping = false;

function log(msg: string) {
  console.log(`[portal-worker ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  const headed = config.portalRunner === 'headed';
  browser = await chromium.launch({ headless: !headed, args: headed ? ['--window-size=1180,900'] : [] });
  log(`chromium launched (${headed ? 'headed' : 'headless'})`);
  return browser;
}

/** Atomically claim the oldest queued job (idempotency place #3 is checked right after). */
function claimJob() {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `UPDATE portal_filings SET status = 'running', attempts = attempts + 1, started_at = ?
       WHERE id = (SELECT id FROM portal_filings WHERE status = 'queued' ORDER BY id LIMIT 1)
       RETURNING id`,
    )
    .get(nowIso()) as { id: number } | undefined;
  if (!row) return null;
  return getDb().select().from(s.portalFilings).where(eq(s.portalFilings.id, row.id)).get() ?? null;
}

async function runJob(job: typeof s.portalFilings.$inferSelect) {
  // Idempotency #3: a job that already has a confirmation ID is never filed again.
  if (job.confirmationId) {
    log(`job ${job.id} already has ${job.confirmationId}; skipping`);
    audit({ requestId: job.requestId, kind: 'filing', title: `Worker skipped: already filed as ${job.confirmationId}` });
    getDb().update(s.portalFilings).set({ status: 'filed' }).where(eq(s.portalFilings.id, job.id)).run();
    return;
  }
  const payload = JSON.parse(job.payloadJson) as FilingPayload;
  log(`filing job ${job.id} (${job.idempotencyKey}), attempt ${job.attempts}`);
  audit({
    requestId: job.requestId,
    traceId: `filing-${job.id}`,
    kind: 'filing',
    title: `Portal worker picked up ${job.idempotencyKey} (attempt ${job.attempts}, ${config.portalRunner}, Claude ${config.claudeMode})`,
  });
  const started = Date.now();
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 1160, height: 860 } });
  await context.addInitScript('window.__name = window.__name || function (f) { return f; };');
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // Belt and braces: block any request that leaves the allowlisted origins.
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const ok = config.portalAllowedOrigins.some((o) => new URL(o).origin === u.origin) || u.protocol === 'data:' || u.protocol === 'blob:';
    return ok ? route.continue() : route.abort();
  });
  try {
    const agent = new FilingAgent(page, { id: job.id, requestId: job.requestId, attempt: job.attempts, payload });
    const out = await agent.run();
    getDb().update(s.portalFilings).set({ planJson: JSON.stringify(out.plans) }).where(eq(s.portalFilings.id, job.id)).run();
    await completeFiling(job.id, out.confirmationId, { duplicate: out.duplicate, durationMs: Date.now() - started });
    log(`job ${job.id} filed: ${out.confirmationId}${out.duplicate ? ' (duplicate)' : ''} in ${Date.now() - started}ms`);
    if (config.portalRunner === 'headed') await page.waitForTimeout(1200);
  } catch (err) {
    const msg = (err as Error).message;
    log(`job ${job.id} failed: ${msg}`);
    audit({ requestId: job.requestId, traceId: `filing-${job.id}`, kind: 'error', title: `Filing attempt failed: ${msg.slice(0, 160)}`, data: { error: msg } });
    await failFiling(job.id, msg);
  } finally {
    await context.close().catch(() => {});
  }
}

async function loop() {
  log(`started: CLAUDE_MODE=${config.claudeMode} PORTAL_RUNNER=${config.portalRunner} portal=${config.portalUrl} db=${config.dbPath}`);
  // Recover jobs left "running" by a crashed worker.
  getDb().update(s.portalFilings).set({ status: 'queued' }).where(eq(s.portalFilings.status, 'running')).run();
  while (!stopping) {
    try {
      await sweepExpired();
      const job = claimJob();
      if (job) {
        await runJob(job);
        continue;
      }
    } catch (err) {
      log(`loop error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function shutdown() {
  stopping = true;
  log('stopping');
  await browser?.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void sql;
loop();
