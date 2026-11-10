import { z } from 'zod';

/* ----------------------------------------------------------------- states */

export const REQUEST_STATUSES = [
  'draft',
  'needs_info',
  'rejected',
  'awaiting_approval',
  'denied',
  'expired',
  'approved',
  'card_issued',
  'purchased',
  'receipt_received',
  'receipt_flagged',
  'filing_queued',
  'filed',
  'filing_failed',
  'needs_human',
  'closed',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type FundingSource = 'program_card' | 'out_of_pocket';

export const PURPOSE_TAGS = [
  'gm_food',
  'social_food',
  'workshop_food',
  'event_food',
  'hardware_eeg',
  'hardware_compute',
  'hardware_tools',
  'marketing_print',
  'marketing_swag',
  'other',
] as const;
export type PurposeTag = (typeof PURPOSE_TAGS)[number];

/* ------------------------------------------------- extractor (Claude) v1 */

export const EXTRACTOR_SCHEMA_VERSION = 1;

export const ExtractionSchema = z
  .object({
    intent: z.enum(['pre_approval', 'reimbursement', 'other']),
    /** The amount exactly as written in the message, e.g. "$50". Null if absent. Code parses it. */
    amount_text: z.string().nullable(),
    purpose: z.string().min(1),
    purpose_tag: z.enum(PURPOSE_TAGS),
    /** Must be one of the org's budget line names, or null. */
    budget_line: z.string().nullable(),
    /** The event phrase exactly as written, e.g. "Thursday's GM". */
    event_phrase: z.string().nullable(),
    event_type: z.enum(['gm', 'workshop', 'social', 'tabling', 'other']).nullable(),
    /** Only when the officer states a head count. Otherwise code uses RSVPs. */
    attendee_count: z.number().int().positive().nullable(),
    items: z.array(z.string()),
    vendor_hint: z.string().nullable(),
    project_name: z.string().nullable(),
    /** Fields the model could not find. */
    missing: z.array(z.string()),
  })
  .strict();
export type Extraction = z.infer<typeof ExtractionSchema>;

/* ------------------------------------------------- receipt (Claude) v1 */

export const RECEIPT_SCHEMA_VERSION = 1;

export const RECEIPT_ITEM_CATEGORIES = [
  'food',
  'beverage_nonalcoholic',
  'alcohol',
  'hardware',
  'office_supplies',
  'printing',
  'service_fee',
  'other',
] as const;

export const ReceiptExtractionSchema = z
  .object({
    merchant_name: z.string().min(1),
    merchant_address: z.string().nullable(),
    /** ISO date YYYY-MM-DD as printed (converted), or null. */
    receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    line_items: z.array(
      z
        .object({
          description: z.string().min(1),
          quantity: z.number().int().positive().nullable(),
          /** Line amount exactly as printed, e.g. "35.00". */
          amount_text: z.string().min(1),
          category: z.enum(RECEIPT_ITEM_CATEGORIES),
        })
        .strict(),
    ),
    subtotal_text: z.string().nullable(),
    tax_text: z.string().nullable(),
    tip_text: z.string().nullable(),
    total_text: z.string().min(1),
    payment_last4: z.string().regex(/^\d{4}$/).nullable(),
    is_itemized: z.boolean(),
    legibility: z.enum(['clear', 'partial', 'poor']),
  })
  .strict();
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

/* ------------------------------------------------- advisor (Claude) v1 */

export const ADVISOR_SCHEMA_VERSION = 1;

export const CitationSchema = z
  .object({
    type: z.enum(['rule', 'past_spending', 'budget_stat']),
    id: z.string().min(1),
  })
  .strict();
export type Citation = z.infer<typeof CitationSchema>;

export const AdvisorOutputSchema = z
  .object({
    verdict: z.enum(['support', 'caution', 'against', 'unavailable']),
    /** One sentence for the officer. May use [[S-…]] placeholders. */
    headline: z.string().min(1),
    reasons: z
      .array(
        z
          .object({
            /** Reason text. Numbers must be [[S-…]] placeholders; no raw $ amounts. */
            text: z.string().min(1),
            cites: z.array(CitationSchema),
          })
          .strict(),
      )
      .max(6),
    /** Optional: the budget_stat ID whose value is the suggested amount. */
    suggested_amount_stat: z.string().nullable(),
  })
  .strict();
export type AdvisorOutput = z.infer<typeof AdvisorOutputSchema>;

/** A number code computed and the Advisor may cite and word. */
export type BudgetStat = {
  id: string; // e.g. "S-per-head"
  label: string;
  /** Display string code rendered (e.g. "$4.17"). */
  display: string;
  value: number;
  unit: 'cents' | 'count';
  /** IDs this stat was computed from (precedent IDs, sheet row, criterion). */
  derivedFrom: string[];
};

export type RenderedCitation = Citation & { label: string; detail: string };
export type RenderedReason = { text: string; cites: RenderedCitation[] };
export type DroppedReason = { text: string; why: string };

/* ------------------------------------------------- portal planner v1 */

export const PLANNER_SCHEMA_VERSION = 1;

export const PLAN_ACTIONS = ['fill', 'select', 'check', 'upload', 'click'] as const;
export const PLAN_ROLES = ['textbox', 'combobox', 'checkbox', 'button', 'file'] as const;

export const FILING_PAYLOAD_FIELDS = [
  'external_ref',
  'org_name',
  'org_account',
  'submitter_name',
  'submitter_email',
  'payment_method',
  'card_last4',
  'payee_name',
  'payee_email',
  'payee_student_id',
  'vendor',
  'transaction_date',
  'transaction_date_us',
  'amount',
  'budget_line',
  'event_name',
  'attendee_count',
  'attendees_description',
  'business_purpose',
  'receipt_file',
] as const;
export type FilingPayloadField = (typeof FILING_PAYLOAD_FIELDS)[number];

/** Every value the browser agent may type. Plans reference these by name only. */
export type FilingPayload = Partial<Record<FilingPayloadField, string>> & {
  external_ref: string;
  payment_method: string;
  amount: string;
  receipt_file: string;
};

export const PlanStepSchema = z
  .object({
    action: z.enum(PLAN_ACTIONS),
    target: z
      .object({
        role: z.enum(PLAN_ROLES),
        name: z.string().min(1),
      })
      .strict(),
    value_ref: z.enum(FILING_PAYLOAD_FIELDS).optional(),
    /** Short human-readable reason, shown in the trace. Not executed. */
    why: z.string().max(200).optional(),
  })
  .strict();
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z
  .object({
    steps: z.array(PlanStepSchema).min(1).max(40),
    /** True when the plan ends by clicking the form's submit button. */
    submits: z.boolean(),
    notes: z.string().max(400).optional(),
  })
  .strict();
export type PortalPlan = z.infer<typeof PlanSchema>;

/** Trimmed form-control snapshot handed to the planner (<2k tokens). */
export type SnapshotControl = {
  role: (typeof PLAN_ROLES)[number];
  name: string;
  required: boolean;
  section?: string;
  options?: string[];
  value?: string;
  checked?: boolean;
  error?: string;
};
export type FormSnapshot = {
  url: string;
  title: string;
  formVersion: string;
  alerts: string[];
  controls: SnapshotControl[];
  confirmationId?: string;
};
