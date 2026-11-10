/**
 * FilingPayload: every value the browser agent may type, built by code from
 * the database. The planner can only reference these fields by name.
 */
import { centsToPlain } from '../money';
import { ymdToUs } from '../dates';
import { PAYMENT_METHOD_OPTIONS } from '../mockPortal/fields';
import type { FilingPayload, FundingSource } from '../types';

export type PayloadSource = {
  shortId: string;
  fundingSource: FundingSource;
  org: { name: string; asucAccount: string };
  officer: { name: string; email: string; studentId: string };
  treasurerName: string;
  amountCents: number;
  vendor: string;
  transactionDate: string; // YYYY-MM-DD
  lineName: string;
  purpose: string;
  event: { name: string; date: string } | null;
  attendeeCount: number | null;
  projectName: string | null;
  cardLast4: string | null;
  receiptPath: string;
};

export function filingIdempotencyKey(shortId: string): string {
  return `FRONTED-${shortId}`;
}

export function buildFilingPayload(s: PayloadSource): FilingPayload {
  const card = s.fundingSource === 'program_card';
  const eventBit = s.event ? ` for ${s.event.name} on ${ymdToUs(s.event.date)}` : '';
  const headsBit = s.attendeeCount ? ` (${s.attendeeCount} attendees)` : '';
  const projectBit = s.projectName ? ` for the ${s.projectName} project` : '';
  const purposeText = s.purpose.charAt(0).toUpperCase() + s.purpose.slice(1);
  const business_purpose =
    `${purposeText}${projectBit}${eventBit}${headsBit}, ${s.org.name}. ` +
    `Approved by treasurer ${s.treasurerName} (${s.shortId}); ${card ? 'paid with the ASUC program card' : 'paid out of pocket by the officer'}.`;
  const attendees_description = s.attendeeCount
    ? `${s.attendeeCount} ${s.org.name} members (RSVP list on file)`
    : s.projectName
      ? `${s.org.name} ${s.projectName} project team`
      : `${s.org.name} members`;

  const p: FilingPayload = {
    external_ref: filingIdempotencyKey(s.shortId),
    org_name: s.org.name,
    org_account: s.org.asucAccount,
    submitter_name: s.officer.name,
    submitter_email: s.officer.email,
    payment_method: card ? PAYMENT_METHOD_OPTIONS.card : PAYMENT_METHOD_OPTIONS.personal,
    vendor: s.vendor,
    transaction_date: s.transactionDate,
    transaction_date_us: ymdToUs(s.transactionDate),
    amount: centsToPlain(s.amountCents),
    budget_line: s.lineName,
    attendees_description,
    business_purpose,
    receipt_file: s.receiptPath,
  };
  if (s.event) p.event_name = s.event.name;
  if (s.attendeeCount) p.attendee_count = String(s.attendeeCount);
  if (card && s.cardLast4) p.card_last4 = s.cardLast4;
  if (!card) {
    p.payee_name = s.officer.name;
    p.payee_email = s.officer.email;
    p.payee_student_id = s.officer.studentId;
  }
  return p;
}

/** Payload "shape": which fields are present. Part of the planner replay key. */
export function payloadShape(p: FilingPayload): string {
  return p.payment_method === PAYMENT_METHOD_OPTIONS.card ? 'card' : 'personal';
}
