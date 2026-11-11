import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import { DEMO } from '../src/lib/demoScript';
import type { AppState, RequestView } from '../src/lib/view';

const TREASURER = 'm-jordan';
const OFFICER = 'm-maya';

async function state(request: APIRequestContext): Promise<AppState> {
  return (await (await request.get('/api/state')).json()) as AppState;
}
async function req(request: APIRequestContext, shortId: string): Promise<RequestView> {
  const r = (await state(request)).requests.find((x) => x.shortId === shortId);
  if (!r) throw new Error(`no ${shortId}`);
  return r;
}
async function waitStatus(request: APIRequestContext, shortId: string, statuses: string[], timeoutMs = 60_000): Promise<RequestView> {
  const start = Date.now();
  let last = '(missing)';
  while (Date.now() - start < timeoutMs) {
    const r = (await state(request)).requests.find((x) => x.shortId === shortId);
    if (r) {
      last = r.status;
      if (statuses.includes(r.status)) return r;
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error(`${shortId} stuck in ${last}, wanted ${statuses.join('|')}`);
}
async function officerSays(page: Page, text: string, receipt?: string) {
  if (receipt) await page.setInputFiles('#officer-file', `fixtures/receipts/${receipt}`);
  const input = page.getByLabel('Message to Fronted');
  await input.fill(text);
  await input.press('Enter');
}
const approval = (page: Page, shortId: string) => page.getByRole('article', { name: `Approval request ${shortId}` });
const officerPane = (page: Page) => page.getByRole('region', { name: /Maya Chen|Arjun Patel/ });

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('/api/dev/reset')).ok()).toBeTruthy();
  await page.goto('/simulator');
  await expect(page.getByLabel('Message to Fronted')).toBeEditable();
});

test('happy path: precedent-flagged advice → approve with note → card → purchase → receipt → filed → budget updates', async ({ page, request }) => {
  await officerSays(page, DEMO.gmPizza);
  await waitStatus(request, 'R-12', ['awaiting_approval']);

  const card = approval(page, 'R-12');
  await expect(card).toContainText('7 of 7 passed');
  await expect(card).toContainText('Caution');
  await expect(card).toContainText('$4.17');
  await expect(card).toContainText('$2.90');
  await expect(card.getByRole('button', { name: /P-\d+/ }).first()).toBeVisible();
  await expect(card.getByRole('button', { name: 'Approve suggested $36.00' })).toBeVisible();

  await card.getByLabel(/^Note/).fill(DEMO.gmPizzaNote);
  await card.getByRole('button', { name: 'Approve $50.00', exact: true }).click();
  const issued = await waitStatus(request, 'R-12', ['card_issued']);
  expect(issued.card?.limitCents).toBe(6000);
  expect(issued.approvals[0].precedentId).toBe('P-31');

  await page.getByLabel('Amount', { exact: true }).fill('48.73');
  await page.getByRole('button', { name: 'Charge the card' }).click();
  await waitStatus(request, 'R-12', ['purchased']);
  await page.getByRole('button', { name: 'Send Pizza receipt ($48.73)' }).click();

  const closed = await waitStatus(request, 'R-12', ['closed'], 120_000);
  expect(closed.filing?.confirmationId).toMatch(/^ASUC-EXP-26-\d{6}$/);
  await expect(page.getByText(closed.filing!.confirmationId!).first()).toBeVisible();

  const s = await state(request);
  const food = s.budget.lines.find((l) => l.id === 'L-FOOD')!;
  expect(food.remaining).toBe(36815 - 4873);
  expect(food.committed).toBe(0);
  expect(s.budget.unreconciled.totalCents).toBe(0);
  // The agent fixed the deliberate validation error (date format) before succeeding.
  expect(s.audit.some((a) => a.title.includes('MM/DD/YYYY'))).toBeTruthy();
});

test('learning loop: the treasurer note changes the next advice', async ({ page, request }) => {
  // Before any note: the same request gets caution.
  await officerSays(page, DEMO.nextGmPizza);
  const before = await waitStatus(request, 'R-12', ['awaiting_approval']);
  expect(before.recommendation?.verdict).toBe('caution');

  expect((await request.post('/api/dev/reset')).ok()).toBeTruthy();
  await page.reload();
  await officerSays(page, DEMO.gmPizza);
  await waitStatus(request, 'R-12', ['awaiting_approval']);
  const card = approval(page, 'R-12');
  await card.getByRole('button', { name: 'Use demo note' }).click();
  await card.getByRole('button', { name: 'Approve $50.00', exact: true }).click();
  await waitStatus(request, 'R-12', ['card_issued']);

  await officerSays(page, DEMO.nextGmPizza);
  const after = await waitStatus(request, 'R-13', ['awaiting_approval']);
  expect(after.recommendation?.verdict).toBe('support');
  expect(after.recommendation?.reasons.some((r) => r.cites.some((c) => c.id === 'P-31'))).toBeTruthy();
  await expect(approval(page, 'R-13')).toContainText('Supports');
  await expect(approval(page, 'R-13').getByRole('button', { name: /P-31/ }).first()).toBeVisible();
});

test('org-rule rejection cites the sheet row with a fix; the Advisor never runs', async ({ page, request }) => {
  await officerSays(page, DEMO.rejectMarketing);
  const r = await waitStatus(request, 'R-12', ['rejected']);
  expect(r.recommendation).toBeNull();
  const pane = officerPane(page);
  await expect(pane).toContainText('H-REM');
  await expect(pane).toContainText('sheet row 4');
  await expect(pane).toContainText('$85.50');
});

test('beer on the card cancels the whole request; the charge stays unreconciled until repaid', async ({ page, request }) => {
  await officerSays(page, DEMO.gmPizza);
  await waitStatus(request, 'R-12', ['awaiting_approval']);
  expect((await request.post('/api/requests/R-12/approve', { data: { actorId: TREASURER } })).ok()).toBeTruthy();
  await waitStatus(request, 'R-12', ['card_issued']);
  await page.getByLabel('Amount', { exact: true }).fill('59.52');
  await page.getByRole('button', { name: 'Charge the card' }).click();
  await waitStatus(request, 'R-12', ['purchased']);
  await page.getByRole('button', { name: 'Send Pizza + beer receipt ($59.52)' }).click();

  const r = await waitStatus(request, 'R-12', ['cancelled']);
  expect(r.filing).toBeNull();
  expect(r.card?.status).toBe('terminated');
  expect(r.transaction?.resolution).toBe('owed_back');
  expect((await state(request)).budget.unreconciled.totalCents).toBe(5952);

  const treasurer = page.getByRole('region', { name: 'Jordan Lee' });
  await treasurer.getByRole('button', { name: 'Mark repaid…' }).click();
  await treasurer.getByRole('button', { name: 'Confirm repaid' }).click();
  await expect.poll(async () => (await state(request)).budget.unreconciled.totalCents).toBe(0);
});

test('reimbursement branch: same pipeline, personal funds, filed with payee details', async ({ page, request }) => {
  await page.getByLabel('Acting as officer').selectOption('m-arjun');
  await officerSays(page, DEMO.reimbursement, 'hardware-reimbursement.png');
  const pending = await waitStatus(request, 'R-12', ['awaiting_approval']);
  expect(pending.fundingSource).toBe('out_of_pocket');
  expect(pending.amountCents).toBe(8640);
  await approval(page, 'R-12').getByRole('button', { name: 'Approve $86.40', exact: true }).click();
  const closed = await waitStatus(request, 'R-12', ['closed'], 120_000);
  expect(closed.filing?.formType).toBe('reimbursement');
  const html = await (await request.get('/mock-portal/submissions')).text();
  expect(html).toContain(closed.filing!.confirmationId!);
  const hw = (await state(request)).budget.lines.find((l) => l.id === 'L-HW')!;
  expect(hw.remaining).toBe(105233 - 8640);
});

test('alcohol on a reimbursement cancels it; nothing is filed', async ({ page, request }) => {
  await officerSays(page, DEMO.beerReimbursement, 'pizza-beer.png');
  const r = await waitStatus(request, 'R-12', ['cancelled']);
  expect(r.filing).toBeNull();
  expect(r.fundingSource).toBe('out_of_pocket');
});

test('only the treasurer can approve (checked on the server)', async ({ page, request }) => {
  await officerSays(page, DEMO.gmPizza);
  await waitStatus(request, 'R-12', ['awaiting_approval']);
  const res = await request.post('/api/requests/R-12/approve', { data: { actorId: OFFICER } });
  expect(res.status()).toBe(403);
  expect((await req(request, 'R-12')).status).toBe('awaiting_approval');
});

test('filing is idempotent: the portal rejects a duplicate external reference', async ({ page, request }) => {
  await officerSays(page, DEMO.gmPizza);
  await waitStatus(request, 'R-12', ['awaiting_approval']);
  await request.post('/api/requests/R-12/approve', { data: { actorId: TREASURER } });
  await waitStatus(request, 'R-12', ['card_issued']);
  await request.post('/api/requests/R-12/simulate-purchase', {
    data: { actorId: OFFICER, amountCents: 4873, merchantName: 'Telegraph Slice Co.', merchantCategory: 'restaurants' },
  });
  await waitStatus(request, 'R-12', ['purchased']);
  await page.getByRole('button', { name: 'Send Pizza receipt ($48.73)' }).click();
  const closed = await waitStatus(request, 'R-12', ['closed'], 120_000);

  const res = await request.post('/api/mock-portal/submit', {
    multipart: {
      org_name: 'Neurotech@Berkeley',
      org_account: 'ASUC-ORG-4471',
      submitter_name: 'Maya Chen',
      submitter_email: 'maya.chen@berkeley.edu',
      external_ref: 'FRONTED-R-12',
      payment_method: 'ASUC Program Card',
      card_last4: '1234',
      vendor: 'Telegraph Slice Co.',
      transaction_date: '11/12/2026',
      amount: '48.73',
      budget_line: 'Food & Events',
      attendee_count: '12',
      attendees: '12 members',
      business_purpose: 'Pizza for the general meeting (duplicate attempt)',
      certify: 'on',
      receipt: { name: 'r.png', mimeType: 'image/png', buffer: fs.readFileSync('fixtures/receipts/pizza-clean.png') },
    },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).duplicateOf).toBe(closed.filing!.confirmationId);
});

test('advice cites the org inputs (Slack, calendar, board notes) that code selected for the request', async ({ page, request }) => {
  await officerSays(page, DEMO.gmPizza);
  const r = await waitStatus(request, 'R-12', ['awaiting_approval']);
  const cited = new Set(r.recommendation!.reasons.flatMap((x) => x.cites.filter((c) => c.type === 'signal').map((c) => c.id)));
  expect([...cited].sort()).toEqual(['CAL-01', 'MIN-01', 'SL-01']);
  // An unrelated message (the photo reminder in #general) is never in context.
  const trace = (await state(request)).audit.find((a) => a.title.includes('org inputs in context'));
  expect((trace!.data as { orgInputs: string[] }).orgInputs).not.toContain('SL-05');
  await page.goto('/treasurer');
  await expect(page.getByRole('region', { name: 'Org inputs' }).getByText('Cited in pending advice')).toHaveCount(3);
});
