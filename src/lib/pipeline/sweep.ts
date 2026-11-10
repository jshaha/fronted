/** App-enforced expiry: approvals after 24h, cards after their expiry. */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { config } from '../config';
import { now } from '../clock';
import { postMessage } from '../chat';
import { applyEvent, newTraceId } from './core';

export async function sweepExpired(): Promise<number> {
  const db = getDb();
  const t = now().getTime();
  let n = 0;
  const open = db.select().from(s.requests).where(inArray(s.requests.status, ['awaiting_approval', 'card_issued'])).all();
  for (const r of open) {
    if (r.status === 'awaiting_approval') {
      if (t - new Date(r.updatedAt).getTime() > config.approvalTtlHours * 3_600_000) {
        await applyEvent(r.id, { type: 'EXPIRE' }, { traceId: newTraceId() });
        postMessage({ pane: 'officer', author: 'agent', requestId: r.id, body: `${r.shortId} expired after ${config.approvalTtlHours}h without a decision. Ask again if you still need it.` });
        n++;
      }
    } else {
      const card = db.select().from(s.cards).where(eq(s.cards.requestId, r.id)).get();
      if (card && card.status === 'active' && new Date(card.expiresAt).getTime() < t) {
        await applyEvent(r.id, { type: 'EXPIRE' }, { traceId: newTraceId() });
        postMessage({ pane: 'officer', author: 'agent', requestId: r.id, body: `The card for ${r.shortId} expired unused and was closed. The committed budget is released.` });
        n++;
      }
    }
  }
  return n;
}
