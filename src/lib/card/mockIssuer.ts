/**
 * Mock card issuer. Its state lives in mock_issuer_cards (the "external system").
 * simulatePurchase() authorizes like a real network would and returns the
 * normalized event; the caller feeds it to handleIssuerEvent — the same handler
 * POST /api/issuer/events uses.
 */
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { mockIssuerCards } from '../db/schema';
import { nowIso, now } from '../clock';
import type { CardIssuer, CreateCardInput, IssuedCard, IssuerEvent } from './issuer';

type Row = typeof mockIssuerCards.$inferSelect;

function toCard(r: Row): IssuedCard {
  return {
    externalCardId: r.externalCardId,
    last4: r.last4,
    limitCents: r.limitCents,
    spentCents: r.spentCents,
    allowedCategories: JSON.parse(r.allowedCategories) as string[],
    expiresAt: r.expiresAt,
    status: r.status,
  };
}

/** Deterministic-looking but unique last4 derived from the card id. */
function last4For(id: string): string {
  const n = Number.parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % 10000;
  return String(n).padStart(4, '0');
}

export class MockCardIssuer implements CardIssuer {
  readonly name = 'mock' as const;

  async createCard(input: CreateCardInput): Promise<IssuedCard> {
    const externalCardId = `mc_${crypto.randomBytes(8).toString('hex')}`;
    const row: Row = {
      externalCardId,
      last4: last4For(externalCardId),
      holderName: input.holderName,
      limitCents: input.limitCents,
      spentCents: 0,
      allowedCategories: JSON.stringify(input.allowedCategories),
      expiresAt: input.expiresAt,
      status: 'active',
      metadataJson: JSON.stringify({ request: input.requestShortId }),
      createdAt: nowIso(),
    };
    getDb().insert(mockIssuerCards).values(row).run();
    return toCard(row);
  }

  async getCard(externalCardId: string): Promise<IssuedCard> {
    const r = getDb().select().from(mockIssuerCards).where(eq(mockIssuerCards.externalCardId, externalCardId)).get();
    if (!r) throw new Error(`mock issuer: no card ${externalCardId}`);
    return toCard(r);
  }

  async terminateCard(externalCardId: string): Promise<IssuedCard> {
    getDb().update(mockIssuerCards).set({ status: 'terminated' }).where(eq(mockIssuerCards.externalCardId, externalCardId)).run();
    return this.getCard(externalCardId);
  }

  /** Authorize + settle in one step (demo). Returns the normalized event. */
  async simulatePurchase(input: { externalCardId: string; amountCents: number; merchantName: string; merchantCategory: string }): Promise<IssuerEvent> {
    const card = await this.getCard(input.externalCardId);
    const base = {
      event_id: `evt_${crypto.randomBytes(8).toString('hex')}`,
      external_card_id: card.externalCardId,
      amount_cents: input.amountCents,
      merchant_name: input.merchantName,
      merchant_category: input.merchantCategory,
    };
    const decline = (reason: 'card_inactive' | 'card_expired' | 'over_limit' | 'category_blocked'): IssuerEvent => ({ type: 'authorization.declined', ...base, reason });
    if (card.status !== 'active') return decline('card_inactive');
    if (new Date(card.expiresAt).getTime() < now().getTime()) return decline('card_expired');
    if (!card.allowedCategories.includes(input.merchantCategory)) return decline('category_blocked');
    if (card.spentCents + input.amountCents > card.limitCents) return decline('over_limit');

    getDb()
      .update(mockIssuerCards)
      .set({ spentCents: card.spentCents + input.amountCents })
      .where(eq(mockIssuerCards.externalCardId, card.externalCardId))
      .run();
    return {
      type: 'transaction.settled',
      ...base,
      external_transaction_id: `txn_${crypto.randomBytes(8).toString('hex')}`,
      settled_at: nowIso(),
    };
  }
}

let issuer: MockCardIssuer | null = null;
export function getIssuer(): MockCardIssuer {
  if (!issuer) issuer = new MockCardIssuer();
  return issuer;
}
