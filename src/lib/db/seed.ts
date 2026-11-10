import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getDb, getSqlite } from './client';
import * as s from './schema';
import { parseMoneyToCents } from '../money';
import { addDays, nextWeekday, todayYmd, WEEKDAYS } from '../dates';
import { nowIso } from '../clock';
import { PURPOSE_TAGS } from '../types';

const SEED_DIR = path.join(process.cwd(), 'data', 'seed');

const read = (f: string) => fs.readFileSync(path.join(SEED_DIR, f), 'utf8');
const readJson = (f: string) => JSON.parse(read(f)) as unknown;

/* ------------------------------------------------------------ CSV import */

/** Minimal RFC-4180 CSV parser (quotes, commas inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

const moneyCell = z
  .string()
  .transform((v, ctx) => {
    if (v.trim() === '') return null;
    const c = parseMoneyToCents(v);
    if (c === null) {
      ctx.addIssue({ code: 'custom', message: `not money: ${v}` });
      return z.NEVER;
    }
    return c;
  });
const listCell = z.string().transform((v) => (v.trim() === '' ? [] : v.split(';').map((x) => x.trim())));

export const BudgetRowSchema = z.object({
  line_id: z.string().regex(/^L-[A-Z]+$/),
  name: z.string().min(1),
  allocated: moneyCell.refine((v) => v !== null && v > 0, 'allocated required'),
  per_head_cap: moneyCell,
  max_per_purchase: moneyCell,
  required_fields: listCell.pipe(z.array(z.enum(['event', 'attendee_count', 'project_name']))),
  allowed_categories: listCell,
  notes: z.string(),
});

export function parseBudgetCsv(text: string) {
  const [header, ...rows] = parseCsv(text);
  return rows.map((cells, i) => {
    const obj = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
    const parsed = BudgetRowSchema.parse(obj);
    return { ...parsed, sourceRow: i + 2 }; // header is sheet row 1
  });
}

/* ------------------------------------------------------------ JSON seeds */

const OrgSeed = z.object({
  org: z.object({ id: z.string(), name: z.string(), asucAccount: z.string().regex(/^ASUC-ORG-\d{4}$/), semester: z.string() }),
  members: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.string().email(), studentId: z.string().regex(/^\d{8,10}$/), role: z.enum(['officer', 'treasurer']), title: z.string() }),
  ),
});
const SchoolRuleSeed = z.array(z.object({ id: z.string(), title: z.string(), quote: z.string(), source: z.string() }));
const HardRuleSeed = z.array(
  z.object({ id: z.string(), kind: z.enum(['remaining', 'per_head_cap', 'max_per_purchase', 'required_fields']), description: z.string(), source: z.string() }),
);
const CriteriaSeed = z.array(
  z.object({
    id: z.string().regex(/^C-\d{2}$/),
    text: z.string(),
    lineId: z.string().nullable(),
    purposeTag: z.enum(PURPOSE_TAGS).nullable(),
    paramCents: z.number().int().nullable(),
    paramKind: z.enum(['per_head_target', 'reserve_floor', 'threshold']).nullable(),
    source: z.string(),
    lastConfirmedAt: z.string(),
  }),
);
const PrecedentSeed = z.array(
  z.object({
    id: z.string().regex(/^P-\d{2}$/),
    lineId: z.string(),
    purposeTag: z.enum(PURPOSE_TAGS),
    description: z.string(),
    amountCents: z.number().int().positive(),
    attendeeCount: z.number().int().positive().nullable(),
    outcome: z.enum(['approved', 'approved_reduced', 'denied']),
    approvedCents: z.number().int().positive().nullable(),
    treasurerNote: z.string().nullable(),
    decidedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    semester: z.string(),
  }),
);
const EventSeed = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['gm', 'workshop', 'social', 'tabling', 'other']),
    weekday: z.enum(WEEKDAYS),
    weekOffset: z.number().int(),
    dayShift: z.number().int(),
    rsvpCount: z.number().int().nonnegative(),
    isRecruiting: z.boolean(),
  }),
);

const ALL_TABLES = [
  'chat_messages',
  'audit_log',
  'portal_filings',
  'receipts',
  'card_transactions',
  'cards',
  'approvals',
  'recommendations',
  'rule_results',
  'requests',
  'ledger_entries',
  'precedents',
  'org_criteria',
  'org_hard_rules',
  'school_rules',
  'events',
  'budget_lines',
  'members',
  'orgs',
  'mock_issuer_cards',
  'mock_portal_submissions',
];

/** Delete every row (keeps the schema), then load the seed. Safe while the app is running. */
export function resetAndSeed(): { lines: number; precedents: number; criteria: number; events: number } {
  const sqlite = getSqlite();
  const wipe = sqlite.transaction(() => {
    sqlite.pragma('foreign_keys = OFF');
    for (const t of ALL_TABLES) sqlite.prepare(`DELETE FROM ${t}`).run();
    sqlite.prepare(`DELETE FROM sqlite_sequence`).run();
  });
  wipe();
  sqlite.pragma('foreign_keys = ON');
  return seed();
}

export function seed() {
  const db = getDb();
  const orgSeed = OrgSeed.parse(readJson('org.json'));
  const lines = parseBudgetCsv(read('budget.csv'));
  const schoolRules = SchoolRuleSeed.parse(readJson('school_rules.json'));
  const hardRules = HardRuleSeed.parse(readJson('org_hard_rules.json'));
  const criteria = CriteriaSeed.parse(readJson('criteria.json'));
  const precedents = PrecedentSeed.parse(readJson('precedents.json'));
  const events = EventSeed.parse(readJson('events.json'));
  const orgId = orgSeed.org.id;
  const createdAt = nowIso();

  db.transaction((tx) => {
    tx.insert(s.orgs).values(orgSeed.org).run();
    tx.insert(s.members).values(orgSeed.members.map((m) => ({ ...m, orgId }))).run();
    tx.insert(s.budgetLines)
      .values(
        lines.map((l) => ({
          id: l.line_id,
          orgId,
          name: l.name,
          allocatedCents: l.allocated!,
          perHeadCapCents: l.per_head_cap,
          maxPerPurchaseCents: l.max_per_purchase,
          requiredFields: JSON.stringify(l.required_fields),
          allowedCategories: JSON.stringify(l.allowed_categories),
          sourceRow: l.sourceRow,
          notes: l.notes || null,
        })),
      )
      .run();
    tx.insert(s.schoolRules).values(schoolRules).run();
    tx.insert(s.orgHardRules).values(hardRules.map((r) => ({ ...r, orgId }))).run();
    tx.insert(s.orgCriteria).values(criteria.map((c) => ({ ...c, orgId }))).run();
    tx.insert(s.precedents).values(precedents.map((p) => ({ ...p, orgId }))).run();

    // Current-semester approved precedents are past spending: settled on the card and filed.
    for (const p of precedents) {
      if (p.semester !== orgSeed.org.semester || p.outcome === 'denied' || !p.approvedCents) continue;
      const at = `${p.decidedAt}T20:00:00.000Z`;
      const memo = `${p.id} ${p.description}`;
      tx.insert(s.ledgerEntries)
        .values([
          { lineId: p.lineId, kind: 'card_settled', amountCents: p.approvedCents, fundingSource: 'program_card', memo, createdAt: at },
          { lineId: p.lineId, kind: 'filed', amountCents: p.approvedCents, fundingSource: 'program_card', memo, createdAt: at },
        ])
        .run();
    }

    // Upcoming events, relative to today so "Thursday's GM" always resolves.
    const today = todayYmd();
    tx.insert(s.events)
      .values(
        events.map((e) => ({
          id: e.id,
          orgId,
          name: e.name,
          type: e.type,
          date: addDays(nextWeekday(today, e.weekday), e.weekOffset * 7 + e.dayShift),
          rsvpCount: e.rsvpCount,
          isRecruiting: e.isRecruiting,
        })),
      )
      .run();
  });

  void createdAt;
  return { lines: lines.length, precedents: precedents.length, criteria: criteria.length, events: events.length };
}
