import { describe, it, expect } from 'vitest';
import { transition, TERMINAL_STATUSES, InvalidTransitionError, type MachineRequest, type MachineEvent } from '@/lib/state/machine';
import { REQUEST_STATUSES, type RequestStatus } from '@/lib/types';

describe('state machine: transition()', () => {
  const cardReq = (status: RequestStatus): MachineRequest => ({ status, fundingSource: 'program_card' });
  const reimbReq = (status: RequestStatus): MachineRequest => ({ status, fundingSource: 'out_of_pocket' });

  describe('valid transitions', () => {
    it('card RULES_PASSED from draft → awaiting_approval with notify_treasurer', () => {
      const result = transition(cardReq('draft'), { type: 'RULES_PASSED' });
      expect(result.status).toBe('awaiting_approval');
      expect(result.effects).toContainEqual({ type: 'notify_treasurer' });
    });

    it('reimbursement RULES_PASSED from receipt_received → awaiting_approval', () => {
      const result = transition(reimbReq('receipt_received'), { type: 'RULES_PASSED' });
      expect(result.status).toBe('awaiting_approval');
      expect(result.effects).toContainEqual({ type: 'notify_treasurer' });
    });

    it('card RULES_FAILED from draft → rejected', () => {
      const result = transition(cardReq('draft'), { type: 'RULES_FAILED' });
      expect(result.status).toBe('rejected');
      expect(result.effects).toHaveLength(0);
    });

    it('card RULES_NEEDS_INFO from draft → needs_info', () => {
      const result = transition(cardReq('draft'), { type: 'RULES_NEEDS_INFO' });
      expect(result.status).toBe('needs_info');
    });

    it('card APPROVE from awaiting_approval → approved with commit, record_precedent, issue_card', () => {
      const result = transition(cardReq('awaiting_approval'), { type: 'APPROVE', amountCents: 5000 });
      expect(result.status).toBe('approved');
      expect(result.effects).toEqual([
        { type: 'commit_budget', amountCents: 5000 },
        { type: 'record_precedent' },
        { type: 'issue_card', amountCents: 5000 },
      ]);
    });

    it('reimbursement APPROVE from awaiting_approval → filing_queued with record_precedent, queue_filing', () => {
      const result = transition(reimbReq('awaiting_approval'), { type: 'APPROVE', amountCents: 5000 });
      expect(result.status).toBe('filing_queued');
      expect(result.effects).toEqual([{ type: 'record_precedent' }, { type: 'queue_filing' }]);
    });

    it('DENY from awaiting_approval → denied with record_precedent', () => {
      const result = transition(cardReq('awaiting_approval'), { type: 'DENY' });
      expect(result.status).toBe('denied');
      expect(result.effects).toContainEqual({ type: 'record_precedent' });
    });

    it('card EXPIRE from awaiting_approval → expired', () => {
      const result = transition(cardReq('awaiting_approval'), { type: 'EXPIRE' });
      expect(result.status).toBe('expired');
    });

    it('card EXPIRE from card_issued → expired with terminate_card, release_commit', () => {
      const result = transition(cardReq('card_issued'), { type: 'EXPIRE' });
      expect(result.status).toBe('expired');
      expect(result.effects).toContainEqual({ type: 'terminate_card' });
      expect(result.effects).toContainEqual({ type: 'release_commit' });
    });

    it('card CARD_ISSUED from approved → card_issued', () => {
      const result = transition(cardReq('approved'), { type: 'CARD_ISSUED' });
      expect(result.status).toBe('card_issued');
    });

    it('card TXN_SETTLED from card_issued → purchased', () => {
      const result = transition(cardReq('card_issued'), { type: 'TXN_SETTLED', amountCents: 4873 });
      expect(result.status).toBe('purchased');
      expect(result.effects).toContainEqual({ type: 'release_commit' });
      expect(result.effects).toContainEqual({ type: 'record_settled', amountCents: 4873 });
      expect(result.effects).toContainEqual({ type: 'terminate_card' });
      expect(result.effects).toContainEqual({ type: 'ask_receipt' });
    });

    it('card RECEIPT_OK from purchased → receipt_received', () => {
      const result = transition(cardReq('purchased'), { type: 'RECEIPT_OK' });
      expect(result.status).toBe('receipt_received');
    });

    it('card RECEIPT_FLAGGED from purchased → receipt_flagged', () => {
      const result = transition(cardReq('purchased'), { type: 'RECEIPT_FLAGGED' });
      expect(result.status).toBe('receipt_flagged');
      expect(result.effects).toContainEqual({ type: 'notify_treasurer' });
    });

    it('card RECEIPT_ALCOHOL from purchased → cancelled with mark_owed_back', () => {
      const result = transition(cardReq('purchased'), { type: 'RECEIPT_ALCOHOL' });
      expect(result.status).toBe('cancelled');
      expect(result.effects).toContainEqual({ type: 'mark_owed_back' });
    });

    it('reimbursement RECEIPT_ALCOHOL from receipt_received → cancelled', () => {
      const result = transition(reimbReq('receipt_received'), { type: 'RECEIPT_ALCOHOL' });
      expect(result.status).toBe('cancelled');
    });

    it('card QUEUE_FILING from receipt_received → filing_queued', () => {
      const result = transition(cardReq('receipt_received'), { type: 'QUEUE_FILING' });
      expect(result.status).toBe('filing_queued');
      expect(result.effects).toContainEqual({ type: 'queue_filing' });
    });

    it('RESOLVE_ACCEPT from receipt_flagged → filing_queued', () => {
      const result = transition(cardReq('receipt_flagged'), { type: 'RESOLVE_ACCEPT' });
      expect(result.status).toBe('filing_queued');
      expect(result.effects).toContainEqual({ type: 'queue_filing' });
    });

    it('RESOLVE_CANCEL from receipt_flagged → cancelled', () => {
      const result = transition(cardReq('receipt_flagged'), { type: 'RESOLVE_CANCEL' });
      expect(result.status).toBe('cancelled');
      expect(result.effects).toContainEqual({ type: 'mark_owed_back' });
    });

    it('FILED from filing_queued → filed with record_filed', () => {
      const result = transition(cardReq('filing_queued'), { type: 'FILED' });
      expect(result.status).toBe('filed');
      expect(result.effects).toContainEqual({ type: 'record_filed' });
    });

    it('CLOSE from filed → closed', () => {
      const result = transition(cardReq('filed'), { type: 'CLOSE' });
      expect(result.status).toBe('closed');
    });

    it('FILING_FAILED from filing_queued → filing_failed', () => {
      const result = transition(cardReq('filing_queued'), { type: 'FILING_FAILED' });
      expect(result.status).toBe('filing_failed');
    });

    it('ESCALATE from filing_failed → needs_human', () => {
      const result = transition(cardReq('filing_failed'), { type: 'ESCALATE' });
      expect(result.status).toBe('needs_human');
      expect(result.effects).toContainEqual({ type: 'notify_treasurer' });
    });

    it('RETRY_FILING from filing_failed → filing_queued', () => {
      const result = transition(cardReq('filing_failed'), { type: 'RETRY_FILING' });
      expect(result.status).toBe('filing_queued');
      expect(result.effects).toContainEqual({ type: 'queue_filing' });
    });

    it('RETRY_FILING from needs_human → filing_queued', () => {
      const result = transition(cardReq('needs_human'), { type: 'RETRY_FILING' });
      expect(result.status).toBe('filing_queued');
      expect(result.effects).toContainEqual({ type: 'queue_filing' });
    });

    it('EXTRACTION_FAILED from draft → needs_info', () => {
      const result = transition(cardReq('draft'), { type: 'EXTRACTION_FAILED' });
      expect(result.status).toBe('needs_info');
    });

    it('EXTRACTION_FAILED from receipt_received → needs_info', () => {
      const result = transition(reimbReq('receipt_received'), { type: 'EXTRACTION_FAILED' });
      expect(result.status).toBe('needs_info');
    });
  });

  describe('invalid transitions throw InvalidTransitionError', () => {
    it('APPROVE from draft throws', () => {
      expect(() => transition(cardReq('draft'), { type: 'APPROVE', amountCents: 5000 })).toThrow(InvalidTransitionError);
    });

    it('TXN_SETTLED on out_of_pocket throws', () => {
      expect(() => transition(reimbReq('card_issued'), { type: 'TXN_SETTLED', amountCents: 5000 })).toThrow(InvalidTransitionError);
    });

    it('DENY from denied throws', () => {
      expect(() => transition(cardReq('denied'), { type: 'DENY' })).toThrow(InvalidTransitionError);
    });

    it('any transition from closed throws', () => {
      expect(() => transition(cardReq('closed'), { type: 'CLOSE' })).toThrow(InvalidTransitionError);
      expect(() => transition(cardReq('closed'), { type: 'APPROVE', amountCents: 5000 })).toThrow(InvalidTransitionError);
    });

    it('RULES_PASSED from receipt_received on program_card throws', () => {
      expect(() => transition(cardReq('receipt_received'), { type: 'RULES_PASSED' })).toThrow(InvalidTransitionError);
    });

    it('RECEIPT_FLAGGED from rejected throws', () => {
      expect(() => transition(cardReq('rejected'), { type: 'RECEIPT_FLAGGED' })).toThrow(InvalidTransitionError);
    });
  });

  describe('edge cases', () => {
    it('APPROVE with amountCents 0 throws BadRequest-like error', () => {
      expect(() => transition(cardReq('awaiting_approval'), { type: 'APPROVE', amountCents: 0 })).toThrow('approved amount must be positive');
    });

    it('APPROVE with negative amount throws', () => {
      expect(() => transition(cardReq('awaiting_approval'), { type: 'APPROVE', amountCents: -1000 })).toThrow('approved amount must be positive');
    });
  });

  describe('every REQUEST_STATUS returns valid status or throws for any event', () => {
    it('every status in REQUEST_STATUSES can transition or throw', () => {
      const testEvents: MachineEvent[] = [
        { type: 'RULES_PASSED' },
        { type: 'RULES_FAILED' },
        { type: 'RULES_NEEDS_INFO' },
        { type: 'APPROVE', amountCents: 5000 },
        { type: 'DENY' },
        { type: 'EXPIRE' },
        { type: 'CARD_ISSUED' },
        { type: 'TXN_SETTLED', amountCents: 5000 },
        { type: 'RECEIPT_OK' },
        { type: 'RECEIPT_FLAGGED' },
        { type: 'RECEIPT_ALCOHOL' },
        { type: 'QUEUE_FILING' },
        { type: 'RESOLVE_ACCEPT' },
        { type: 'RESOLVE_CANCEL' },
        { type: 'FILED' },
        { type: 'CLOSE' },
        { type: 'FILING_FAILED' },
        { type: 'ESCALATE' },
        { type: 'RETRY_FILING' },
        { type: 'EXTRACTION_FAILED' },
      ];

      for (const status of REQUEST_STATUSES) {
        const req = status === 'needs_info' ? reimbReq(status) : cardReq(status);
        for (const event of testEvents) {
          try {
            const result = transition(req, event);
            // Must return a valid status in REQUEST_STATUSES
            expect(REQUEST_STATUSES).toContain(result.status);
            expect(Array.isArray(result.effects)).toBe(true);
          } catch (err) {
            // All errors should be InvalidTransitionError or specific validation errors
            if (err instanceof InvalidTransitionError) {
              // Expected for many invalid combinations
            } else if (err instanceof Error && err.message.includes('approved amount')) {
              // Expected for APPROVE with invalid amount
            } else {
              throw err; // Unexpected error type
            }
          }
        }
      }
    });
  });

  describe('terminal statuses', () => {
    it('TERMINAL_STATUSES are the expected 5', () => {
      expect(TERMINAL_STATUSES.sort()).toEqual(['cancelled', 'closed', 'denied', 'expired', 'rejected'].sort());
    });

    it('all terminal statuses throw on any transition', () => {
      const events: MachineEvent[] = [
        { type: 'RULES_PASSED' },
        { type: 'APPROVE', amountCents: 5000 },
        { type: 'CARD_ISSUED' },
      ];
      for (const terminal of TERMINAL_STATUSES) {
        for (const event of events) {
          expect(() => transition(cardReq(terminal), event)).toThrow(InvalidTransitionError);
        }
      }
    });
  });
});
