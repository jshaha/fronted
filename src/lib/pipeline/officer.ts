/**
 * Officer-side flows: pre-approval request, receipt for a card purchase, and
 * reimbursement (same pipeline, funding_source=out_of_pocket, enters at receipt_received).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { audit } from '../audit';
import { postMessage } from '../chat';
import { config } from '../config';
import { nowIso } from '../clock';
import { formatCents, parseMoneyToCents } from '../money';
import { daysBetween, prettyYmd, todayYmd } from '../dates';
import { ModelOutputError, ReplayMissingError, slugify, type ClaudeResult } from '../claude/client';
import { extractRequest } from '../claude/extractor';
import { readReceipt } from '../claude/receipt';
import { evaluateRules, type RequestFacts } from '../rules/engine';
import { lineSummary } from '../ledger';
import { computeBudgetStats } from '../advisor/budgetStats';
import { applicableCriteria, relevantPrecedents } from '../advisor/knowledge';
import { runAdvisor } from '../advisor/advisor';
import { relevantSignals } from '../signals/sources';
import { reconcileReceipt, type ReconcileResult } from '../receipts/reconcile';
import { BadRequestError, ConflictError, ForbiddenError } from '../errors';
import { applyEvent, newTraceId } from './core';
import { resolveEvent, resolveLine, upcomingCountOfType, type EventRow, type LineRow } from './resolve';
import { getMember, getOrg, getRequest, getTreasurer, latestRequestForOfficer, nextShortId, updateRequest, type RequestRow } from './repo';
import type { Extraction, ReceiptExtraction } from '../types';

export const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'receipts');

export type ImageUpload = { buffer: Buffer; mimeType: string; fileName: string };

const EVENT_TYPE_LABEL: Record<string, string> = { gm: 'GMs', workshop: 'Workshops', social: 'Socials', tabling: 'Tabling events', other: 'Events' };

function logClaude<T>(requestId: number, traceId: string, title: string, res: ClaudeResult<T>, data?: unknown) {
  audit({
    requestId,
    traceId,
    kind: 'claude',
    title,
    site: undefined,
    model: res.model,
    mode: res.mode,
    latencyMs: res.latencyMs,
    data: { fixtureKey: res.fixtureKey, recording: res.recordingPath, attempts: res.attempts, usage: res.usage, output: data ?? res.data },
  });
}

function replayMissing(requestId: number, traceId: string, err: ReplayMissingError) {
  audit({ requestId, traceId, kind: 'error', title: `replay recording missing: ${err.site}/${err.fixtureKey}`, data: { message: err.message, stub: err.stubPath } });
  updateRequest(requestId, { status: 'needs_info', statusReason: 'replay recording missing' });
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId,
    body: `I can't answer that in replay mode: there's no recording for this ${err.site === 'extractor' ? 'message' : err.site === 'receipt' ? 'receipt' : 'step'}. Use one of the suggested prompts or sample receipts, or run in live mode with an API key.`,
    attachment: { type: 'error', detail: `${err.site}/${err.fixtureKey}.v${err.schemaVersion}` },
  });
}

/* ------------------------------------------------------------- entrypoint */

export async function handleOfficerMessage(input: { memberId: string; text: string; image?: ImageUpload }): Promise<{ requestShortId?: string }> {
  const officer = getMember(input.memberId);
  if (officer.role !== 'officer' && officer.role !== 'treasurer') throw new ForbiddenError('Not a member');
  const text = input.text.trim();
  if (!text && !input.image) throw new BadRequestError('Say something or attach a receipt.');

  let imageUrl: string | undefined;
  let stored: StoredImage | undefined;
  if (input.image) {
    stored = storeImage(input.image);
    imageUrl = `/api/uploads/${path.basename(stored.filePath)}`;
  }
  postMessage({
    pane: 'officer',
    author: 'member',
    memberId: officer.id,
    body: text || (input.image ? 'Receipt photo' : ''),
    attachment: imageUrl ? { type: 'image', url: imageUrl, name: input.image!.fileName } : undefined,
  });

  if (stored) {
    const purchased = latestRequestForOfficer(officer.id, ['purchased']);
    if (purchased) return receiptForCardRequest(purchased, stored);
    if (!text) {
      postMessage({ pane: 'officer', author: 'agent', body: 'Got the receipt. What was it for? Add a short note (amount, what you bought, which event or project) so I can file the reimbursement.' });
      return {};
    }
    return reimbursement(officer.id, text, stored);
  }
  return preApproval(officer.id, text);
}

/* ------------------------------------------------------------ extraction */

type Resolved = {
  extraction: Extraction;
  amountCents: number | null;
  amountVerified: boolean;
  line: LineRow | null;
  event: EventRow | null;
  attendeeCount: number | null;
};

async function extractAndResolve(req: RequestRow, traceId: string): Promise<Resolved | null> {
  const org = getOrg();
  const lineNames = getDb().select().from(s.budgetLines).all().map((l) => l.name);
  let res: ClaudeResult<Extraction>;
  try {
    res = await extractRequest(req.message, { lineNames, orgName: org.name });
  } catch (err) {
    if (err instanceof ReplayMissingError) {
      replayMissing(req.id, traceId, err);
      return null;
    }
    if (err instanceof ModelOutputError) {
      audit({ requestId: req.id, traceId, kind: 'error', title: 'extractor output invalid twice → needs_info', data: { message: err.message } });
      await applyEvent(req.id, { type: 'EXTRACTION_FAILED' }, { traceId });
      postMessage({ pane: 'officer', author: 'agent', requestId: req.id, body: "I couldn't read that reliably. What's the amount, what is it for, and which event or project?" });
      return null;
    }
    throw err;
  }
  logClaude(req.id, traceId, 'Extractor read the message', res);
  const x = res.data;

  // Code verifies: the amount must appear verbatim in the officer's message.
  let amountCents: number | null = null;
  let amountVerified = false;
  if (x.amount_text) {
    amountVerified = req.message.toLowerCase().includes(x.amount_text.toLowerCase());
    amountCents = amountVerified ? parseMoneyToCents(x.amount_text) : null;
  }
  const line = resolveLine(x.budget_line);
  const event = resolveEvent(x);
  const attendeeCount = x.attendee_count ?? (event && event.rsvpCount > 0 ? event.rsvpCount : null);
  audit({
    requestId: req.id,
    traceId,
    kind: 'echo',
    title: 'Code verified and resolved the extraction',
    data: {
      amount_text: x.amount_text,
      amountVerbatimInMessage: amountVerified,
      amountCents,
      line: line?.name ?? null,
      event: event ? { id: event.id, name: event.name, date: event.date, rsvps: event.rsvpCount } : null,
      attendeeCount,
      attendeeSource: x.attendee_count ? 'stated' : event ? 'RSVPs' : null,
    },
  });
  updateRequest(req.id, {
    amountCents,
    lineId: line?.id ?? null,
    eventId: event?.id ?? null,
    attendeeCount,
    purpose: x.purpose,
    purposeTag: x.purpose_tag,
    vendorHint: x.vendor_hint,
    projectName: x.project_name,
    extractionJson: JSON.stringify(x),
  });
  return { extraction: x, amountCents, amountVerified, line, event, attendeeCount };
}

function echoFields(r: Resolved, extraAmountLabel?: string) {
  const fields: { label: string; value: string }[] = [];
  fields.push({ label: extraAmountLabel ?? 'Amount', value: r.amountCents != null ? formatCents(r.amountCents) : r.extraction.amount_text ? `“${r.extraction.amount_text}” (not found in your message)` : 'missing' });
  fields.push({ label: 'Budget line', value: r.line?.name ?? 'unclear' });
  if (r.event) fields.push({ label: 'Event', value: `${r.event.name} · ${prettyYmd(r.event.date)}` });
  if (r.attendeeCount) fields.push({ label: 'Attendees', value: `${r.attendeeCount}${r.extraction.attendee_count ? '' : ' RSVPs'}` });
  if (r.extraction.project_name) fields.push({ label: 'Project', value: r.extraction.project_name });
  fields.push({ label: 'For', value: r.extraction.items.length ? r.extraction.items.join(', ') : r.extraction.purpose });
  return fields;
}

/* ---------------------------------------------------------- rules + advice */

function factsFor(req: RequestRow, r: Resolved, receiptItems?: RequestFacts['receiptItems']): RequestFacts {
  const summary = r.line ? lineSummary(r.line.id) : null;
  return {
    fundingSource: req.fundingSource,
    amountCents: getRequest(req.id).amountCents,
    purpose: r.extraction.purpose,
    items: r.extraction.items,
    line: r.line
      ? {
          id: r.line.id,
          name: r.line.name,
          sourceRow: r.line.sourceRow,
          perHeadCapCents: r.line.perHeadCapCents,
          maxPerPurchaseCents: r.line.maxPerPurchaseCents,
          requiredFields: JSON.parse(r.line.requiredFields) as string[],
          remainingCents: summary!.remaining,
        }
      : null,
    eventName: r.event?.name ?? null,
    attendeeCount: r.attendeeCount,
    projectName: r.extraction.project_name,
    receiptItems,
  };
}

/** Tiers A/B, then (only if they pass) the Advisor. Returns false if the request stopped. */
async function checkAndAdvise(req: RequestRow, r: Resolved, traceId: string, opts: { receiptItems?: RequestFacts['receiptItems']; purchaseDate?: string | null }): Promise<boolean> {
  const facts = factsFor(req, r, opts.receiptItems);
  const result = evaluateRules(facts);
  const db = getDb();
  for (const rr of result.results) {
    db.insert(s.ruleResults)
      .values({ requestId: req.id, tier: rr.tier, ruleId: rr.ruleId, outcome: rr.outcome, message: rr.message, suggestion: rr.suggestion ?? null, citation: rr.citation, createdAt: nowIso() })
      .run();
  }
  audit({
    requestId: req.id,
    traceId,
    kind: 'rules',
    title: result.outcome === 'pass' ? `Checks passed (${result.results.length} rules)` : `Check ${result.failed!.ruleId} → ${result.outcome}`,
    data: { outcome: result.outcome, results: result.results },
  });

  if (result.outcome !== 'pass') {
    const f = result.failed!;
    await applyEvent(req.id, { type: result.outcome === 'fail' ? 'RULES_FAILED' : 'RULES_NEEDS_INFO' }, { traceId });
    audit({ requestId: req.id, traceId, kind: 'advice', title: 'Advisor not called (a hard rule did not pass)', data: { skipped: true } });
    postMessage({
      pane: 'officer',
      author: 'agent',
      requestId: req.id,
      body:
        result.outcome === 'fail'
          ? `${req.shortId} can't go through: ${f.message}${f.suggestion ? ` ${f.suggestion}` : ''}`
          : `I need a bit more for ${req.shortId}: ${f.message}${f.suggestion ? ` ${f.suggestion}` : ''}`,
      attachment: { type: 'advice', requestShortId: req.shortId },
    });
    return false;
  }

  // Tier C — advice only. Code computes every number first.
  const line = r.line!;
  const tag = r.extraction.purpose_tag;
  const criteria = applicableCriteria(line.id, tag);
  const precs = relevantPrecedents(line.id, tag);
  const inputs = relevantSignals({ lineId: line.id, purposeTag: tag, eventId: r.event?.id ?? null });
  const current = getRequest(req.id);
  const stats = computeBudgetStats({
    amountCents: current.amountCents!,
    attendeeCount: r.attendeeCount,
    line: { name: line.name, sourceRow: line.sourceRow, remainingCents: lineSummary(line.id).remaining },
    precedents: precs,
    criteria,
    upcomingSameType: r.event ? { count: upcomingCountOfType(r.event.type), typeLabel: EVENT_TYPE_LABEL[r.event.type] ?? 'Events' } : undefined,
    daysSincePurchase: opts.purchaseDate ? Math.max(0, daysBetween(opts.purchaseDate, todayYmd())) : null,
  });
  audit({ requestId: req.id, traceId, kind: 'advice', title: `Code computed ${stats.length} budget stats; ${criteria.length} criteria, ${precs.length} precedents and ${inputs.length} org inputs in context`, data: { stats, criteria: criteria.map((c) => c.id), precedents: precs.map((p) => p.id), orgInputs: inputs.map((g) => g.id) } });

  let run;
  try {
    run = await runAdvisor({
      messageSlug: current.messageSlug,
      request: {
        shortId: current.shortId,
        officerMessage: current.message,
        purpose: r.extraction.purpose,
        purposeTag: tag,
        lineName: line.name,
        eventName: r.event?.name ?? null,
        fundingSource: current.fundingSource,
      },
      stats,
      criteria,
      precedents: precs,
      signals: inputs,
    });
  } catch (err) {
    if (err instanceof ReplayMissingError) {
      replayMissing(req.id, traceId, err);
      return false;
    }
    throw err;
  }
  if (run.call) {
    audit({
      requestId: req.id,
      traceId,
      kind: 'claude',
      title: 'Advisor wrote cited advice',
      model: run.call.model,
      mode: run.call.mode,
      latencyMs: run.call.latencyMs,
      data: { fixtureKey: run.fixtureKey, recording: run.call.recordingPath, output: run.raw },
    });
  }
  db.insert(s.recommendations)
    .values({
      requestId: req.id,
      verdict: run.advice.verdict,
      reasonsJson: JSON.stringify({ headline: run.advice.headline, reasons: run.advice.reasons }),
      droppedJson: JSON.stringify(run.advice.dropped),
      statsJson: JSON.stringify(stats),
      suggestedAmountCents: run.advice.suggestedAmountCents,
      model: run.call?.model ?? null,
      createdAt: nowIso(),
    })
    .run();
  audit({
    requestId: req.id,
    traceId,
    kind: 'advice',
    title: `Advice: ${run.advice.verdict}${run.advice.dropped.length ? ` (${run.advice.dropped.length} uncited reason${run.advice.dropped.length > 1 ? 's' : ''} dropped)` : ''}`,
    data: { verdict: run.advice.verdict, headline: run.advice.headline, reasons: run.advice.reasons, dropped: run.advice.dropped, suggestedAmountCents: run.advice.suggestedAmountCents, error: run.error },
  });

  // Officer sees soft flags before the treasurer does.
  const treasurerFirst = getTreasurer(current.orgId).name.split(' ')[0];
  const v = run.advice.verdict;
  const lead =
    v === 'support'
      ? `Checks passed and it lines up with how the org usually spends.`
      : v === 'unavailable'
        ? `Checks passed. No advice on this one.`
        : `Checks passed. Heads-up before ${treasurerFirst} sees it: ${run.advice.headline}`;
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: req.id,
    body: `${lead} Sent ${req.shortId} to the treasurer for approval.`,
    attachment: { type: 'advice', requestShortId: req.shortId },
  });
  await applyEvent(req.id, { type: 'RULES_PASSED' }, { traceId });
  return true;
}

/* ----------------------------------------------------------- pre-approval */

async function preApproval(officerId: string, text: string) {
  const org = getOrg();
  const traceId = newTraceId();
  const shortId = nextShortId();
  const db = getDb();
  const id = Number(
    db
      .insert(s.requests)
      .values({ shortId, orgId: org.id, officerId, status: 'draft', fundingSource: 'program_card', message: text, messageSlug: slugify(text), createdAt: nowIso(), updatedAt: nowIso() })
      .run().lastInsertRowid,
  );
  audit({ requestId: id, traceId, kind: 'request', title: `${shortId} created from officer message`, data: { message: text, fundingSource: 'program_card' } });
  const req = getRequest(id);

  const r = await extractAndResolve(req, traceId);
  if (!r) return { requestShortId: shortId };

  if (r.extraction.intent === 'reimbursement') {
    updateRequest(id, { status: 'needs_info', statusReason: 'reimbursement needs a receipt' });
    postMessage({ pane: 'officer', author: 'agent', requestId: id, body: 'Sounds like you already paid. Attach a photo of the receipt with a one-line note and I’ll file it as a reimbursement.' });
    return { requestShortId: shortId };
  }
  if (r.extraction.intent === 'other') {
    updateRequest(id, { status: 'needs_info', statusReason: 'not a spending request' });
    postMessage({ pane: 'officer', author: 'agent', requestId: id, body: 'I handle spending: ask before you buy (“Can I spend $50 on pizza for Thursday’s GM?”) or send a receipt to get reimbursed.' });
    return { requestShortId: shortId };
  }

  postMessage({ pane: 'officer', author: 'agent', requestId: id, body: `Here's what I read for ${shortId}. Checking it against ASUC rules and the org's budget sheet…`, attachment: { type: 'echo', requestShortId: shortId, fields: echoFields(r) } });
  await checkAndAdvise(getRequest(id), r, traceId, {});
  return { requestShortId: shortId };
}

/* --------------------------------------------------------- receipt images */

export type StoredImage = { sha256: string; filePath: string; mimeType: 'image/png' | 'image/jpeg'; buffer: Buffer };

export function storeImage(img: ImageUpload): StoredImage {
  const mime = img.mimeType === 'image/jpg' ? 'image/jpeg' : img.mimeType;
  if (mime !== 'image/png' && mime !== 'image/jpeg') throw new BadRequestError('Receipts must be PNG or JPEG photos.');
  if (img.buffer.length > 8 * 1024 * 1024) throw new BadRequestError('That photo is over 8 MB.');
  const sha256 = crypto.createHash('sha256').update(img.buffer).digest('hex');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, `${sha256.slice(0, 16)}${mime === 'image/png' ? '.png' : '.jpg'}`);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, img.buffer);
  return { sha256, filePath, mimeType: mime, buffer: img.buffer };
}

function insertReceiptRow(requestId: number, img: StoredImage): number {
  const db = getDb();
  const dup = db.select().from(s.receipts).where(eq(s.receipts.sha256, img.sha256)).get();
  if (dup) {
    const other = getRequest(dup.requestId);
    throw new ConflictError(`This exact receipt was already submitted with ${other.shortId}.`);
  }
  return Number(
    db.insert(s.receipts).values({ requestId, sha256: img.sha256, filePath: img.filePath, mimeType: img.mimeType, createdAt: nowIso() }).run().lastInsertRowid,
  );
}

async function readAndReconcile(
  req: RequestRow,
  receiptId: number,
  img: StoredImage,
  traceId: string,
  ctx: { chargeCents?: number | null; statedAmountCents?: number | null },
): Promise<{ extraction: ReceiptExtraction; rec: ReconcileResult } | null> {
  let res: ClaudeResult<ReceiptExtraction>;
  try {
    res = await readReceipt({ mediaType: img.mimeType, base64: img.buffer.toString('base64'), sha256: img.sha256 });
  } catch (err) {
    if (err instanceof ReplayMissingError) {
      getDb().delete(s.receipts).where(eq(s.receipts.id, receiptId)).run();
      replayMissing(req.id, traceId, err);
      return null;
    }
    if (err instanceof ModelOutputError) {
      audit({ requestId: req.id, traceId, kind: 'error', title: 'receipt output invalid twice', data: { message: err.message } });
      getDb().update(s.receipts).set({ outcome: 'unreadable', flagsJson: JSON.stringify([{ code: 'unreadable', message: 'Could not read the receipt.' }]) }).where(eq(s.receipts.id, receiptId)).run();
      return null;
    }
    throw err;
  }
  logClaude(req.id, traceId, 'Claude read the receipt photo', res);
  const rec = reconcileReceipt(res.data, { toleranceCents: config.receiptToleranceCents, ...ctx });
  getDb()
    .update(s.receipts)
    .set({ extractionJson: JSON.stringify(res.data), totalCents: rec.totalCents, flagsJson: JSON.stringify(rec.flags), outcome: rec.outcome })
    .where(eq(s.receipts.id, receiptId))
    .run();
  audit({
    requestId: req.id,
    traceId,
    kind: 'receipt',
    title:
      rec.outcome === 'alcohol'
        ? `ASUC-ALC: alcohol on receipt (${rec.alcoholItems.join(', ')})`
        : rec.outcome === 'ok'
          ? `Receipt reconciled: ${formatCents(rec.totalCents!)}${ctx.chargeCents != null ? ` vs charge ${formatCents(ctx.chargeCents)}` : ''} (±${formatCents(config.receiptToleranceCents)})`
          : `Receipt ${rec.outcome}: ${rec.flags.map((f) => f.code).join(', ')}`,
    data: rec,
  });
  return { extraction: res.data, rec };
}

/* -------------------------------------------------------- card receipts */

async function receiptForCardRequest(req: RequestRow, img: StoredImage) {
  const traceId = newTraceId();
  const txn = getDb().select().from(s.cardTransactions).where(eq(s.cardTransactions.requestId, req.id)).get();
  const receiptId = insertReceiptRow(req.id, img);
  audit({ requestId: req.id, traceId, kind: 'receipt', title: `Receipt photo received (sha256 ${img.sha256.slice(0, 12)}…)`, data: { sha256: img.sha256 } });
  const out = await readAndReconcile(req, receiptId, img, traceId, { chargeCents: txn?.amountCents ?? null });
  if (!out) {
    if (getRequest(req.id).status === 'purchased') {
      postMessage({ pane: 'officer', author: 'agent', requestId: req.id, body: "I couldn't read that photo. Try again with the whole receipt flat and in focus." });
    }
    return { requestShortId: req.shortId };
  }
  const { rec } = out;
  if (rec.outcome === 'alcohol') {
    await applyEvent(req.id, { type: 'RECEIPT_ALCOHOL' }, { traceId });
    updateRequest(req.id, { statusReason: `alcohol on receipt: ${rec.alcoholItems.join(', ')}` });
    postMessage({
      pane: 'officer',
      author: 'agent',
      requestId: req.id,
      body: `This receipt includes alcohol (${rec.alcoholItems.join(', ')}), which ASUC can't fund under any circumstances (ASUC-ALC). I've cancelled ${req.shortId} and filed nothing. The ${formatCents(txn!.amountCents)} charge is now owed back to the org; ${getOrg().name}'s treasurer will follow up.`,
      attachment: { type: 'owed_back', requestShortId: req.shortId },
    });
    return { requestShortId: req.shortId };
  }
  if (rec.outcome === 'flagged' || rec.outcome === 'unreadable') {
    await applyEvent(req.id, { type: 'RECEIPT_FLAGGED' }, { traceId });
    postMessage({ pane: 'officer', author: 'agent', requestId: req.id, body: `I read the receipt but something doesn't line up: ${rec.flags.map((f) => f.message).join(' ')} I've asked the treasurer to take a look.` });
    return { requestShortId: req.shortId };
  }
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: req.id,
    body: `Receipt matches the ${formatCents(txn!.amountCents)} charge (within ${formatCents(config.receiptToleranceCents)}), itemized, no alcohol.`,
    attachment: { type: 'receipt', requestShortId: req.shortId },
  });
  await applyEvent(req.id, { type: 'RECEIPT_OK' }, { traceId });
  await applyEvent(req.id, { type: 'QUEUE_FILING' }, { traceId });
  return { requestShortId: req.shortId };
}

/* ---------------------------------------------------------- reimbursement */

async function reimbursement(officerId: string, text: string, img: StoredImage) {
  const org = getOrg();
  const traceId = newTraceId();
  const shortId = nextShortId();
  const db = getDb();
  const id = Number(
    db
      .insert(s.requests)
      .values({ shortId, orgId: org.id, officerId, status: 'receipt_received', fundingSource: 'out_of_pocket', message: text, messageSlug: slugify(text), createdAt: nowIso(), updatedAt: nowIso() })
      .run().lastInsertRowid,
  );
  audit({ requestId: id, traceId, kind: 'request', title: `${shortId} created as a reimbursement (funding_source=out_of_pocket, enters at receipt_received)`, data: { message: text, fundingSource: 'out_of_pocket' } });
  let receiptId: number;
  try {
    receiptId = insertReceiptRow(id, img);
  } catch (err) {
    updateRequest(id, { status: 'rejected', statusReason: (err as Error).message });
    postMessage({ pane: 'officer', author: 'agent', requestId: id, body: (err as Error).message });
    return { requestShortId: shortId };
  }

  const r = await extractAndResolve(getRequest(id), traceId);
  if (!r) return { requestShortId: shortId };
  const out = await readAndReconcile(getRequest(id), receiptId, img, traceId, { statedAmountCents: r.amountCents });
  if (!out) {
    if (getRequest(id).status === 'receipt_received') {
      await applyEvent(id, { type: 'EXTRACTION_FAILED' }, { traceId });
      postMessage({ pane: 'officer', author: 'agent', requestId: id, body: "I couldn't read that receipt. Try another photo with the whole receipt in frame." });
    }
    return { requestShortId: shortId };
  }
  const { rec, extraction } = out;
  if (rec.outcome === 'alcohol') {
    await applyEvent(id, { type: 'RECEIPT_ALCOHOL' }, { traceId });
    updateRequest(id, { statusReason: `alcohol on receipt: ${rec.alcoholItems.join(', ')}`, amountCents: rec.totalCents });
    postMessage({
      pane: 'officer',
      author: 'agent',
      requestId: id,
      body: `This receipt includes alcohol (${rec.alcoholItems.join(', ')}), which ASUC can't reimburse (ASUC-ALC). I've cancelled reimbursement ${shortId}; nothing was filed. If you have a receipt without the alcohol, send that instead.`,
    });
    return { requestShortId: shortId };
  }
  if (rec.outcome !== 'ok') {
    await applyEvent(id, { type: 'RULES_NEEDS_INFO' }, { traceId });
    postMessage({ pane: 'officer', author: 'agent', requestId: id, body: `Before I send this to the treasurer: ${rec.flags.map((f) => f.message).join(' ')}` });
    return { requestShortId: shortId };
  }
  // The filed amount is the receipt total (code-parsed), which matched the stated amount.
  updateRequest(id, { amountCents: rec.totalCents });
  const resolved: Resolved = { ...r, amountCents: rec.totalCents };
  postMessage({
    pane: 'officer',
    author: 'agent',
    requestId: id,
    body: `Here's what I read for reimbursement ${shortId}. Checking it against ASUC rules and the budget sheet…`,
    attachment: {
      type: 'echo',
      requestShortId: shortId,
      fields: [
        ...echoFields(resolved, 'Receipt total'),
        { label: 'Vendor', value: extraction.merchant_name },
        ...(extraction.receipt_date ? [{ label: 'Purchased', value: prettyYmd(extraction.receipt_date) }] : []),
      ],
    },
  });
  await checkAndAdvise(getRequest(id), resolved, traceId, {
    receiptItems: rec.items.map((i) => ({ description: i.description, category: i.category })),
    purchaseDate: extraction.receipt_date,
  });
  return { requestShortId: shortId };
}
