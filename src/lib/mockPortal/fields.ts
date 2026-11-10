/**
 * The mock ASUC expense-report form (v1). Single source of truth for:
 *  - the /mock-portal UI (labels, names, sections, conditional visibility)
 *  - server-side validation (/api/mock-portal/submit)
 *  - the scripted fallback plan (label → FilingPayload field)
 *
 * Labels are the accessible names the browser agent targets. Changing a label
 * changes the snapshot fingerprint and therefore invalidates planner replays.
 */
import type { FilingPayloadField } from '../types';

export const PORTAL_FORM_VERSION = 'v1';

export const PAYMENT_METHOD_OPTIONS = {
  card: 'ASUC Program Card',
  personal: 'Personal Funds (Reimbursement)',
} as const;

export const BUDGET_LINE_OPTIONS = ['Food & Events', 'Project Hardware', 'Marketing'] as const;

export const SELECT_PLACEHOLDER = '-- Select --';

export type PortalFieldKind = 'text' | 'textarea' | 'select' | 'file' | 'checkbox';

export type PortalField = {
  /** HTML name attribute and the key in server-side errors. */
  name: string;
  /** Visible <label> text = accessible name. */
  label: string;
  kind: PortalFieldKind;
  section: PortalSectionId;
  /** Required always (true), never (false), or only when visible (conditional fields). */
  required: boolean;
  /** Only rendered when payment_method has this value. */
  showWhenPaymentMethod?: string;
  options?: readonly string[];
  help?: string;
  /** The payload field the fallback plan maps here (checkbox has none). */
  payloadField?: FilingPayloadField;
};

export type PortalSectionId = 'org' | 'payment' | 'payee' | 'expense' | 'purpose' | 'docs';

export const PORTAL_SECTIONS: { id: PortalSectionId; title: string }[] = [
  { id: 'org', title: 'Section 1: Organization Information' },
  { id: 'payment', title: 'Section 2: Payment Information' },
  { id: 'payee', title: 'Section 2a: Payee Information (Reimbursements Only)' },
  { id: 'expense', title: 'Section 3: Expense Details' },
  { id: 'purpose', title: 'Section 4: Business Purpose & Attendees' },
  { id: 'docs', title: 'Section 5: Documentation & Certification' },
];

export const PORTAL_FIELDS: PortalField[] = [
  { name: 'org_name', label: 'Organization Name', kind: 'text', section: 'org', required: true, payloadField: 'org_name' },
  { name: 'org_account', label: 'ASUC Account Number', kind: 'text', section: 'org', required: true, help: 'Format: ASUC-ORG-####', payloadField: 'org_account' },
  { name: 'submitter_name', label: 'Submitted By (Full Name)', kind: 'text', section: 'org', required: true, payloadField: 'submitter_name' },
  { name: 'submitter_email', label: 'Submitter Email', kind: 'text', section: 'org', required: true, payloadField: 'submitter_email' },
  { name: 'external_ref', label: 'External Reference', kind: 'text', section: 'org', required: false, help: 'Reference number from your own records, if any. Must be unique.', payloadField: 'external_ref' },

  {
    name: 'payment_method',
    label: 'Payment Method',
    kind: 'select',
    section: 'payment',
    required: true,
    options: [SELECT_PLACEHOLDER, PAYMENT_METHOD_OPTIONS.card, PAYMENT_METHOD_OPTIONS.personal],
    payloadField: 'payment_method',
  },
  { name: 'card_last4', label: 'Card Last 4 Digits', kind: 'text', section: 'payment', required: true, showWhenPaymentMethod: PAYMENT_METHOD_OPTIONS.card, payloadField: 'card_last4' },

  { name: 'payee_name', label: 'Payee Full Name', kind: 'text', section: 'payee', required: true, showWhenPaymentMethod: PAYMENT_METHOD_OPTIONS.personal, payloadField: 'payee_name' },
  { name: 'payee_email', label: 'Payee Email', kind: 'text', section: 'payee', required: true, showWhenPaymentMethod: PAYMENT_METHOD_OPTIONS.personal, payloadField: 'payee_email' },
  { name: 'payee_student_id', label: 'Payee Student ID (SID)', kind: 'text', section: 'payee', required: true, showWhenPaymentMethod: PAYMENT_METHOD_OPTIONS.personal, payloadField: 'payee_student_id' },

  { name: 'vendor', label: 'Vendor / Merchant', kind: 'text', section: 'expense', required: true, payloadField: 'vendor' },
  // Deliberate validation error: the label gives no format hint; the server only accepts MM/DD/YYYY.
  { name: 'transaction_date', label: 'Transaction Date', kind: 'text', section: 'expense', required: true, payloadField: 'transaction_date_us' },
  { name: 'amount', label: 'Amount (USD)', kind: 'text', section: 'expense', required: true, payloadField: 'amount' },
  {
    name: 'budget_line',
    label: 'Budget Line',
    kind: 'select',
    section: 'expense',
    required: true,
    options: [SELECT_PLACEHOLDER, ...BUDGET_LINE_OPTIONS],
    payloadField: 'budget_line',
  },

  { name: 'event_name', label: 'Event Name', kind: 'text', section: 'purpose', required: false, payloadField: 'event_name' },
  { name: 'attendee_count', label: 'Number of Attendees', kind: 'text', section: 'purpose', required: false, help: 'Required for Food & Events.', payloadField: 'attendee_count' },
  { name: 'attendees', label: 'Attendees / Participants', kind: 'textarea', section: 'purpose', required: true, payloadField: 'attendees_description' },
  { name: 'business_purpose', label: 'Business Purpose', kind: 'textarea', section: 'purpose', required: true, help: 'Explain how this expense benefits your organization (min. 20 characters).', payloadField: 'business_purpose' },

  { name: 'receipt', label: 'Itemized Receipt', kind: 'file', section: 'docs', required: true, help: 'PNG or JPEG, max 5 MB.', payloadField: 'receipt_file' },
  { name: 'certify', label: 'I certify that this expense complies with the ASUC Finance Policy', kind: 'checkbox', section: 'docs', required: true },
];

export const SUBMIT_BUTTON_LABEL = 'Submit Expense Report';
export const SAVE_DRAFT_BUTTON_LABEL = 'Save Draft';

/** Exact server-side error strings (the planner sees these in the snapshot). */
export const PORTAL_ERRORS = {
  required: (label: string) => `${label} is required.`,
  dateFormat: 'Transaction Date must be entered as MM/DD/YYYY.',
  amountFormat: 'Amount (USD) must be a number with two decimal places, e.g. 25.00.',
  accountFormat: 'ASUC Account Number must look like ASUC-ORG-1234.',
  emailFormat: (label: string) => `${label} must be a valid email address.`,
  last4Format: 'Card Last 4 Digits must be exactly 4 digits.',
  sidFormat: 'Payee Student ID (SID) must be 8 to 10 digits.',
  attendeesRequiredForFood: 'Number of Attendees is required for Food & Events expenses.',
  attendeeCountFormat: 'Number of Attendees must be a whole number.',
  purposeTooShort: 'Business Purpose must be at least 20 characters.',
  receiptType: 'Itemized Receipt must be a PNG or JPEG image.',
  certify: 'You must certify that this expense complies with the ASUC Finance Policy.',
  duplicate: (confirmationId: string) => `An expense report with this External Reference was already submitted (confirmation ${confirmationId}).`,
  summary: 'Your submission has errors. Please correct the highlighted fields and resubmit.',
} as const;

export function visibleFields(paymentMethod: string | undefined): PortalField[] {
  return PORTAL_FIELDS.filter((f) => !f.showWhenPaymentMethod || f.showWhenPaymentMethod === paymentMethod);
}
