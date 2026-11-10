/** Called by the portal worker when a filing finishes or fails. */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { audit } from '../audit';
import { postMessage } from '../chat';
import { nowIso } from '../clock';
import { formatCents } from '../money';
import { lineSummary } from '../ledger';
import { applyEvent, filedAmount, newTraceId } from './core';
import { getRequest, getTreasurer } from './repo';

export const MAX_FILING_ATTEMPTS = 2;

export async function completeFiling(filingId: number, confirmationId: string, opts: { duplicate?: boolean; durationMs?: number } = {}) {
  const db = getDb();
  const f = db.select().from(s.portalFilings).where(eq(s.portalFilings.id, filingId)).get();
  if (!f) throw new Error(`no filing ${filingId}`);
  db.update(s.portalFilings).set({ status: 'filed', confirmationId, finishedAt: nowIso(), lastError: null }).where(eq(s.portalFilings.id, filingId)).run();
  const req = getRequest(f.requestId);
  const traceId = newTraceId();
  audit({
    requestId: req.id,
    traceId,
    kind: 'filing',
    title: opts.duplicate ? `Portal already had this report: ${confirmationId} (idempotent)` : `Filed in ASUC portal: ${confirmationId}`,
    latencyMs: opts.durationMs,
    data: { confirmationId, idempotencyKey: f.idempotencyKey, duplicate: !!opts.duplicate },
  });
  if (req.status !== 'filing_queued') return; // already moved on (e.g. duplicate completion)
  await applyEvent(req.id, { type: 'FILED' }, { traceId });
  await applyEvent(req.id, { type: 'CLOSE' }, { traceId });
  const amount = filedAmount(req);
  const line = lineSummary(req.lineId!);
  const secs = opts.durationMs ? ` in ${Math.round(opts.durationMs / 1000)}s` : '';
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: req.id,
    body: `Done. ${req.shortId} is filed with ASUC${secs}, confirmation ${confirmationId}. ${req.fundingSource === 'out_of_pocket' ? `ASUC will reimburse you ${formatCents(amount)}.` : 'Nothing else needed from you.'}`,
    attachment: { type: 'filing', requestShortId: req.shortId },
  });
  postMessage({
    pane: 'treasurer',
    author: 'agent',
    requestId: req.id,
    body: `${req.shortId} filed (${confirmationId}), ${formatCents(amount)} on ${line.name}. ${line.name} now has ${formatCents(line.remaining)} remaining.`,
  });
  void getTreasurer;
}

export async function failFiling(filingId: number, error: string) {
  const db = getDb();
  const f = db.select().from(s.portalFilings).where(eq(s.portalFilings.id, filingId)).get();
  if (!f) throw new Error(`no filing ${filingId}`);
  const attempts = f.attempts;
  const req = getRequest(f.requestId);
  const traceId = newTraceId();
  if (attempts < MAX_FILING_ATTEMPTS) {
    db.update(s.portalFilings).set({ status: 'queued', lastError: error }).where(eq(s.portalFilings.id, filingId)).run();
    audit({ requestId: req.id, traceId, kind: 'filing', title: `Filing attempt ${attempts} failed; retrying`, data: { error } });
    return;
  }
  db.update(s.portalFilings).set({ status: 'needs_human', lastError: error, finishedAt: nowIso() }).where(eq(s.portalFilings.id, filingId)).run();
  audit({ requestId: req.id, traceId, kind: 'filing', title: `Filing failed after ${attempts} attempts → needs a human`, data: { error } });
  if (req.status === 'filing_queued') {
    await applyEvent(req.id, { type: 'FILING_FAILED' }, { traceId });
    await applyEvent(req.id, { type: 'ESCALATE' }, { traceId });
  }
}
