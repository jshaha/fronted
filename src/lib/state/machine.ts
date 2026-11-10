/**
 * transition(request, event) → {status, effects}. Pure. Invalid transitions throw.
 * Claude never emits events; only the orchestrator (code) does.
 */
import type { FundingSource, RequestStatus } from '../types';

export type MachineEvent =
  | { type: 'RULES_PASSED' }
  | { type: 'RULES_FAILED' }
  | { type: 'RULES_NEEDS_INFO' }
  | { type: 'EXTRACTION_FAILED' }
  | { type: 'APPROVE'; amountCents: number }
  | { type: 'DENY' }
  | { type: 'EXPIRE' }
  | { type: 'CARD_ISSUED' }
  | { type: 'TXN_SETTLED'; amountCents: number }
  | { type: 'RECEIPT_OK' }
  | { type: 'RECEIPT_FLAGGED' }
  | { type: 'RECEIPT_ALCOHOL' }
  | { type: 'QUEUE_FILING' }
  | { type: 'RESOLVE_ACCEPT' }
  | { type: 'RESOLVE_CANCEL' }
  | { type: 'FILED' }
  | { type: 'CLOSE' }
  | { type: 'FILING_FAILED' }
  | { type: 'ESCALATE' }
  | { type: 'RETRY_FILING' };

export type Effect =
  | { type: 'commit_budget'; amountCents: number }
  | { type: 'release_commit' }
  | { type: 'issue_card'; amountCents: number }
  | { type: 'terminate_card' }
  | { type: 'record_settled'; amountCents: number }
  | { type: 'record_precedent' }
  | { type: 'ask_receipt' }
  | { type: 'queue_filing' }
  | { type: 'record_filed' }
  | { type: 'mark_owed_back' }
  | { type: 'notify_treasurer' };

export type MachineRequest = { status: RequestStatus; fundingSource: FundingSource };
export type TransitionResult = { status: RequestStatus; effects: Effect[] };

export class InvalidTransitionError extends Error {
  constructor(
    public from: RequestStatus,
    public event: MachineEvent['type'],
    public fundingSource: FundingSource,
  ) {
    super(`Invalid transition: ${event} from ${from} (${fundingSource})`);
    this.name = 'InvalidTransitionError';
  }
}

export const TERMINAL_STATUSES: RequestStatus[] = ['rejected', 'denied', 'expired', 'closed', 'cancelled'];

export function transition(req: MachineRequest, ev: MachineEvent): TransitionResult {
  const card = req.fundingSource === 'program_card';
  const s = req.status;
  const bad = () => {
    throw new InvalidTransitionError(s, ev.type, req.fundingSource);
  };

  switch (ev.type) {
    case 'EXTRACTION_FAILED':
      return s === 'draft' || s === 'receipt_received' ? { status: 'needs_info', effects: [] } : bad();

    case 'RULES_PASSED':
      if (s === 'draft' && card) return { status: 'awaiting_approval', effects: [{ type: 'notify_treasurer' }] };
      if (s === 'receipt_received' && !card) return { status: 'awaiting_approval', effects: [{ type: 'notify_treasurer' }] };
      return bad();
    case 'RULES_FAILED':
      if ((s === 'draft' && card) || (s === 'receipt_received' && !card)) return { status: 'rejected', effects: [] };
      return bad();
    case 'RULES_NEEDS_INFO':
      if ((s === 'draft' && card) || (s === 'receipt_received' && !card)) return { status: 'needs_info', effects: [] };
      return bad();

    case 'APPROVE':
      if (s !== 'awaiting_approval') return bad();
      if (ev.amountCents <= 0) throw new Error('approved amount must be positive');
      return card
        ? {
            status: 'approved',
            effects: [{ type: 'commit_budget', amountCents: ev.amountCents }, { type: 'record_precedent' }, { type: 'issue_card', amountCents: ev.amountCents }],
          }
        : { status: 'filing_queued', effects: [{ type: 'record_precedent' }, { type: 'queue_filing' }] };
    case 'DENY':
      return s === 'awaiting_approval' ? { status: 'denied', effects: [{ type: 'record_precedent' }] } : bad();
    case 'EXPIRE':
      if (s === 'awaiting_approval') return { status: 'expired', effects: [] };
      if (s === 'card_issued' && card) return { status: 'expired', effects: [{ type: 'terminate_card' }, { type: 'release_commit' }] };
      return bad();

    case 'CARD_ISSUED':
      return s === 'approved' && card ? { status: 'card_issued', effects: [] } : bad();
    case 'TXN_SETTLED':
      return s === 'card_issued' && card
        ? {
            status: 'purchased',
            effects: [
              { type: 'release_commit' },
              { type: 'record_settled', amountCents: ev.amountCents },
              { type: 'terminate_card' },
              { type: 'ask_receipt' },
            ],
          }
        : bad();

    case 'RECEIPT_OK':
      return s === 'purchased' && card ? { status: 'receipt_received', effects: [] } : bad();
    case 'RECEIPT_FLAGGED':
      return s === 'purchased' && card ? { status: 'receipt_flagged', effects: [{ type: 'notify_treasurer' }] } : bad();
    case 'RECEIPT_ALCOHOL':
      if (s === 'purchased' && card) return { status: 'cancelled', effects: [{ type: 'mark_owed_back' }] };
      if (s === 'receipt_received' && !card) return { status: 'cancelled', effects: [] };
      return bad();
    case 'QUEUE_FILING':
      return s === 'receipt_received' && card ? { status: 'filing_queued', effects: [{ type: 'queue_filing' }] } : bad();
    case 'RESOLVE_ACCEPT':
      return s === 'receipt_flagged' ? { status: 'filing_queued', effects: [{ type: 'queue_filing' }] } : bad();
    case 'RESOLVE_CANCEL':
      return s === 'receipt_flagged' ? { status: 'cancelled', effects: [{ type: 'mark_owed_back' }] } : bad();

    case 'FILED':
      return s === 'filing_queued' ? { status: 'filed', effects: [{ type: 'record_filed' }] } : bad();
    case 'CLOSE':
      return s === 'filed' ? { status: 'closed', effects: [] } : bad();
    case 'FILING_FAILED':
      return s === 'filing_queued' ? { status: 'filing_failed', effects: [] } : bad();
    case 'ESCALATE':
      return s === 'filing_failed' ? { status: 'needs_human', effects: [{ type: 'notify_treasurer' }] } : bad();
    case 'RETRY_FILING':
      return s === 'needs_human' || s === 'filing_failed' ? { status: 'filing_queued', effects: [{ type: 'queue_filing' }] } : bad();
  }
}
