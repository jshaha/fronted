import { eq } from 'drizzle-orm';
import { getDb } from './db/client';
import { budgetLines, ledgerEntries } from './db/schema';
import { nowIso } from './clock';
import type { FundingSource } from './types';

export type LedgerKind = 'commit' | 'release' | 'card_settled' | 'filed' | 'adjust';

export type LedgerRow = {
  lineId: string;
  kind: LedgerKind;
  amountCents: number;
  fundingSource: FundingSource;
};

export type LineTotals = {
  allocated: number;
  spent: number;
  committed: number;
  remaining: number;
  unreconciled: number;
};

/**
 * Pure budget math. Remaining is always derived from ledger rows, never stored.
 *   committed    = Σcommit − Σrelease
 *   spent        = Σcard_settled + Σfiled(out_of_pocket) + Σadjust
 *   unreconciled = Σcard_settled − Σfiled(program_card) + Σadjust(program_card)
 *   remaining    = allocated − spent − committed
 */
export function computeTotals(allocated: number, rows: LedgerRow[]): LineTotals {
  let committed = 0;
  let spent = 0;
  let unreconciled = 0;
  for (const r of rows) {
    if (r.kind !== 'adjust' && r.amountCents < 0) throw new Error(`ledger ${r.kind} amount must be positive`);
    switch (r.kind) {
      case 'commit':
        committed += r.amountCents;
        break;
      case 'release':
        committed -= r.amountCents;
        break;
      case 'card_settled':
        spent += r.amountCents;
        unreconciled += r.amountCents;
        break;
      case 'filed':
        if (r.fundingSource === 'out_of_pocket') spent += r.amountCents;
        else unreconciled -= r.amountCents;
        break;
      case 'adjust':
        spent += r.amountCents;
        if (r.fundingSource === 'program_card') unreconciled += r.amountCents;
        break;
    }
  }
  return { allocated, spent, committed, remaining: allocated - spent - committed, unreconciled };
}

export type LineSummary = LineTotals & { id: string; name: string; sourceRow: number };

export function lineSummaries(): LineSummary[] {
  const db = getDb();
  const lines = db.select().from(budgetLines).all();
  const rows = db.select().from(ledgerEntries).all();
  return lines.map((l) => ({
    id: l.id,
    name: l.name,
    sourceRow: l.sourceRow,
    ...computeTotals(
      l.allocatedCents,
      rows.filter((r) => r.lineId === l.id),
    ),
  }));
}

export function lineSummary(lineId: string): LineSummary {
  const s = lineSummaries().find((l) => l.id === lineId);
  if (!s) throw new Error(`unknown budget line ${lineId}`);
  return s;
}

export function ledgerFor(requestId: number) {
  return getDb().select().from(ledgerEntries).where(eq(ledgerEntries.requestId, requestId)).all();
}

export function writeLedger(entry: LedgerRow & { requestId: number | null; memo?: string }) {
  getDb()
    .insert(ledgerEntries)
    .values({ ...entry, memo: entry.memo ?? null, createdAt: nowIso() })
    .run();
}

/** Net commitment still open for a request (commit − release). */
export function openCommitment(requestId: number): number {
  return ledgerFor(requestId).reduce((acc, r) => acc + (r.kind === 'commit' ? r.amountCents : r.kind === 'release' ? -r.amountCents : 0), 0);
}
