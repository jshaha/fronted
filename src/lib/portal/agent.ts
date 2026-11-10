/**
 * The browser agent loop, run by the portal worker (never inside a Next.js route):
 *   snapshot → plan (Claude) → validate (code) → execute (Playwright) → repeat
 * until the portal shows a confirmation ID. Every step is audited with a screenshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { audit } from '../audit';
import { config } from '../config';
import { ReplayMissingError, ModelOutputError } from '../claude/client';
import type { FilingPayload, FormSnapshot, PlanStep, PortalPlan } from '../types';
import { assertPortalUrl } from './allowlist';
import { captureSnapshot, renderSnapshot, snapshotFingerprint } from './snapshot';
import { planFill, plannerFixtureKey } from './planner';
import { validatePlan } from './planValidator';
import { scriptedPlan } from './fallbackPlan';

export const SCREENSHOT_DIR = path.join(process.cwd(), 'data', 'screenshots');

export type FilingJob = { id: number; requestId: number; attempt: number; payload: FilingPayload };
export type FilingOutcome = { confirmationId: string; duplicate: boolean; rounds: number; plans: PortalPlan[] };

const DUPLICATE_RE = /already submitted \(confirmation (ASUC-EXP-[0-9-]+)\)/;

export function describeStep(st: PlanStep): string {
  const target = `${st.target.role} “${st.target.name}”`;
  return st.value_ref ? `${st.action} ${target} ← payload.${st.value_ref}` : `${st.action} ${target}`;
}

async function resolve(page: Page, st: PlanStep): Promise<Locator> {
  const loc =
    st.target.role === 'file'
      ? page.locator('form[data-portal-form] input[type="file"]').and(page.getByLabel(st.target.name, { exact: true }))
      : page.locator('form[data-portal-form]').getByRole(st.target.role, { name: st.target.name, exact: true });
  const n = await loc.count();
  if (n !== 1) throw new Error(`target ${st.target.role} “${st.target.name}” resolved to ${n} elements (need exactly 1)`);
  return loc;
}

type PlanLog = (title: string, data?: unknown, extra?: { latencyMs?: number; model?: string; mode?: string }) => void;

/** Claude plans, code validates; a rejected or invalid plan falls back to the scripted one. */
export async function choosePlan(snap: FormSnapshot, payload: FilingPayload, round: number, log: PlanLog): Promise<PortalPlan> {
  const forced = process.env.PLANNER === 'scripted';
  if (!forced) {
    try {
      const res = await planFill(snap, payload);
      log(`Claude planned ${res.data.steps.length} steps${res.data.submits ? ' and a submit' : ''}`, { fixtureKey: res.fixtureKey, recording: res.recordingPath, plan: res.data }, {
        latencyMs: res.latencyMs,
        model: res.model,
        mode: res.mode,
      });
      const v = validatePlan(res.data, snap, payload);
      if (v.ok) {
        log(`Code validated the plan: every value is a payload reference, every target matches exactly one control, no navigation`, { steps: v.plan.steps.map(describeStep) });
        return v.plan;
      }
      log(`Code REJECTED the plan → using the scripted fallback`, { errors: v.errors });
    } catch (err) {
      if (err instanceof ReplayMissingError) throw err;
      if (!(err instanceof ModelOutputError)) throw err;
      log(`Planner output invalid twice → using the scripted fallback`, { error: err.message });
    }
  } else {
    log('PLANNER=scripted: using the scripted plan', { fixtureKey: plannerFixtureKey(snap, payload) });
  }
  const fb = scriptedPlan(snap, payload);
  const v = validatePlan(fb, snap, payload);
  if (!v.ok) throw new Error(`Scripted plan failed validation: ${v.errors.join('; ')}`);
  log(`Scripted fallback plan: ${fb.steps.length} steps (round ${round})`, { steps: fb.steps.map(describeStep) });
  return v.plan;
}

export class FilingAgent {
  private shot = 0;
  constructor(
    private page: Page,
    private job: FilingJob,
  ) {}

  private async screenshot(label: string): Promise<string | undefined> {
    try {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const name = `f${this.job.id}-a${this.job.attempt}-${String(++this.shot).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.jpg`;
      await this.page.screenshot({ path: path.join(SCREENSHOT_DIR, name), type: 'jpeg', quality: 55 });
      return name;
    } catch {
      return undefined;
    }
  }

  private log(title: string, data?: unknown, screenshot?: string, extra: { latencyMs?: number; model?: string; mode?: string } = {}) {
    audit({ requestId: this.job.requestId, traceId: `filing-${this.job.id}`, kind: 'browser', title, data, screenshot, ...extra });
  }

  private checkUrl() {
    assertPortalUrl(this.page.url(), config.portalAllowedOrigins);
  }

  async run(): Promise<FilingOutcome> {
    const url = config.portalUrl;
    assertPortalUrl(url, config.portalAllowedOrigins);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for React to hydrate: before that, a click would fall through to a native form submit.
    await this.page.waitForSelector('form[data-portal-form][data-hydrated="true"]', { timeout: 30_000 });
    this.checkUrl();
    this.log(`Opened mock ASUC portal (${new URL(url).pathname})`, { url, allowlist: config.portalAllowedOrigins }, await this.screenshot('opened'));

    const plans: PortalPlan[] = [];
    for (let round = 1; round <= config.maxPlannerRounds; round++) {
      const snap = await captureSnapshot(this.page);
      if (process.env.DUMP_SNAPSHOTS) {
        fs.mkdirSync(process.env.DUMP_SNAPSHOTS, { recursive: true });
        fs.writeFileSync(path.join(process.env.DUMP_SNAPSHOTS, `${this.job.payload.payment_method.startsWith('ASUC') ? 'card' : 'personal'}-r${round}.json`), JSON.stringify(snap, null, 2));
      }
      if (snap.confirmationId) return { confirmationId: snap.confirmationId, duplicate: false, rounds: round - 1, plans };
      const dup = snap.controls.map((c) => c.error ?? '').join(' ').match(DUPLICATE_RE);
      if (dup) {
        this.log(`Portal says ${this.job.payload.external_ref} was already filed as ${dup[1]} — treating as done`, { confirmationId: dup[1] });
        return { confirmationId: dup[1], duplicate: true, rounds: round - 1, plans };
      }

      const rendered = renderSnapshot(snap);
      const errors = snap.controls.filter((c) => c.error);
      this.log(
        `Round ${round}: snapshot of ${snap.controls.length} form controls${errors.length ? `, ${errors.length} with errors` : ''} (~${Math.ceil(rendered.length / 4)} tokens)`,
        { snapshot: rendered, fingerprint: snapshotFingerprint(snap), errors: errors.map((e) => `${e.name}: ${e.error}`) },
      );

      const plan = await this.getPlan(snap, round);
      plans.push(plan);
      for (const [i, st] of plan.steps.entries()) await this.execute(st, i + 1, plan.steps.length, round);
      if (!plan.submits) continue;
    }
    const last = await captureSnapshot(this.page);
    if (last.confirmationId) return { confirmationId: last.confirmationId, duplicate: false, rounds: config.maxPlannerRounds, plans };
    throw new Error(`No confirmation after ${config.maxPlannerRounds} rounds. Last errors: ${last.controls.filter((c) => c.error).map((c) => c.error).join(' ') || 'none'}`);
  }

  private getPlan(snap: FormSnapshot, round: number): Promise<PortalPlan> {
    return choosePlan(snap, this.job.payload, round, (title, data, extra) => this.log(title, data, undefined, extra));
  }

  private async execute(st: PlanStep, i: number, n: number, round: number): Promise<void> {
    const loc = await resolve(this.page, st);
    const value = st.value_ref ? this.job.payload[st.value_ref] : undefined;
    const headed = config.portalRunner === 'headed';
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc
      .evaluate((el) => {
        (el as HTMLElement).style.outline = '3px solid #6d5efc';
        (el as HTMLElement).style.outlineOffset = '2px';
      })
      .catch(() => {});

    let submitResult: string | undefined;
    switch (st.action) {
      case 'fill':
        if (headed) {
          await loc.clear();
          await loc.pressSequentially(value!, { delay: 8 });
        } else await loc.fill(value!);
        break;
      case 'select':
        await loc.selectOption({ label: value! });
        break;
      case 'check':
        await loc.check();
        break;
      case 'upload':
        await loc.setInputFiles(value!);
        break;
      case 'click': {
        const isSubmit = await loc.evaluate((el) => (el as HTMLButtonElement).type === 'submit');
        if (isSubmit) {
          const resp = this.page.waitForResponse((r) => r.url().includes('/api/mock-portal/submit'), { timeout: 20_000 });
          await loc.click();
          const r = await resp;
          await this.page.waitForFunction(() => !document.querySelector('form[data-portal-form] button[type="submit"][disabled]'), undefined, { timeout: 10_000 }).catch(() => {});
          await this.page.waitForTimeout(150);
          submitResult = r.status() === 200 ? 'accepted' : `rejected (HTTP ${r.status()})`;
        } else await loc.click();
        break;
      }
    }
    await loc
      .evaluate((el) => {
        (el as HTMLElement).style.outline = '';
      })
      .catch(() => {});
    this.checkUrl();
    if (config.portalStepDelayMs > 0 && headed) await this.page.waitForTimeout(config.portalStepDelayMs);

    const shown = st.value_ref === 'receipt_file' ? path.basename(value ?? '') : value && value.length > 48 ? `${value.slice(0, 45)}…` : value;
    let title = `${i}/${n} ${describeStep(st)}${shown !== undefined ? ` = “${shown}”` : ''}`;
    if (submitResult) {
      const after = await captureSnapshot(this.page);
      const errs = after.controls.filter((c) => c.error).map((c) => c.error!);
      title = after.confirmationId
        ? `Submitted → portal accepted: ${after.confirmationId}`
        : `Submitted → ${submitResult}${errs.length ? `: ${errs.join(' ')}` : ''}`;
    }
    this.log(title, { round, step: st }, await this.screenshot(`${round}-${i}-${st.action}`));
  }
}
