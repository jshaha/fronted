/**
 * Orchestrator core: applies transition() and executes its effects.
 * This is the only place request status changes and effects run.
 */
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { transition, type Effect, type MachineEvent } from '../state/machine';
import { audit } from '../audit';
import { postMessage } from '../chat';
import { config } from '../config';
import { formatCents, withBuffer } from '../money';
import { addDays, endOfLocalDayIso, prettyYmd, todayYmd } from '../dates';
import { nowIso } from '../clock';
import { getIssuer } from '../card/mockIssuer';
import { openCommitment, writeLedger } from '../ledger';
import { buildFilingPayload, filingIdempotencyKey } from '../portal/payload';
import { cardForRequest, eventById, getMember, getOrg, getRequest, getTreasurer, lineById, receiptForRequest, txnForRequest, updateRequest, type RequestRow } from './repo';
import type { RequestStatus } from '../types';
import type { ReceiptExtraction } from '../types';

export function newTraceId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export type EffectContext = { traceId: string; actorId?: string };

export async function applyEvent(requestId: number, ev: MachineEvent, ctx: EffectContext): Promise<RequestRow> {
  const before = getRequest(requestId);
  const { status, effects } = transition({ status: before.status as RequestStatus, fundingSource: before.fundingSource }, ev);
  const after = updateRequest(requestId, { status });
  audit({
    requestId,
    traceId: ctx.traceId,
    kind: 'transition',
    title: `${before.status} → ${status}`,
    data: { event: ev.type, from: before.status, to: status, effects: effects.map((e) => e.type) },
  });
  for (const e of effects) await runEffect(after, e, ctx);
  return getRequest(requestId);
}

async function runEffect(req: RequestRow, e: Effect, ctx: EffectContext): Promise<void> {
  const line = req.lineId ? lineById(req.lineId) : undefined;
  switch (e.type) {
    case 'commit_budget': {
      if (!line) throw new Error('commit without a budget line');
      writeLedger({ lineId: line.id, requestId: req.id, kind: 'commit', amountCents: e.amountCents, fundingSource: req.fundingSource, memo: `${req.shortId} approved` });
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'ledger', title: `commit ${formatCents(e.amountCents)} on ${line.name}`, data: { kind: 'commit', amountCents: e.amountCents } });
      return;
    }
    case 'release_commit': {
      if (!line) return;
      const open = openCommitment(req.id);
      if (open > 0) {
        writeLedger({ lineId: line.id, requestId: req.id, kind: 'release', amountCents: open, fundingSource: req.fundingSource, memo: `${req.shortId} commitment released` });
        audit({ requestId: req.id, traceId: ctx.traceId, kind: 'ledger', title: `release ${formatCents(open)} commitment`, data: { kind: 'release', amountCents: open } });
      }
      return;
    }
    case 'issue_card':
      await issueCard(req, e.amountCents, ctx);
      return;
    case 'terminate_card': {
      const card = cardForRequest(req.id);
      if (!card || card.status !== 'active') return;
      await getIssuer().terminateCard(card.externalCardId);
      getDb().update(s.cards).set({ status: 'terminated' }).where(eq(s.cards.id, card.id)).run();
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'card', title: `card ••${card.last4} terminated`, data: { externalCardId: card.externalCardId } });
      return;
    }
    case 'record_settled': {
      if (!line) return;
      writeLedger({ lineId: line.id, requestId: req.id, kind: 'card_settled', amountCents: e.amountCents, fundingSource: 'program_card', memo: `${req.shortId} card charge` });
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'ledger', title: `card_settled ${formatCents(e.amountCents)} (unreconciled until filed)`, data: { kind: 'card_settled', amountCents: e.amountCents } });
      return;
    }
    case 'ask_receipt':
      postMessage({
        pane: 'officer',
        author: 'agent',
        requestId: req.id,
        body: `Charge settled. The card is now closed so it can't be reused. Send me a photo of the itemized receipt for ${req.shortId} and I'll file the expense report.`,
        attachment: { type: 'receipt', requestShortId: req.shortId },
      });
      return;
    case 'queue_filing':
      queueFiling(req, ctx);
      return;
    case 'record_filed': {
      if (!line) return;
      const amount = filedAmount(req);
      writeLedger({ lineId: line.id, requestId: req.id, kind: 'filed', amountCents: amount, fundingSource: req.fundingSource, memo: `${req.shortId} filed in ASUC portal` });
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'ledger', title: `filed ${formatCents(amount)}${req.fundingSource === 'out_of_pocket' ? ' (reimbursement now spent)' : ' (reconciled)'}`, data: { kind: 'filed', amountCents: amount } });
      return;
    }
    case 'mark_owed_back': {
      const txn = txnForRequest(req.id);
      if (!txn) return;
      getDb().update(s.cardTransactions).set({ resolution: 'owed_back' }).where(eq(s.cardTransactions.id, txn.id)).run();
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'ledger', title: `${formatCents(txn.amountCents)} charge left unreconciled — owed back`, data: { amountCents: txn.amountCents } });
      postMessage({
        pane: 'treasurer',
        author: 'agent',
        requestId: req.id,
        body: `${req.shortId} was cancelled, so nothing was filed. The ${formatCents(txn.amountCents)} card charge stays on the books as unreconciled money owed back. Mark it repaid once ${getMember(req.officerId).name.split(' ')[0]} pays the org back.`,
        attachment: { type: 'owed_back', requestShortId: req.shortId },
      });
      return;
    }
    case 'notify_treasurer': {
      const fresh = getRequest(req.id);
      if (fresh.status === 'awaiting_approval') {
        postMessage({
          pane: 'treasurer',
          author: 'agent',
          requestId: req.id,
          body: `${fresh.shortId} needs your approval. Reply “Y ${fresh.shortId}” or “N ${fresh.shortId} reason”, or use the buttons.`,
          attachment: { type: 'approval', requestShortId: fresh.shortId },
        });
      } else if (fresh.status === 'receipt_flagged') {
        postMessage({ pane: 'treasurer', author: 'agent', requestId: req.id, body: `The receipt for ${fresh.shortId} needs a look before I file it.`, attachment: { type: 'flagged', requestShortId: fresh.shortId } });
      } else if (fresh.status === 'needs_human') {
        postMessage({ pane: 'treasurer', author: 'agent', requestId: req.id, body: `I couldn't file ${fresh.shortId} in the ASUC portal after retrying. You can retry or file it by hand.`, attachment: { type: 'filing', requestShortId: fresh.shortId } });
      }
      return;
    }
    case 'record_precedent':
      // Written by approve/deny (they hold the note); listed as an effect for the audit trail.
      return;
  }
}

/** The amount that gets filed: the card charge on the card path, the receipt total otherwise. */
export function filedAmount(req: RequestRow): number {
  if (req.fundingSource === 'program_card') {
    const txn = txnForRequest(req.id);
    if (!txn) throw new Error(`${req.shortId}: no settled transaction to file`);
    return txn.amountCents;
  }
  if (req.amountCents == null) throw new Error(`${req.shortId}: no amount`);
  return req.amountCents;
}

async function issueCard(req: RequestRow, approvedCents: number, ctx: EffectContext) {
  const line = lineById(req.lineId!);
  if (!line) throw new Error('issue_card without line');
  const officer = getMember(req.officerId);
  const event = req.eventId ? eventById(req.eventId) : undefined;
  const limitCents = withBuffer(approvedCents, config.cardBufferPct);
  const expiryDay = event ? addDays(event.date, config.cardExpiryDaysAfterEvent) : addDays(todayYmd(), 7);
  const expiresAt = endOfLocalDayIso(expiryDay);
  const allowed = JSON.parse(line.allowedCategories) as string[];
  const started = Date.now();
  const issued = await getIssuer().createCard({ requestShortId: req.shortId, holderName: officer.name, limitCents, allowedCategories: allowed, expiresAt });
  getDb()
    .insert(s.cards)
    .values({
      requestId: req.id,
      issuer: 'mock',
      externalCardId: issued.externalCardId,
      last4: issued.last4,
      limitCents: issued.limitCents,
      allowedCategories: JSON.stringify(issued.allowedCategories),
      expiresAt: issued.expiresAt,
      status: 'active',
      createdAt: nowIso(),
    })
    .run();
  audit({
    requestId: req.id,
    traceId: ctx.traceId,
    kind: 'card',
    title: `CardIssuer.createCard → ••${issued.last4}, limit ${formatCents(limitCents)}`,
    latencyMs: Date.now() - started,
    data: { issuer: 'mock', approvedCents, bufferPct: config.cardBufferPct, limitCents, allowedCategories: allowed, expiresAt, externalCardId: issued.externalCardId },
  });
  await applyEvent(req.id, { type: 'CARD_ISSUED' }, ctx);
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: req.id,
    body: `Approved by ${getTreasurer(req.orgId).name.split(' ')[0]}. Your virtual card ••${issued.last4} is ready: limit ${formatCents(limitCents)} (${formatCents(approvedCents)} + ${config.cardBufferPct}% for tax and tip), ${allowed.map((a) => a.replace(/_/g, ' ')).join(', ')} only, expires ${prettyYmd(expiryDay)}.`,
    attachment: { type: 'card', requestShortId: req.shortId },
  });
}

export function queueFiling(req: RequestRow, ctx: EffectContext) {
  const db = getDb();
  const org = getOrg();
  const officer = getMember(req.officerId);
  const treasurer = getTreasurer(req.orgId);
  const line = lineById(req.lineId!)!;
  const event = req.eventId ? eventById(req.eventId) : undefined;
  const receipt = receiptForRequest(req.id);
  if (!receipt) throw new Error(`${req.shortId}: cannot file without a receipt`);
  const extraction = receipt.extractionJson ? (JSON.parse(receipt.extractionJson) as ReceiptExtraction) : null;
  const card = cardForRequest(req.id);
  const txn = txnForRequest(req.id);
  const amount = filedAmount(req);
  const payload = buildFilingPayload({
    shortId: req.shortId,
    fundingSource: req.fundingSource,
    org: { name: org.name, asucAccount: org.asucAccount },
    officer: { name: officer.name, email: officer.email, studentId: officer.studentId },
    treasurerName: treasurer.name,
    amountCents: amount,
    vendor: extraction?.merchant_name ?? txn?.merchantName ?? 'Unknown vendor',
    transactionDate: extraction?.receipt_date ?? (txn ? txn.settledAt.slice(0, 10) : todayYmd()),
    lineName: line.name,
    purpose: req.purpose ?? 'Org expense',
    event: event ? { name: event.name, date: event.date } : null,
    attendeeCount: req.attendeeCount,
    projectName: req.projectName,
    cardLast4: card?.last4 ?? null,
    receiptPath: receipt.filePath,
  });
  const key = filingIdempotencyKey(req.shortId);
  const existing = db.select().from(s.portalFilings).where(eq(s.portalFilings.idempotencyKey, key)).get();
  if (existing) {
    if (existing.confirmationId) {
      audit({ requestId: req.id, traceId: ctx.traceId, kind: 'filing', title: `already filed (${existing.confirmationId}); not queueing again`, data: { idempotencyKey: key } });
      return;
    }
    db.update(s.portalFilings).set({ status: 'queued', payloadJson: JSON.stringify(payload), lastError: null }).where(eq(s.portalFilings.id, existing.id)).run();
  } else {
    db.insert(s.portalFilings)
      .values({
        requestId: req.id,
        formType: req.fundingSource === 'program_card' ? 'expense_report' : 'reimbursement',
        idempotencyKey: key,
        payloadJson: JSON.stringify(payload),
        status: 'queued',
        createdAt: nowIso(),
      })
      .run();
  }
  audit({ requestId: req.id, traceId: ctx.traceId, kind: 'filing', title: `filing job queued (${key})`, data: { idempotencyKey: key, payload } });
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: req.id,
    body: `Filing ${req.shortId} in the ASUC portal now. You don't need to do anything else.`,
    attachment: { type: 'filing', requestShortId: req.shortId },
  });
}
