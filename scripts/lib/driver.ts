/**
 * HTTP driver for the demo scenarios. Used by `npm run record` (live) and to
 * discover replay keys. Talks to the app exactly like the simulator does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEMO } from '../../src/lib/demoScript';
import type { AppState, RequestView } from '../../src/lib/view';

export const OFFICER = 'm-maya';
export const HW_OFFICER = 'm-arjun';
export const TREASURER = 'm-jordan';

export class Driver {
  constructor(public base: string) {}

  async state(): Promise<AppState> {
    return (await (await fetch(`${this.base}/api/state`)).json()) as AppState;
  }
  async reset() {
    const r = await fetch(`${this.base}/api/dev/reset`, { method: 'POST' });
    if (!r.ok) throw new Error(`reset failed ${r.status}`);
  }
  async officer(text: string, receipt?: string, memberId = OFFICER): Promise<string | undefined> {
    const fd = new FormData();
    fd.set('memberId', memberId);
    fd.set('text', text);
    if (receipt) {
      const buf = fs.readFileSync(path.join(process.cwd(), 'fixtures', 'receipts', receipt));
      fd.set('image', new Blob([new Uint8Array(buf)], { type: 'image/png' }), receipt);
    }
    const r = await fetch(`${this.base}/api/officer/message`, { method: 'POST', body: fd });
    const j = (await r.json()) as { requestShortId?: string; error?: string };
    if (!r.ok) throw new Error(`officer message failed: ${j.error}`);
    return j.requestShortId;
  }
  async action(shortId: string, action: string, body: Record<string, unknown>) {
    const r = await fetch(`${this.base}/api/requests/${shortId}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) throw new Error(`${action} ${shortId} failed: ${j.error}`);
    return j;
  }
  async request(shortId: string): Promise<RequestView> {
    const s = await this.state();
    const r = s.requests.find((x) => x.shortId === shortId);
    if (!r) throw new Error(`no ${shortId}`);
    return r;
  }
  async waitStatus(shortId: string, statuses: string[], timeoutMs = 90_000): Promise<RequestView> {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < timeoutMs) {
      const r = await this.request(shortId);
      last = r.status;
      if (statuses.includes(r.status)) return r;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error(`${shortId} stuck in ${last}, wanted ${statuses.join('|')}`);
  }
}

/** The full demo, in script order. Returns the short IDs used. */
export async function runDemoScenarios(d: Driver, log: (s: string) => void = console.log) {
  await d.reset();
  const reject = await d.officer(DEMO.rejectMarketing);
  log(`reject: ${reject} → ${(await d.request(reject!)).status}`);

  const gm = await d.officer(DEMO.gmPizza);
  await d.waitStatus(gm!, ['awaiting_approval']);
  log(`gm: ${gm} awaiting approval`);
  await d.action(gm!, 'approve', { actorId: TREASURER, note: DEMO.gmPizzaNote });
  await d.waitStatus(gm!, ['card_issued']);
  await d.action(gm!, 'simulate-purchase', { actorId: OFFICER, amountCents: DEMO.purchase.cleanCents, merchantName: DEMO.purchase.merchantName, merchantCategory: DEMO.purchase.merchantCategory });
  await d.officer('', 'pizza-clean.png');
  const filed = await d.waitStatus(gm!, ['closed', 'needs_human'], 120_000);
  log(`gm: ${gm} → ${filed.status} ${filed.filing?.confirmationId ?? ''}`);

  const next = await d.officer(DEMO.nextGmPizza);
  await d.waitStatus(next!, ['awaiting_approval']);
  log(`learning loop: ${next} → ${(await d.request(next!)).recommendation?.verdict}`);

  const reimb = await d.officer(DEMO.reimbursement, 'hardware-reimbursement.png', HW_OFFICER);
  await d.waitStatus(reimb!, ['awaiting_approval']);
  await d.action(reimb!, 'approve', { actorId: TREASURER });
  const rf = await d.waitStatus(reimb!, ['closed', 'needs_human'], 120_000);
  log(`reimbursement: ${reimb} → ${rf.status} ${rf.filing?.confirmationId ?? ''}`);

  // Fresh org: the "before" side of the learning loop, and both alcohol paths.
  await d.reset();
  const before = await d.officer(DEMO.nextGmPizza);
  await d.waitStatus(before!, ['awaiting_approval']);
  log(`learning loop (before note): ${before} → ${(await d.request(before!)).recommendation?.verdict}`);

  await d.reset();
  const beer = await d.officer(DEMO.gmPizza);
  await d.waitStatus(beer!, ['awaiting_approval']);
  await d.action(beer!, 'approve', { actorId: TREASURER });
  await d.waitStatus(beer!, ['card_issued']);
  await d.action(beer!, 'simulate-purchase', { actorId: OFFICER, amountCents: DEMO.purchase.beerCents, merchantName: DEMO.purchase.merchantName, merchantCategory: DEMO.purchase.merchantCategory });
  await d.officer('', 'pizza-beer.png');
  log(`beer (card): ${beer} → ${(await d.waitStatus(beer!, ['cancelled', 'receipt_flagged'])).status}`);

  await d.reset();
  const beerR = await d.officer(DEMO.beerReimbursement, 'pizza-beer.png');
  log(`beer (reimbursement): ${beerR} → ${(await d.request(beerR!)).status}`);
}
