/** Read model for the simulator: one JSON snapshot of everything on screen. */
import type { PortalFormView } from './portal/virtualPortal';
import { asc, desc, eq } from 'drizzle-orm';
import path from 'node:path';
import { getDb } from './db/client';
import * as s from './db/schema';
import { config } from './config';
import { lineSummaries } from './ledger';
import type { Attachment } from './chat';
import type { BudgetStat, DroppedReason, RenderedReason, RequestStatus } from './types';
import type { RuleResult } from './rules/engine';
import type { ReceiptFlag } from './receipts/reconcile';

export type MessageView = { id: number; pane: 'officer' | 'treasurer'; author: 'member' | 'agent'; memberId: string | null; body: string; attachment: Attachment | null; createdAt: string; requestShortId: string | null };

export type RequestView = {
  id: number;
  shortId: string;
  status: RequestStatus;
  statusReason: string | null;
  fundingSource: 'program_card' | 'out_of_pocket';
  message: string;
  amountCents: number | null;
  approvedAmountCents: number | null;
  line: { id: string; name: string; sourceRow: number } | null;
  event: { id: string; name: string; date: string; rsvpCount: number } | null;
  attendeeCount: number | null;
  purpose: string | null;
  purposeTag: string | null;
  projectName: string | null;
  officer: { id: string; name: string };
  createdAt: string;
  rules: (RuleResult & { id: number })[];
  recommendation: {
    verdict: 'support' | 'caution' | 'against' | 'unavailable';
    headline: string;
    reasons: RenderedReason[];
    dropped: DroppedReason[];
    stats: BudgetStat[];
    suggestedAmountCents: number | null;
    model: string | null;
  } | null;
  card: { last4: string; limitCents: number; allowedCategories: string[]; expiresAt: string; status: string } | null;
  transaction: { amountCents: number; merchantName: string; merchantCategory: string; settledAt: string; resolution: string | null } | null;
  receipt: { url: string; totalCents: number | null; outcome: string | null; flags: ReceiptFlag[]; merchant: string | null; date: string | null } | null;
  filing: { status: string; confirmationId: string | null; attempts: number; lastError: string | null; idempotencyKey: string; latestScreenshot: string | null; latestForm: PortalFormView | null; formType: string } | null;
  approvals: { decision: string; amountCents: number | null; note: string | null; precedentId: string | null; criterionId: string | null; memberName: string; createdAt: string }[];
};

export type AuditView = { id: number; requestShortId: string | null; traceId: string | null; kind: string; title: string; model: string | null; mode: string | null; latencyMs: number | null; data: unknown; screenshot: string | null; createdAt: string };

export type AppState = {
  mode: { claude: string; portalRunner: string; issuer: string; model: string; bufferPct: number; toleranceCents: number };
  org: { name: string; semester: string } | null;
  members: { id: string; name: string; role: string; title: string }[];
  budget: {
    lines: { id: string; name: string; sourceRow: number; allocated: number; spent: number; committed: number; remaining: number; unreconciled: number }[];
    unreconciled: { totalCents: number; items: { shortId: string; amountCents: number; merchantName: string; resolution: string | null }[] };
  };
  messages: MessageView[];
  requests: RequestView[];
  audit: AuditView[];
  knowledge: { precedents: number; criteria: number; latestPrecedent: { id: string; note: string | null } | null };
};

const j = <T,>(v: string | null, fallback: T): T => (v ? (JSON.parse(v) as T) : fallback);

export function buildState(opts: { auditLimit?: number } = {}): AppState {
  const db = getDb();
  const org = db.select().from(s.orgs).get() ?? null;
  const members = db.select().from(s.members).all();
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const reqs = db.select().from(s.requests).orderBy(asc(s.requests.id)).all();
  const shortById = new Map(reqs.map((r) => [r.id, r.shortId]));
  const lines = db.select().from(s.budgetLines).all();
  const events = db.select().from(s.events).all();
  const rules = db.select().from(s.ruleResults).orderBy(asc(s.ruleResults.id)).all();
  const recs = db.select().from(s.recommendations).orderBy(asc(s.recommendations.id)).all();
  const cards = db.select().from(s.cards).orderBy(asc(s.cards.id)).all();
  const txns = db.select().from(s.cardTransactions).all();
  const receipts = db.select().from(s.receipts).orderBy(asc(s.receipts.id)).all();
  const filings = db.select().from(s.portalFilings).all();
  const approvals = db.select().from(s.approvals).orderBy(asc(s.approvals.id)).all();
  const auditRows = db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(opts.auditLimit ?? 500).all().reverse();
  const lastShotByRequest = new Map<number, string>();
  const lastFormByRequest = new Map<number, PortalFormView>();
  for (const a of auditRows) {
    if (!a.requestId) continue;
    if (a.screenshot) lastShotByRequest.set(a.requestId, a.screenshot);
    if (a.kind === 'browser' && a.dataJson?.includes('"portalForm"')) {
      const form = j<{ portalForm?: PortalFormView }>(a.dataJson, {}).portalForm;
      if (form) lastFormByRequest.set(a.requestId, form);
    }
  }

  const requests: RequestView[] = reqs.map((r) => {
    const line = lines.find((l) => l.id === r.lineId);
    const ev = events.find((e) => e.id === r.eventId);
    const rec = recs.filter((x) => x.requestId === r.id).at(-1);
    const card = cards.filter((c) => c.requestId === r.id).at(-1);
    const txn = txns.find((t) => t.requestId === r.id);
    const receipt = receipts.filter((x) => x.requestId === r.id).at(-1);
    const filing = filings.find((f) => f.requestId === r.id);
    const recBody = rec ? j<{ headline: string; reasons: RenderedReason[] }>(rec.reasonsJson, { headline: '', reasons: [] }) : null;
    const rx = receipt?.extractionJson ? (JSON.parse(receipt.extractionJson) as { merchant_name?: string; receipt_date?: string | null }) : null;
    return {
      id: r.id,
      shortId: r.shortId,
      status: r.status as RequestStatus,
      statusReason: r.statusReason,
      fundingSource: r.fundingSource,
      message: r.message,
      amountCents: r.amountCents,
      approvedAmountCents: r.approvedAmountCents,
      line: line ? { id: line.id, name: line.name, sourceRow: line.sourceRow } : null,
      event: ev ? { id: ev.id, name: ev.name, date: ev.date, rsvpCount: ev.rsvpCount } : null,
      attendeeCount: r.attendeeCount,
      purpose: r.purpose,
      purposeTag: r.purposeTag,
      projectName: r.projectName,
      officer: { id: r.officerId, name: memberName.get(r.officerId) ?? r.officerId },
      createdAt: r.createdAt,
      rules: rules
        .filter((x) => x.requestId === r.id)
        .map((x) => ({ id: x.id, tier: x.tier, ruleId: x.ruleId, outcome: x.outcome, message: x.message, suggestion: x.suggestion ?? undefined, citation: x.citation ?? '' })),
      recommendation: rec
        ? {
            verdict: rec.verdict,
            headline: recBody!.headline,
            reasons: recBody!.reasons,
            dropped: j<DroppedReason[]>(rec.droppedJson, []),
            stats: j<BudgetStat[]>(rec.statsJson, []),
            suggestedAmountCents: rec.suggestedAmountCents,
            model: rec.model,
          }
        : null,
      card: card ? { last4: card.last4, limitCents: card.limitCents, allowedCategories: JSON.parse(card.allowedCategories) as string[], expiresAt: card.expiresAt, status: card.status } : null,
      transaction: txn ? { amountCents: txn.amountCents, merchantName: txn.merchantName, merchantCategory: txn.merchantCategory, settledAt: txn.settledAt, resolution: txn.resolution } : null,
      receipt: receipt
        ? { url: `/api/uploads/${path.basename(receipt.filePath)}`, totalCents: receipt.totalCents, outcome: receipt.outcome, flags: j<ReceiptFlag[]>(receipt.flagsJson, []), merchant: rx?.merchant_name ?? null, date: rx?.receipt_date ?? null }
        : null,
      filing: filing
        ? { status: filing.status, confirmationId: filing.confirmationId, attempts: filing.attempts, lastError: filing.lastError, idempotencyKey: filing.idempotencyKey, latestScreenshot: lastShotByRequest.get(r.id) ?? null, latestForm: lastFormByRequest.get(r.id) ?? null, formType: filing.formType }
        : null,
      approvals: approvals
        .filter((a) => a.requestId === r.id)
        .map((a) => ({ decision: a.decision, amountCents: a.amountCents, note: a.note, precedentId: a.precedentId, criterionId: a.criterionId, memberName: memberName.get(a.memberId) ?? a.memberId, createdAt: a.createdAt })),
    };
  });

  const msgs = db.select().from(s.chatMessages).orderBy(asc(s.chatMessages.id)).all();
  const summaries = lineSummaries();
  const owed = txns.filter((t) => t.resolution === 'owed_back');
  const unreconciledTotal = summaries.reduce((a, l) => a + l.unreconciled, 0);
  const unreconciledItems = txns
    .filter((t) => {
      const r = reqs.find((x) => x.id === t.requestId);
      return t.resolution === 'owed_back' || (r && !['closed', 'filed'].includes(r.status) && t.resolution !== 'repaid');
    })
    .map((t) => ({ shortId: shortById.get(t.requestId) ?? '?', amountCents: t.amountCents, merchantName: t.merchantName, resolution: t.resolution }));
  void owed;

  const precs = db.select().from(s.precedents).all();
  const latest = precs.filter((p) => p.createdFromRequestId).sort((a, b) => b.id.localeCompare(a.id))[0];

  return {
    mode: {
      claude: config.claudeMode,
      portalRunner: config.portalRunner,
      issuer: config.issuer,
      model: config.model('advisor'),
      bufferPct: config.cardBufferPct,
      toleranceCents: config.receiptToleranceCents,
    },
    org: org ? { name: org.name, semester: org.semester } : null,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, title: m.title })),
    budget: {
      lines: summaries.map((l) => ({ id: l.id, name: l.name, sourceRow: l.sourceRow, allocated: l.allocated, spent: l.spent, committed: l.committed, remaining: l.remaining, unreconciled: l.unreconciled })),
      unreconciled: { totalCents: unreconciledTotal, items: unreconciledItems },
    },
    messages: msgs.map((m) => ({
      id: m.id,
      pane: m.pane,
      author: m.author,
      memberId: m.memberId,
      body: m.body,
      attachment: m.attachmentJson ? (JSON.parse(m.attachmentJson) as Attachment) : null,
      createdAt: m.createdAt,
      requestShortId: m.requestId ? (shortById.get(m.requestId) ?? null) : null,
    })),
    requests,
    audit: auditRows.map((a) => ({
      id: a.id,
      requestShortId: a.requestId ? (shortById.get(a.requestId) ?? null) : null,
      traceId: a.traceId,
      kind: a.kind,
      title: a.title,
      model: a.model,
      mode: a.mode,
      latencyMs: a.latencyMs,
      data: a.dataJson ? (JSON.parse(a.dataJson) as unknown) : null,
      screenshot: a.screenshot,
      createdAt: a.createdAt,
    })),
    knowledge: { precedents: precs.length, criteria: db.select().from(s.orgCriteria).all().length, latestPrecedent: latest ? { id: latest.id, note: latest.treasurerNote } : null },
  };
}

void eq;
