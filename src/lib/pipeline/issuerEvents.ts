/**
 * The single handler for normalized card-issuer events. "Simulate purchase"
 * and POST /api/issuer/events both land here — the same path a real adapter's
 * webhook would take.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { audit } from '../audit';
import { postMessage } from '../chat';
import { formatCents } from '../money';
import { getIssuer } from '../card/mockIssuer';
import type { IssuerEvent } from '../card/issuer';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';
import { applyEvent, newTraceId } from './core';
import { cardForRequest, getMember, getRequest, getRequestByShortId } from './repo';

const DECLINE_TEXT: Record<string, string> = {
  card_inactive: 'the card is no longer active',
  card_expired: 'the card has expired',
  over_limit: "it's over the card's limit",
  category_blocked: "that merchant category isn't allowed on this card",
};

export async function handleIssuerEvent(event: IssuerEvent): Promise<{ handled: 'settled' | 'duplicate' | 'declined' }> {
  const db = getDb();
  const card = db.select().from(s.cards).where(eq(s.cards.externalCardId, event.external_card_id)).get();
  if (!card) throw new NotFoundError(`No card ${event.external_card_id}`);
  const req = getRequest(card.requestId);
  const traceId = newTraceId();

  if (event.type === 'authorization.declined') {
    audit({ requestId: req.id, traceId, kind: 'issuer_event', title: `authorization.declined: ${event.reason} (${formatCents(event.amount_cents)} at ${event.merchant_name})`, data: event });
    postMessage({
      pane: 'officer',
      author: 'agent',
      requestId: req.id,
      body: `Declined ${formatCents(event.amount_cents)} at ${event.merchant_name}: ${DECLINE_TEXT[event.reason]}. Card limit is ${formatCents(card.limitCents)}.`,
      attachment: { type: 'card', requestShortId: req.shortId },
    });
    return { handled: 'declined' };
  }

  // Idempotent: the same external transaction is only processed once.
  const dup = db.select().from(s.cardTransactions).where(eq(s.cardTransactions.externalTransactionId, event.external_transaction_id)).get();
  if (dup) {
    audit({ requestId: req.id, traceId, kind: 'issuer_event', title: `duplicate transaction.settled ignored (${event.external_transaction_id})`, data: event });
    return { handled: 'duplicate' };
  }
  db.insert(s.cardTransactions)
    .values({
      cardId: card.id,
      requestId: req.id,
      externalTransactionId: event.external_transaction_id,
      amountCents: event.amount_cents,
      merchantName: event.merchant_name,
      merchantCategory: event.merchant_category,
      settledAt: event.settled_at,
    })
    .run();
  audit({ requestId: req.id, traceId, kind: 'issuer_event', title: `transaction.settled ${formatCents(event.amount_cents)} at ${event.merchant_name}`, data: event });
  await applyEvent(req.id, { type: 'TXN_SETTLED', amountCents: event.amount_cents }, { traceId });
  return { handled: 'settled' };
}

/** Demo control: ask the mock issuer to authorize a purchase, then feed its event to the handler. */
export async function simulatePurchase(input: { shortId: string; actorId: string; amountCents: number; merchantName: string; merchantCategory: string }) {
  const req = getRequestByShortId(input.shortId);
  const actor = getMember(input.actorId);
  if (actor.id !== req.officerId) throw new ForbiddenError('Only the officer holding the card can use it.');
  if (req.status !== 'card_issued') throw new ConflictError(`${req.shortId} has no active card (status: ${req.status.replace(/_/g, ' ')}).`);
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new BadRequestError('Amount must be positive.');
  const card = cardForRequest(req.id);
  if (!card) throw new NotFoundError('No card');
  const event = await getIssuer().simulatePurchase({
    externalCardId: card.externalCardId,
    amountCents: input.amountCents,
    merchantName: input.merchantName.trim() || 'Merchant',
    merchantCategory: input.merchantCategory,
  });
  return { event, result: await handleIssuerEvent(event) };
}
