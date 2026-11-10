/**
 * Treasurer actions. Every one checks, on the server, that the actor is the
 * org's treasurer. Approve/deny notes become precedent (the learning loop).
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { audit } from '../audit';
import { postMessage } from '../chat';
import { nowIso } from '../clock';
import { todayYmd } from '../dates';
import { formatCents, parseMoneyToCents } from '../money';
import { writeLedger } from '../ledger';
import { BadRequestError, ConflictError, ForbiddenError } from '../errors';
import { applyEvent, newTraceId } from './core';
import { getMember, getOrg, getRequest, getRequestByShortId, txnForRequest, type RequestRow } from './repo';
import type { PurposeTag } from '../types';

export function assertTreasurer(actorId: string, orgId: string) {
  const m = getMember(actorId);
  if (m.role !== 'treasurer' || m.orgId !== orgId) {
    audit({ kind: 'error', title: `Blocked: ${m.name} (${m.role}) tried a treasurer-only action`, data: { actorId } });
    throw new ForbiddenError('Only the treasurer can do that.');
  }
  return m;
}

function nextId(prefix: 'P' | 'C', table: typeof s.precedents | typeof s.orgCriteria): string {
  const rows = getDb().select({ id: table.id }).from(table).all();
  const max = rows.reduce((m, r) => Math.max(m, Number.parseInt(r.id.slice(2), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

/** The learning loop: the decision (and note) becomes a precedent row the Advisor will cite next time. */
function recordDecision(req: RequestRow, decision: 'approve' | 'deny', amountCents: number | null, note: string | null, saveAsCriterion: boolean, traceId: string) {
  const db = getDb();
  const org = getOrg();
  const precedentId = nextId('P', s.precedents);
  const outcome = decision === 'deny' ? 'denied' : amountCents != null && req.amountCents != null && amountCents < req.amountCents ? 'approved_reduced' : 'approved';
  db.insert(s.precedents)
    .values({
      id: precedentId,
      orgId: org.id,
      lineId: req.lineId ?? 'L-FOOD',
      purposeTag: (req.purposeTag as PurposeTag) ?? 'other',
      description: `${req.shortId}: ${req.purpose ?? req.message}`,
      amountCents: req.amountCents ?? 0,
      attendeeCount: req.attendeeCount,
      outcome,
      approvedCents: decision === 'approve' ? amountCents : null,
      treasurerNote: note,
      decidedAt: todayYmd(),
      semester: org.semester,
      createdFromRequestId: req.id,
    })
    .run();
  let criterionId: string | null = null;
  if (saveAsCriterion && note) {
    criterionId = nextId('C', s.orgCriteria);
    db.insert(s.orgCriteria)
      .values({
        id: criterionId,
        orgId: org.id,
        text: note,
        lineId: req.lineId,
        purposeTag: req.purposeTag,
        paramCents: null,
        paramKind: null,
        source: `Treasurer note on ${req.shortId}`,
        lastConfirmedAt: todayYmd(),
        createdFromRequestId: req.id,
      })
      .run();
  }
  audit({
    requestId: req.id,
    traceId,
    kind: 'learning',
    title: `Learning loop: decision saved as ${precedentId}${criterionId ? ` and criterion ${criterionId}` : ''}`,
    data: { precedentId, criterionId, outcome, note },
  });
  return { precedentId, criterionId };
}

export async function approveRequest(input: { shortId: string; actorId: string; note?: string | null; amountCents?: number | null; saveAsCriterion?: boolean }) {
  const req = getRequestByShortId(input.shortId);
  const treasurer = assertTreasurer(input.actorId, req.orgId);
  if (req.status !== 'awaiting_approval') throw new ConflictError(`${req.shortId} is ${req.status.replace(/_/g, ' ')}, not awaiting approval.`);
  const amount = input.amountCents ?? req.amountCents;
  if (!amount || amount <= 0) throw new BadRequestError('Approved amount must be positive.');
  if (req.amountCents != null && amount > req.amountCents) throw new BadRequestError('You can approve less than requested, not more.');
  const note = input.note?.trim() || null;
  const traceId = newTraceId();
  const { precedentId, criterionId } = recordDecision(req, 'approve', amount, note, !!input.saveAsCriterion, traceId);
  getDb()
    .insert(s.approvals)
    .values({ requestId: req.id, memberId: treasurer.id, decision: 'approve', amountCents: amount, note, precedentId, criterionId, createdAt: nowIso() })
    .run();
  getDb().update(s.requests).set({ approvedAmountCents: amount }).where(eq(s.requests.id, req.id)).run();
  audit({ requestId: req.id, traceId, kind: 'approval', title: `${treasurer.name} approved ${formatCents(amount)}${note ? ' with a note' : ''}`, data: { amountCents: amount, note, precedentId, criterionId } });
  postMessage({
    pane: 'treasurer',
    author: 'agent',
    requestId: req.id,
    body: `Approved ${req.shortId} for ${formatCents(amount)}.${note ? ` Your note is saved as ${precedentId}${criterionId ? ` and standing criterion ${criterionId}` : ''}; I'll cite it next time.` : ''}`,
  });
  // Card path: commit + issue card. Reimbursement: straight to filing (one approval covers both).
  await applyEvent(req.id, { type: 'APPROVE', amountCents: amount }, { traceId, actorId: treasurer.id });
  return getRequest(req.id);
}

export async function denyRequest(input: { shortId: string; actorId: string; note?: string | null; saveAsCriterion?: boolean }) {
  const req = getRequestByShortId(input.shortId);
  const treasurer = assertTreasurer(input.actorId, req.orgId);
  if (req.status !== 'awaiting_approval') throw new ConflictError(`${req.shortId} is ${req.status.replace(/_/g, ' ')}, not awaiting approval.`);
  const note = input.note?.trim() || null;
  const traceId = newTraceId();
  const { precedentId, criterionId } = recordDecision(req, 'deny', null, note, !!input.saveAsCriterion, traceId);
  getDb().insert(s.approvals).values({ requestId: req.id, memberId: treasurer.id, decision: 'deny', note, precedentId, criterionId, createdAt: nowIso() }).run();
  audit({ requestId: req.id, traceId, kind: 'approval', title: `${treasurer.name} denied ${req.shortId}`, data: { note, precedentId } });
  await applyEvent(req.id, { type: 'DENY' }, { traceId, actorId: treasurer.id });
  postMessage({ pane: 'officer', author: 'agent', requestId: req.id, body: `${treasurer.name.split(' ')[0]} declined ${req.shortId}.${note ? ` Note: “${note}”` : ''}` });
  postMessage({ pane: 'treasurer', author: 'agent', requestId: req.id, body: `Declined ${req.shortId}.${note ? ` Saved your note as ${precedentId}.` : ''}` });
  return getRequest(req.id);
}

export async function resolveFlagged(input: { shortId: string; actorId: string; decision: 'accept' | 'cancel' }) {
  const req = getRequestByShortId(input.shortId);
  const treasurer = assertTreasurer(input.actorId, req.orgId);
  if (req.status !== 'receipt_flagged') throw new ConflictError(`${req.shortId} has no flagged receipt.`);
  const traceId = newTraceId();
  audit({ requestId: req.id, traceId, kind: 'approval', title: `${treasurer.name} ${input.decision === 'accept' ? 'accepted the flagged receipt' : 'cancelled the request'}` });
  await applyEvent(req.id, { type: input.decision === 'accept' ? 'RESOLVE_ACCEPT' : 'RESOLVE_CANCEL' }, { traceId, actorId: treasurer.id });
  return getRequest(req.id);
}

export async function retryFiling(input: { shortId: string; actorId: string }) {
  const req = getRequestByShortId(input.shortId);
  const treasurer = assertTreasurer(input.actorId, req.orgId);
  const traceId = newTraceId();
  audit({ requestId: req.id, traceId, kind: 'filing', title: `${treasurer.name} asked to retry filing` });
  getDb().update(s.portalFilings).set({ attempts: 0 }).where(eq(s.portalFilings.requestId, req.id)).run();
  await applyEvent(req.id, { type: 'RETRY_FILING' }, { traceId, actorId: treasurer.id });
  return getRequest(req.id);
}

/** The officer paid back an unreconciled (cancelled) card charge. */
export async function markRepaid(input: { shortId: string; actorId: string }) {
  const req = getRequestByShortId(input.shortId);
  const treasurer = assertTreasurer(input.actorId, req.orgId);
  const txn = txnForRequest(req.id);
  if (!txn || txn.resolution !== 'owed_back') throw new ConflictError(`${req.shortId} has no charge owed back.`);
  writeLedger({ lineId: req.lineId!, requestId: req.id, kind: 'adjust', amountCents: -txn.amountCents, fundingSource: 'program_card', memo: `${req.shortId} charge repaid by officer` });
  getDb().update(s.cardTransactions).set({ resolution: 'repaid' }).where(eq(s.cardTransactions.id, txn.id)).run();
  const traceId = newTraceId();
  audit({ requestId: req.id, traceId, kind: 'ledger', title: `adjust −${formatCents(txn.amountCents)}: owed-back charge repaid (unreconciled cleared)`, data: { amountCents: -txn.amountCents } });
  postMessage({ pane: 'treasurer', author: 'agent', requestId: req.id, body: `Marked ${formatCents(txn.amountCents)} for ${req.shortId} as repaid. Unreconciled is back to zero for that charge.` });
  return getRequest(req.id);
}

/* --------------------------------------------- text commands ("Y R-12") */

export type TreasurerCommand =
  | { kind: 'approve'; shortId: string; amountCents: number | null; note: string | null }
  | { kind: 'deny'; shortId: string; note: string | null }
  | { kind: 'unknown' };

/** Code parses the treasurer's reply. Never Claude: approvals are not up for interpretation. */
export function parseTreasurerCommand(text: string): TreasurerCommand {
  const m = text.trim().match(/^(y|yes|approve|ok|n|no|deny|decline)\b[\s,:]*(r-?\d+)\b\s*(?:@\s*(\$?\d+(?:\.\d{1,2})?))?\s*[-–—:,]?\s*([\s\S]*)$/i);
  if (!m) return { kind: 'unknown' };
  const yes = /^(y|yes|approve|ok)$/i.test(m[1]);
  const shortId = m[2].toUpperCase().replace(/^R-?/, 'R-');
  const note = m[4]?.trim() || null;
  if (yes) return { kind: 'approve', shortId, amountCents: m[3] ? parseMoneyToCents(m[3]) : null, note };
  return { kind: 'deny', shortId, note };
}

export async function handleTreasurerMessage(input: { memberId: string; text: string }) {
  const member = getMember(input.memberId);
  postMessage({ pane: 'treasurer', author: 'member', memberId: member.id, body: input.text });
  const cmd = parseTreasurerCommand(input.text);
  if (cmd.kind === 'unknown') {
    postMessage({ pane: 'treasurer', author: 'agent', body: 'Reply “Y R-12” to approve (optionally “Y R-12 @ $36 note…”), or “N R-12 reason” to decline.' });
    return;
  }
  try {
    if (cmd.kind === 'approve') await approveRequest({ shortId: cmd.shortId, actorId: member.id, note: cmd.note, amountCents: cmd.amountCents });
    else await denyRequest({ shortId: cmd.shortId, actorId: member.id, note: cmd.note });
  } catch (err) {
    postMessage({ pane: 'treasurer', author: 'agent', body: (err as Error).message });
    if (err instanceof ForbiddenError) throw err;
  }
}

export function unreconciledCount(): number {
  const row = getDb().select({ n: sql<number>`count(*)` }).from(s.cardTransactions).where(eq(s.cardTransactions.resolution, 'owed_back')).get();
  return row?.n ?? 0;
}
