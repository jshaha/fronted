/**
 * Hand-authored replay recordings for the demo (extractor, receipt, advisor).
 * Keys are computed with the SAME functions the runtime uses, so they can't drift:
 *   extractor → slug of the message; receipt → sha256 of the fixture image;
 *   advisor → message slug + fingerprint of the knowledge rows the Advisor sees.
 * Planner recordings are keyed by the live portal snapshot and live as plain
 * files under fixtures/replays/planner (see README "Replays").
 *
 *   npx tsx scripts/author-replays.ts         (re)write the files
 *   npx tsx scripts/author-replays.ts --check verify they exist and validate
 *
 * `npm run record` replaces these with real recordings when an API key is set.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openFreshDb, getDb } from '../src/lib/db/client';
import { resetAndSeed } from '../src/lib/db/seed';
import * as s from '../src/lib/db/schema';
import { extractorFixtureKey } from '../src/lib/claude/extractor';
import { receiptFixtureKey } from '../src/lib/claude/receipt';
import { recordingPath, slugify, type Recording } from '../src/lib/claude/client';
import { applicableCriteria, knowledgeFingerprint, relevantPrecedents } from '../src/lib/advisor/knowledge';
import { DEMO } from '../src/lib/demoScript';
import { config } from '../src/lib/config';
import {
  ADVISOR_SCHEMA_VERSION,
  AdvisorOutputSchema,
  EXTRACTOR_SCHEMA_VERSION,
  ExtractionSchema,
  RECEIPT_SCHEMA_VERSION,
  ReceiptExtractionSchema,
  type AdvisorOutput,
  PLANNER_SCHEMA_VERSION,
  PlanSchema,
  type PortalPlan,
  type Extraction,
  type ReceiptExtraction,
} from '../src/lib/types';

const MODEL = config.model('extractor');
const AUTHORED_AT = '2026-11-08T21:00:00.000Z';

/* ------------------------------------------------------------- extractor */

const extractions: { message: string; scenario: string; output: Extraction }[] = [
  {
    message: DEMO.rejectMarketing,
    scenario: 'Org-rule rejection: Marketing has $85.50 left (sheet row 4).',
    output: {
      intent: 'pre_approval',
      amount_text: '$120',
      purpose: 'stickers',
      purpose_tag: 'marketing_swag',
      budget_line: 'Marketing',
      event_phrase: 'Calapalooza tabling',
      event_type: 'tabling',
      attendee_count: null,
      items: ['stickers'],
      vendor_hint: null,
      project_name: null,
      missing: [],
    },
  },
  {
    message: DEMO.gmPizza,
    scenario: 'Headline request: passes hard rules, flagged from precedent.',
    output: {
      intent: 'pre_approval',
      amount_text: '$50',
      purpose: 'pizza',
      purpose_tag: 'gm_food',
      budget_line: 'Food & Events',
      event_phrase: "Thursday's GM",
      event_type: 'gm',
      attendee_count: null,
      items: ['pizza'],
      vendor_hint: null,
      project_name: null,
      missing: ['attendee_count'],
    },
  },
  {
    message: DEMO.nextGmPizza,
    scenario: 'Learning loop: same kind of request after the treasurer note.',
    output: {
      intent: 'pre_approval',
      amount_text: '$60',
      purpose: 'pizza',
      purpose_tag: 'gm_food',
      budget_line: 'Food & Events',
      event_phrase: "next Thursday's recruiting GM",
      event_type: 'gm',
      attendee_count: null,
      items: ['pizza'],
      vendor_hint: null,
      project_name: null,
      missing: ['attendee_count'],
    },
  },
  {
    message: DEMO.reimbursement,
    scenario: 'Reimbursement branch: officer already paid out of pocket.',
    output: {
      intent: 'reimbursement',
      amount_text: '$86.40',
      purpose: 'EEG electrode supplies',
      purpose_tag: 'hardware_eeg',
      budget_line: 'Project Hardware',
      event_phrase: null,
      event_type: null,
      attendee_count: null,
      items: ['EEG electrode supplies'],
      vendor_hint: null,
      project_name: 'EEG headset',
      missing: [],
    },
  },
  {
    message: DEMO.beerReimbursement,
    scenario: 'Reimbursement whose receipt includes beer → cancelled.',
    output: {
      intent: 'reimbursement',
      amount_text: '$59.52',
      purpose: 'pizza',
      purpose_tag: 'gm_food',
      budget_line: 'Food & Events',
      event_phrase: "Thursday's GM",
      event_type: 'gm',
      attendee_count: null,
      items: ['pizza'],
      vendor_hint: null,
      project_name: null,
      missing: ['attendee_count'],
    },
  },
];

/* --------------------------------------------------------------- receipts */

const pizzaItems = [
  { description: 'Large Cheese Pizza', quantity: 2, amount_text: '35.00', category: 'food' as const },
  { description: 'Garlic Knots (12)', quantity: 1, amount_text: '6.00', category: 'food' as const },
];
const receiptsOut: { file: string; scenario: string; output: ReceiptExtraction }[] = [
  {
    file: 'pizza-clean.png',
    scenario: 'Clean pizza receipt; matches the $48.73 card charge.',
    output: {
      merchant_name: 'Telegraph Slice Co.',
      merchant_address: '2511 Telegraph Ave, Berkeley, CA 94704',
      receipt_date: '2026-11-12',
      line_items: pizzaItems,
      subtotal_text: '41.00',
      tax_text: '4.20',
      tip_text: '3.53',
      total_text: '48.73',
      payment_last4: '4821',
      is_itemized: true,
      legibility: 'clear',
    },
  },
  {
    file: 'pizza-beer.png',
    scenario: 'Pizza + a six-pack: alcohol cancels the whole request.',
    output: {
      merchant_name: 'Telegraph Slice Co.',
      merchant_address: '2511 Telegraph Ave, Berkeley, CA 94704',
      receipt_date: '2026-11-12',
      line_items: [...pizzaItems, { description: 'Lagunitas IPA 6-Pack', quantity: 1, amount_text: '12.99', category: 'alcohol' }],
      subtotal_text: '53.99',
      tax_text: '5.53',
      tip_text: null,
      total_text: '59.52',
      payment_last4: '4821',
      is_itemized: true,
      legibility: 'clear',
    },
  },
  {
    file: 'hardware-reimbursement.png',
    scenario: 'Electrode supplies paid out of pocket.',
    output: {
      merchant_name: 'Ohm & Co. Electronics',
      merchant_address: '1820 University Ave, Berkeley, CA 94703',
      receipt_date: '2026-11-06',
      line_items: [
        { description: 'Gold Cup EEG Electrodes (10 pk)', quantity: 2, amount_text: '49.90', category: 'hardware' },
        { description: 'Ten20 Conductive Paste (3 × 4oz)', quantity: 1, amount_text: '18.50', category: 'hardware' },
        { description: 'Shielded Snap Lead Wires (5 pk)', quantity: 1, amount_text: '9.97', category: 'hardware' },
      ],
      subtotal_text: '78.37',
      tax_text: '8.03',
      tip_text: null,
      total_text: '86.40',
      payment_last4: '7733',
      is_itemized: true,
      legibility: 'clear',
    },
  },
];

/* ---------------------------------------------------------------- advisor */

const gmCaution: AdvisorOutput = {
  verdict: 'caution',
  headline: 'At [[S-per-head]] a head this runs well above recent GMs; [[S-suggested]] would match the usual rate.',
  reasons: [
    {
      text: 'At [[S-per-head]] per RSVP for [[S-attendees]] RSVPs, this is above the last [[S-recent-count]] GMs, which averaged [[S-recent-avg-per-head]] a head (P-14, P-19).',
      cites: [
        { type: 'budget_stat', id: 'S-per-head' },
        { type: 'budget_stat', id: 'S-recent-avg-per-head' },
        { type: 'past_spending', id: 'P-14' },
        { type: 'past_spending', id: 'P-19' },
      ],
    },
    {
      text: 'C-03 targets about [[S-target-per-head]] per RSVP for GM food; at that rate this order would be [[S-suggested]].',
      cites: [
        { type: 'rule', id: 'C-03' },
        { type: 'budget_stat', id: 'S-suggested' },
      ],
    },
    {
      text: 'C-02 says to order against RSVPs, not hoped-for walk-ins, and P-09 was denied for over-ordering a regular GM.',
      cites: [
        { type: 'rule', id: 'C-02' },
        { type: 'past_spending', id: 'P-09' },
      ],
    },
    {
      text: '[[S-events-left]] GMs are still on the calendar; approving leaves [[S-above-reserve-after]] above the C-04 reserve to cover them.',
      cites: [
        { type: 'budget_stat', id: 'S-events-left' },
        { type: 'budget_stat', id: 'S-above-reserve-after' },
        { type: 'rule', id: 'C-04' },
      ],
    },
  ],
  suggested_amount_stat: 'S-suggested',
};

const nextGmCautionBeforeNote: AdvisorOutput = {
  verdict: 'caution',
  headline: 'At [[S-per-head]] a head this is above what GMs usually cost; [[S-suggested]] would match the usual rate.',
  reasons: [
    {
      text: 'At [[S-per-head]] per RSVP for [[S-attendees]] RSVPs, this is above the last [[S-recent-count]] GMs, which averaged [[S-recent-avg-per-head]] a head (P-19, P-22).',
      cites: [
        { type: 'budget_stat', id: 'S-per-head' },
        { type: 'budget_stat', id: 'S-recent-avg-per-head' },
        { type: 'past_spending', id: 'P-19' },
        { type: 'past_spending', id: 'P-22' },
      ],
    },
    {
      text: 'C-03 targets about [[S-target-per-head]] per RSVP for GM food, which would put this order at [[S-suggested]].',
      cites: [
        { type: 'rule', id: 'C-03' },
        { type: 'budget_stat', id: 'S-suggested' },
      ],
    },
    {
      text: 'Nothing in the record treats recruiting GMs differently; C-02 says to order against RSVPs, not walk-ins.',
      cites: [{ type: 'rule', id: 'C-02' }],
    },
  ],
  suggested_amount_stat: 'S-suggested',
};

const nextGmSupportAfterNote: AdvisorOutput = {
  verdict: 'support',
  headline: 'This fits the exception the treasurer set for recruiting GMs on P-31.',
  reasons: [
    {
      text: 'On P-31 the treasurer approved the last recruiting GM above the usual rate and set a higher per-head ceiling for recruiting GMs, since walk-ins beat RSVPs. At [[S-per-head]] per RSVP, this request sits under that ceiling.',
      cites: [
        { type: 'past_spending', id: 'P-31' },
        { type: 'budget_stat', id: 'S-per-head' },
      ],
    },
    {
      text: 'That note is newer than C-02 and C-03, so it reads as an exception for recruiting GMs rather than a change for regular ones.',
      cites: [
        { type: 'past_spending', id: 'P-31' },
        { type: 'rule', id: 'C-02' },
        { type: 'rule', id: 'C-03' },
      ],
    },
    {
      text: 'Approving still leaves [[S-above-reserve-after]] above the C-04 reserve, with [[S-events-left]] GMs on the calendar.',
      cites: [
        { type: 'budget_stat', id: 'S-above-reserve-after' },
        { type: 'rule', id: 'C-04' },
        { type: 'budget_stat', id: 'S-events-left' },
      ],
    },
  ],
  suggested_amount_stat: null,
};

const hardwareSupport: AdvisorOutput = {
  verdict: 'support',
  headline: 'Routine consumables for the headset build, in line with past approvals.',
  reasons: [
    {
      text: 'Electrode supplies for the headset match P-18, which the treasurer approved as consumables for the same build.',
      cites: [{ type: 'past_spending', id: 'P-18' }],
    },
    {
      text: 'C-05 asks for consumables sized to one build cycle; one set of electrodes, paste and leads fits that.',
      cites: [{ type: 'rule', id: 'C-05' }],
    },
    {
      text: 'It is under the [[S-threshold-C-06]] mark in C-06, so no extra project-lead sign-off is needed, and Project Hardware keeps [[S-line-remaining-after]].',
      cites: [
        { type: 'rule', id: 'C-06' },
        { type: 'budget_stat', id: 'S-threshold-C-06' },
        { type: 'budget_stat', id: 'S-line-remaining-after' },
      ],
    },
  ],
  suggested_amount_stat: null,
};


/* ---------------------------------------------------------------- planner */
// Keyed by the portal snapshot fingerprint (structure + error text, not values) + payload shape.
// If the mock portal's labels or error strings change, these keys change: rerun the
// e2e/discover flow and re-key (missing ones land in fixtures/replays/_missing/planner).

const T = (role: 'textbox' | 'combobox' | 'checkbox' | 'button' | 'file', name: string) => ({ role, name });
const CERTIFY = 'I certify that this expense complies with the ASUC Finance Policy';
const commonHead = [
  { action: 'fill', target: T('textbox', 'Organization Name'), value_ref: 'org_name' },
  { action: 'fill', target: T('textbox', 'ASUC Account Number'), value_ref: 'org_account' },
  { action: 'fill', target: T('textbox', 'Submitted By (Full Name)'), value_ref: 'submitter_name' },
  { action: 'fill', target: T('textbox', 'Submitter Email'), value_ref: 'submitter_email' },
  { action: 'fill', target: T('textbox', 'External Reference'), value_ref: 'external_ref', why: 'unique reference so the portal can reject duplicates' },
  { action: 'select', target: T('combobox', 'Payment Method'), value_ref: 'payment_method' },
  { action: 'fill', target: T('textbox', 'Vendor / Merchant'), value_ref: 'vendor' },
  { action: 'fill', target: T('textbox', 'Transaction Date'), value_ref: 'transaction_date', why: 'no format shown; using the ISO date' },
  { action: 'fill', target: T('textbox', 'Amount (USD)'), value_ref: 'amount' },
  { action: 'select', target: T('combobox', 'Budget Line'), value_ref: 'budget_line' },
] as const;
const commonTail = [
  { action: 'fill', target: T('textbox', 'Attendees / Participants'), value_ref: 'attendees_description' },
  { action: 'fill', target: T('textbox', 'Business Purpose'), value_ref: 'business_purpose' },
  { action: 'upload', target: T('file', 'Itemized Receipt'), value_ref: 'receipt_file' },
  { action: 'check', target: T('checkbox', CERTIFY) },
  { action: 'click', target: T('button', 'Submit Expense Report'), why: 'submit' },
] as const;

export const PLANNER_RECORDINGS: { key: string; scenario: string; output: PortalPlan }[] = [
  {
    key: 'v1.card.be62c136',
    scenario: 'Blank form, card payload: fill everything visible and submit (uses the ISO date, which the portal rejects).',
    output: {
      steps: [
        ...commonHead,
        { action: 'fill', target: T('textbox', 'Event Name'), value_ref: 'event_name' },
        { action: 'fill', target: T('textbox', 'Number of Attendees'), value_ref: 'attendee_count' },
        ...commonTail,
      ] as PortalPlan['steps'],
      submits: true,
      notes: 'Selecting ASUC Program Card may reveal more fields; will handle on the next snapshot.',
    },
  },
  {
    key: 'v1.personal.be62c136',
    scenario: 'Blank form, reimbursement payload: fill everything visible and submit.',
    output: {
      steps: [...commonHead, ...commonTail] as PortalPlan['steps'],
      submits: true,
      notes: 'Personal funds may reveal payee fields; will handle on the next snapshot.',
    },
  },
  {
    key: 'v1.card.39ace193',
    scenario: 'Portal rejected round 1: card last 4 now visible and required; date must be MM/DD/YYYY. Fix only those.',
    output: {
      steps: [
        { action: 'fill', target: T('textbox', 'Card Last 4 Digits'), value_ref: 'card_last4', why: 'appeared after choosing the program card' },
        { action: 'fill', target: T('textbox', 'Transaction Date'), value_ref: 'transaction_date_us', why: 'portal wants MM/DD/YYYY' },
        { action: 'click', target: T('button', 'Submit Expense Report'), why: 'resubmit' },
      ],
      submits: true,
    },
  },
  {
    key: 'v1.personal.46b57263',
    scenario: 'Portal rejected round 1: payee section now visible; date must be MM/DD/YYYY. Fix only those.',
    output: {
      steps: [
        { action: 'fill', target: T('textbox', 'Payee Full Name'), value_ref: 'payee_name' },
        { action: 'fill', target: T('textbox', 'Payee Email'), value_ref: 'payee_email' },
        { action: 'fill', target: T('textbox', 'Payee Student ID (SID)'), value_ref: 'payee_student_id' },
        { action: 'fill', target: T('textbox', 'Transaction Date'), value_ref: 'transaction_date_us', why: 'portal wants MM/DD/YYYY' },
        { action: 'click', target: T('button', 'Submit Expense Report'), why: 'resubmit' },
      ],
      submits: true,
    },
  },
];

/* ------------------------------------------------------------------ write */

function write(rec: Recording, check: boolean, problems: string[]) {
  const file = recordingPath(rec.site, rec.fixtureKey, rec.schemaVersion);
  const rel = path.relative(process.cwd(), file);
  if (check) {
    if (!fs.existsSync(file)) problems.push(`missing ${rel}`);
    return;
  }
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8')) as Recording;
    if (existing.source === 'recorded') {
      console.log(`keep  ${rel} (real recording)`);
      return;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  console.log(`write ${rel}`);
}

function main() {
  const check = process.argv.includes('--check');
  const problems: string[] = [];
  const base = { model: MODEL, source: 'hand-authored' as const, recordedAt: AUTHORED_AT };

  for (const e of extractions) {
    ExtractionSchema.parse(e.output);
    write({ ...base, site: 'extractor', fixtureKey: extractorFixtureKey(e.message), schemaVersion: EXTRACTOR_SCHEMA_VERSION, latencyMs: 1180, scenario: e.scenario, output: e.output }, check, problems);
  }
  for (const r of receiptsOut) {
    ReceiptExtractionSchema.parse(r.output);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join('fixtures', 'receipts', r.file))).digest('hex');
    write({ ...base, site: 'receipt', fixtureKey: receiptFixtureKey(sha), schemaVersion: RECEIPT_SCHEMA_VERSION, latencyMs: 2350, scenario: `${r.file}: ${r.scenario}`, output: r.output }, check, problems);
  }

  // Advisor keys need the knowledge rows the Advisor will see: build them from the seed.
  openFreshDb(':memory:');
  resetAndSeed();
  const fp = (line: string, tag: string) => knowledgeFingerprint(applicableCriteria(line, tag), relevantPrecedents(line, tag));
  const foodBase = fp('L-FOOD', 'gm_food');
  const hwBase = fp('L-HW', 'hardware_eeg');
  // The learning-loop note, exactly as approveRequest() records it.
  getDb()
    .insert(s.precedents)
    .values({
      id: 'P-31',
      orgId: 'org-neurotech',
      lineId: 'L-FOOD',
      purposeTag: 'gm_food',
      description: 'R-12: pizza',
      amountCents: 5000,
      attendeeCount: 12,
      outcome: 'approved',
      approvedCents: 5000,
      treasurerNote: DEMO.gmPizzaNote,
      decidedAt: '2026-11-10',
      semester: 'FA26',
    })
    .run();
  const foodAfterNote = fp('L-FOOD', 'gm_food');

  const advice: { message: string; kb: string; scenario: string; output: AdvisorOutput }[] = [
    { message: DEMO.gmPizza, kb: foodBase, scenario: '$50 GM pizza: caution from precedent, suggest $36.', output: gmCaution },
    { message: DEMO.nextGmPizza, kb: foodBase, scenario: 'Next GM before any treasurer note: caution.', output: nextGmCautionBeforeNote },
    { message: DEMO.nextGmPizza, kb: foodAfterNote, scenario: 'Next GM after the P-31 note: support, cites P-31.', output: nextGmSupportAfterNote },
    { message: DEMO.reimbursement, kb: hwBase, scenario: 'Electrode reimbursement: support.', output: hardwareSupport },
  ];
  for (const a of advice) {
    AdvisorOutputSchema.parse(a.output);
    write({ ...base, site: 'advisor', fixtureKey: `${slugify(a.message)}.kb-${a.kb}`, schemaVersion: ADVISOR_SCHEMA_VERSION, latencyMs: 3120, scenario: a.scenario, output: a.output }, check, problems);
  }

  for (const p of PLANNER_RECORDINGS) {
    PlanSchema.parse(p.output);
    write({ ...base, site: 'planner', fixtureKey: p.key, schemaVersion: PLANNER_SCHEMA_VERSION, latencyMs: 2780, scenario: p.scenario, output: p.output }, check, problems);
  }

  if (check) {
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log('All authored replay recordings present.');
  }
}

main();
