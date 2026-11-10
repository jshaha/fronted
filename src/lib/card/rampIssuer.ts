/**
 * Ramp card issuer (sandbox by default). createCard issues a real Ramp virtual
 * card through the Vault API: a spend limit for the approved amount plus the
 * buffer, the line's merchant categories, and a lock date. Ramp returns the full
 * card number; only the last 4 digits are kept, the rest is dropped at once.
 *
 * Purchases are still simulated (the sandbox has no API to swipe a card), but a
 * simulated swipe is authorized against a local mirror of the Ramp card's
 * restrictions, through the same handler as the mock issuer.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { mockIssuerCards } from '../db/schema';
import { nowIso } from '../clock';
import type { CreateCardInput, IssuedCard } from './issuer';
import { MockCardIssuer } from './mockIssuer';

const HOSTS = {
  sandbox: { api: 'https://demo-api.ramp.com', vault: 'https://demo-vault-api.ramp.com' },
  production: { api: 'https://api.ramp.com', vault: 'https://vault-api.ramp.com' },
} as const;

const SCOPES = 'limits:write cards:read_vault cards:read funds:write users:read';

/** Our merchant categories → Ramp category codes (1–44). */
export const RAMP_CATEGORY: Record<string, number> = {
  restaurants: 19,
  fast_food: 19,
  caterers: 19,
  grocery: 17,
  electronics: 14,
  hardware_stores: 13,
  online_marketplaces: 13,
  print_shops: 27,
  liquor_stores: 20,
  bars: 20,
};

export function rampCategories(ours: string[]): number[] {
  return [...new Set(ours.map((c) => RAMP_CATEGORY[c]).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
}

export class RampError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class RampCardIssuer extends MockCardIssuer {
  override readonly name = 'ramp' as const;
  private token: { value: string; expiresAt: number } | null = null;
  private cardholder: string | null = null;

  private get hosts() {
    return HOSTS[process.env.RAMP_ENV === 'production' ? 'production' : 'sandbox'];
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const id = process.env.RAMP_CLIENT_ID;
    const secret = process.env.RAMP_CLIENT_SECRET;
    if (!id || !secret) throw new Error('ISSUER=ramp needs RAMP_CLIENT_ID and RAMP_CLIENT_SECRET');
    const res = await fetch(`${this.hosts.api}/developer/v1/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) throw new RampError(`Ramp token request failed (HTTP ${res.status})`, res.status);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async call<T>(host: 'api' | 'vault', method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.hosts[host]}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200);
      try {
        msg = (JSON.parse(text) as { error_v2?: { message?: string } }).error_v2?.message ?? msg;
      } catch {}
      throw new RampError(`Ramp ${method} ${path} failed (HTTP ${res.status}): ${msg}`, res.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** RAMP_CARDHOLDER_USER_ID, else the first business user in the account. */
  private async cardholderId(): Promise<string> {
    if (process.env.RAMP_CARDHOLDER_USER_ID) return process.env.RAMP_CARDHOLDER_USER_ID;
    if (this.cardholder) return this.cardholder;
    const users = await this.call<{ data: { id: string; role: string }[] }>('api', 'GET', '/developer/v1/users?page_size=50');
    const u = users.data.find((x) => x.role === 'BUSINESS_USER') ?? users.data[0];
    if (!u) throw new Error('Ramp account has no users to hold the card');
    this.cardholder = u.id;
    return u.id;
  }

  override async createCard(input: CreateCardInput): Promise<IssuedCard> {
    const created = await this.call<{ spend_limit_id: string; card: { id: string; pan?: string; cvv?: string } }>('vault', 'POST', '/developer/v1/vault/cards', {
      user_id: await this.cardholderId(),
      display_name: `Fronted ${input.requestShortId} · ${input.holderName}`,
      spending_restrictions: {
        interval: 'TOTAL',
        limit: { amount: input.limitCents, currency_code: 'USD' },
        allowed_categories: rampCategories(input.allowedCategories),
        lock_date: input.expiresAt,
      },
    });
    // Keep the last 4 digits only; the full number and CVV never leave this function.
    const last4 = (created.card.pan ?? '').slice(-4) || '????';
    const row = {
      externalCardId: created.card.id,
      last4,
      holderName: input.holderName,
      limitCents: input.limitCents,
      spentCents: 0,
      allowedCategories: JSON.stringify(input.allowedCategories),
      expiresAt: input.expiresAt,
      status: 'active' as const,
      metadataJson: JSON.stringify({ request: input.requestShortId, issuer: 'ramp', fundId: created.spend_limit_id, rampCategories: rampCategories(input.allowedCategories) }),
      createdAt: nowIso(),
    };
    getDb().insert(mockIssuerCards).values(row).run();
    return this.getCard(row.externalCardId);
  }

  /** Terminates the card's backing fund in Ramp (needs funds:write), then the local mirror. */
  override async terminateCard(externalCardId: string): Promise<IssuedCard> {
    const r = getDb().select().from(mockIssuerCards).where(eq(mockIssuerCards.externalCardId, externalCardId)).get();
    const fundId = r ? (JSON.parse(r.metadataJson) as { fundId?: string }).fundId : undefined;
    if (fundId) await this.call('api', 'DELETE', `/developer/v1/funds/${fundId}`);
    return super.terminateCard(externalCardId);
  }
}
