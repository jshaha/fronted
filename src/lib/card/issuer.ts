/**
 * CardIssuer interface. Field names are ours — modeled on a typical card-issuing
 * API, not claimed compatible with any vendor. Only the mock adapter exists.
 */
export type CreateCardInput = {
  requestShortId: string;
  holderName: string;
  limitCents: number;
  allowedCategories: string[];
  /** ISO instant; the app enforces it (issuers often can't set a custom expiry). */
  expiresAt: string;
};

export type IssuedCard = {
  externalCardId: string;
  last4: string;
  limitCents: number;
  spentCents: number;
  allowedCategories: string[];
  expiresAt: string;
  status: 'active' | 'terminated';
};

/** The normalized event every adapter must emit for a settled purchase. */
export type TransactionSettledEvent = {
  type: 'transaction.settled';
  event_id: string;
  external_card_id: string;
  external_transaction_id: string;
  amount_cents: number;
  merchant_name: string;
  merchant_category: string;
  settled_at: string;
};

export type AuthorizationDeclinedEvent = {
  type: 'authorization.declined';
  event_id: string;
  external_card_id: string;
  amount_cents: number;
  merchant_name: string;
  merchant_category: string;
  reason: 'card_inactive' | 'card_expired' | 'over_limit' | 'category_blocked';
};

export type IssuerEvent = TransactionSettledEvent | AuthorizationDeclinedEvent;

export interface CardIssuer {
  readonly name: 'mock';
  createCard(input: CreateCardInput): Promise<IssuedCard>;
  getCard(externalCardId: string): Promise<IssuedCard>;
  terminateCard(externalCardId: string): Promise<IssuedCard>;
}

export const MERCHANT_CATEGORIES = [
  'restaurants',
  'fast_food',
  'grocery',
  'caterers',
  'electronics',
  'hardware_stores',
  'online_marketplaces',
  'print_shops',
  'liquor_stores',
  'bars',
] as const;
