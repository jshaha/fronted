import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { NotFoundError } from '../errors';
import { nowIso } from '../clock';
import type { RequestStatus } from '../types';

export type RequestRow = typeof s.requests.$inferSelect;
export type MemberRow = typeof s.members.$inferSelect;

export function getOrg() {
  const org = getDb().select().from(s.orgs).get();
  if (!org) throw new NotFoundError('No org seeded. Run npm run reset.');
  return org;
}

export function getMember(id: string): MemberRow {
  const m = getDb().select().from(s.members).where(eq(s.members.id, id)).get();
  if (!m) throw new NotFoundError(`Unknown member ${id}`);
  return m;
}

export function getTreasurer(orgId: string): MemberRow {
  const m = getDb().select().from(s.members).where(and(eq(s.members.orgId, orgId), eq(s.members.role, 'treasurer'))).get();
  if (!m) throw new NotFoundError('Org has no treasurer');
  return m;
}

export function getRequest(id: number): RequestRow {
  const r = getDb().select().from(s.requests).where(eq(s.requests.id, id)).get();
  if (!r) throw new NotFoundError(`Unknown request ${id}`);
  return r;
}

export function getRequestByShortId(shortId: string): RequestRow {
  const norm = shortId.trim().toUpperCase().replace(/^R-?/, 'R-');
  const r = getDb().select().from(s.requests).where(eq(s.requests.shortId, norm)).get();
  if (!r) throw new NotFoundError(`No request ${shortId}`);
  return r;
}

/** Short IDs start at R-12 so the demo reads like an org mid-semester. */
export function nextShortId(): string {
  const row = getDb().select({ n: sql<number>`count(*)` }).from(s.requests).get();
  return `R-${12 + (row?.n ?? 0)}`;
}

export function updateRequest(id: number, patch: Partial<Omit<RequestRow, 'id'>>): RequestRow {
  getDb()
    .update(s.requests)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(s.requests.id, id))
    .run();
  return getRequest(id);
}

export function latestRequestForOfficer(officerId: string, statuses: RequestStatus[]): RequestRow | undefined {
  return getDb()
    .select()
    .from(s.requests)
    .where(and(eq(s.requests.officerId, officerId), inArray(s.requests.status, statuses)))
    .orderBy(desc(s.requests.id))
    .get();
}

export function cardForRequest(requestId: number) {
  return getDb().select().from(s.cards).where(eq(s.cards.requestId, requestId)).orderBy(desc(s.cards.id)).get();
}

export function txnForRequest(requestId: number) {
  return getDb().select().from(s.cardTransactions).where(eq(s.cardTransactions.requestId, requestId)).get();
}

export function receiptForRequest(requestId: number) {
  return getDb().select().from(s.receipts).where(eq(s.receipts.requestId, requestId)).orderBy(desc(s.receipts.id)).get();
}

export function lineById(id: string) {
  return getDb().select().from(s.budgetLines).where(eq(s.budgetLines.id, id)).get();
}

export function eventById(id: string) {
  return getDb().select().from(s.events).where(eq(s.events.id, id)).get();
}
