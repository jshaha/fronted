import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ people */

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  asucAccount: text('asuc_account').notNull(),
  semester: text('semester').notNull(),
});

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  studentId: text('student_id').notNull(),
  role: text('role', { enum: ['officer', 'treasurer'] }).notNull(),
  title: text('title').notNull(),
});

/* ------------------------------------------------------------------ budget */

export const budgetLines = sqliteTable('budget_lines', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  allocatedCents: integer('allocated_cents').notNull(),
  perHeadCapCents: integer('per_head_cap_cents'),
  maxPerPurchaseCents: integer('max_per_purchase_cents'),
  /** JSON string[] of request fields required for this line (e.g. ["event","attendee_count"]). */
  requiredFields: text('required_fields').notNull().default('[]'),
  /** JSON string[] of merchant categories the card may be used at. */
  allowedCategories: text('allowed_categories').notNull().default('[]'),
  sourceRow: integer('source_row').notNull(),
  notes: text('notes'),
});

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lineId: text('line_id').notNull().references(() => budgetLines.id),
    requestId: integer('request_id'),
    kind: text('kind', { enum: ['commit', 'release', 'card_settled', 'filed', 'adjust'] }).notNull(),
    /** Positive for every kind except adjust, which is signed. */
    amountCents: integer('amount_cents').notNull(),
    fundingSource: text('funding_source', { enum: ['program_card', 'out_of_pocket'] }).notNull(),
    memo: text('memo'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('ledger_line_idx').on(t.lineId)],
);

/* --------------------------------------------------------- rules/knowledge */

export const schoolRules = sqliteTable('school_rules', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** Quoted word for word from the (mock) ASUC finance policy. */
  quote: text('quote').notNull(),
  source: text('source').notNull(),
});

export const orgHardRules = sqliteTable('org_hard_rules', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  kind: text('kind', { enum: ['remaining', 'per_head_cap', 'max_per_purchase', 'required_fields'] }).notNull(),
  description: text('description').notNull(),
  source: text('source').notNull(),
});

export const orgCriteria = sqliteTable('org_criteria', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  text: text('text').notNull(),
  /** Null = applies to every line. */
  lineId: text('line_id'),
  /** Null = applies to every purpose tag on the line. */
  purposeTag: text('purpose_tag'),
  /** Optional numeric parameter code uses (e.g. per-head target). */
  paramCents: integer('param_cents'),
  paramKind: text('param_kind', { enum: ['per_head_target', 'reserve_floor', 'threshold'] }),
  source: text('source').notNull(),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
  createdFromRequestId: integer('created_from_request_id'),
});

export const precedents = sqliteTable('precedents', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  lineId: text('line_id').notNull(),
  purposeTag: text('purpose_tag').notNull(),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  attendeeCount: integer('attendee_count'),
  outcome: text('outcome', { enum: ['approved', 'approved_reduced', 'denied'] }).notNull(),
  approvedCents: integer('approved_cents'),
  treasurerNote: text('treasurer_note'),
  decidedAt: text('decided_at').notNull(),
  semester: text('semester').notNull(),
  createdFromRequestId: integer('created_from_request_id'),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['gm', 'workshop', 'social', 'tabling', 'other'] }).notNull(),
  date: text('date').notNull(),
  rsvpCount: integer('rsvp_count').notNull(),
  isRecruiting: integer('is_recruiting', { mode: 'boolean' }).notNull().default(false),
});

/* ---------------------------------------------------------------- requests */

export const requests = sqliteTable(
  'requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    shortId: text('short_id').notNull(),
    orgId: text('org_id').notNull(),
    officerId: text('officer_id').notNull(),
    status: text('status').notNull(),
    fundingSource: text('funding_source', { enum: ['program_card', 'out_of_pocket'] }).notNull(),
    message: text('message').notNull(),
    messageSlug: text('message_slug').notNull(),
    amountCents: integer('amount_cents'),
    approvedAmountCents: integer('approved_amount_cents'),
    lineId: text('line_id'),
    eventId: text('event_id'),
    attendeeCount: integer('attendee_count'),
    purpose: text('purpose'),
    purposeTag: text('purpose_tag'),
    vendorHint: text('vendor_hint'),
    projectName: text('project_name'),
    extractionJson: text('extraction_json'),
    statusReason: text('status_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('requests_short_id_uq').on(t.shortId)],
);

export const ruleResults = sqliteTable('rule_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').notNull(),
  tier: text('tier', { enum: ['A', 'B'] }).notNull(),
  ruleId: text('rule_id').notNull(),
  outcome: text('outcome', { enum: ['pass', 'fail', 'needs_info'] }).notNull(),
  message: text('message').notNull(),
  suggestion: text('suggestion'),
  citation: text('citation'),
  createdAt: text('created_at').notNull(),
});

export const recommendations = sqliteTable('recommendations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').notNull(),
  verdict: text('verdict', { enum: ['support', 'caution', 'against', 'unavailable'] }).notNull(),
  /** JSON RenderedReason[] — reasons that survived the citation check. */
  reasonsJson: text('reasons_json').notNull(),
  /** JSON DroppedReason[] — reasons code removed, with why. */
  droppedJson: text('dropped_json').notNull().default('[]'),
  /** JSON BudgetStat[] the advice was allowed to cite. */
  statsJson: text('stats_json').notNull().default('[]'),
  suggestedAmountCents: integer('suggested_amount_cents'),
  model: text('model'),
  createdAt: text('created_at').notNull(),
});

export const approvals = sqliteTable('approvals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id').notNull(),
  memberId: text('member_id').notNull(),
  decision: text('decision', { enum: ['approve', 'deny'] }).notNull(),
  amountCents: integer('amount_cents'),
  note: text('note'),
  precedentId: text('precedent_id'),
  criterionId: text('criterion_id'),
  createdAt: text('created_at').notNull(),
});

/* -------------------------------------------------------------------- card */

export const cards = sqliteTable(
  'cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id').notNull(),
    issuer: text('issuer').notNull(),
    externalCardId: text('external_card_id').notNull(),
    last4: text('last4').notNull(),
    limitCents: integer('limit_cents').notNull(),
    allowedCategories: text('allowed_categories').notNull(),
    expiresAt: text('expires_at').notNull(),
    status: text('status', { enum: ['active', 'terminated', 'expired'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('cards_external_uq').on(t.externalCardId)],
);

export const cardTransactions = sqliteTable(
  'card_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id').notNull(),
    requestId: integer('request_id').notNull(),
    externalTransactionId: text('external_transaction_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    merchantName: text('merchant_name').notNull(),
    merchantCategory: text('merchant_category').notNull(),
    settledAt: text('settled_at').notNull(),
    resolution: text('resolution'),
  },
  (t) => [uniqueIndex('card_txn_external_uq').on(t.externalTransactionId)],
);

/* ------------------------------------------------------------------ filing */

export const receipts = sqliteTable(
  'receipts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id').notNull(),
    sha256: text('sha256').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    extractionJson: text('extraction_json'),
    totalCents: integer('total_cents'),
    /** JSON ReceiptFlag[] */
    flagsJson: text('flags_json').notNull().default('[]'),
    outcome: text('outcome', { enum: ['ok', 'flagged', 'alcohol', 'unreadable'] }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('receipts_sha_uq').on(t.sha256)],
);

export const portalFilings = sqliteTable(
  'portal_filings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id').notNull(),
    formType: text('form_type', { enum: ['expense_report', 'reimbursement'] }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadJson: text('payload_json').notNull(),
    planJson: text('plan_json'),
    confirmationId: text('confirmation_id'),
    status: text('status', { enum: ['queued', 'running', 'filed', 'failed', 'needs_human'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('portal_filings_idem_uq').on(t.idempotencyKey)],
);

/* --------------------------------------------------------------- logging */

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id'),
    traceId: text('trace_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    site: text('site'),
    model: text('model'),
    mode: text('mode'),
    latencyMs: integer('latency_ms'),
    dataJson: text('data_json'),
    screenshot: text('screenshot'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('audit_request_idx').on(t.requestId)],
);

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pane: text('pane', { enum: ['officer', 'treasurer'] }).notNull(),
  author: text('author', { enum: ['member', 'agent'] }).notNull(),
  memberId: text('member_id'),
  requestId: integer('request_id'),
  body: text('body').notNull(),
  /** Optional structured attachment: {type: 'card'|'approval'|'echo'|'receipt'|'filing'|'image', ...} */
  attachmentJson: text('attachment_json'),
  createdAt: text('created_at').notNull(),
});

/* ------------------------------------------------- mock external systems */

export const mockIssuerCards = sqliteTable('mock_issuer_cards', {
  externalCardId: text('external_card_id').primaryKey(),
  last4: text('last4').notNull(),
  holderName: text('holder_name').notNull(),
  limitCents: integer('limit_cents').notNull(),
  spentCents: integer('spent_cents').notNull().default(0),
  allowedCategories: text('allowed_categories').notNull(),
  expiresAt: text('expires_at').notNull(),
  status: text('status', { enum: ['active', 'terminated'] }).notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
});

export const mockPortalSubmissions = sqliteTable(
  'mock_portal_submissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    confirmationId: text('confirmation_id').notNull(),
    externalRef: text('external_ref').notNull(),
    formVersion: text('form_version').notNull(),
    fieldsJson: text('fields_json').notNull(),
    receiptFile: text('receipt_file'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('mock_portal_ext_ref_uq').on(t.externalRef)],
);
