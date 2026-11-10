/**
 * The filing agent without a browser: the same snapshot → plan (Claude) →
 * validate (code) → execute loop as FilingAgent, run against VirtualPortal.
 * Each step is audited with the form's state so the UI can draw the portal
 * filling in, in place of browser screenshots.
 */
import path from 'node:path';
import { audit } from '../audit';
import { config } from '../config';
import type { PlanStep, PortalPlan } from '../types';
import { assertPortalUrl } from './allowlist';
import { choosePlan, describeStep, type FilingJob, type FilingOutcome } from './agent';
import { renderSnapshot, snapshotFingerprint } from './snapshot';
import { VirtualPortal } from './virtualPortal';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SimulatedFilingAgent {
  private portal: VirtualPortal;

  constructor(private job: FilingJob) {
    this.portal = new VirtualPortal(config.portalUrl);
  }

  private log(title: string, data?: Record<string, unknown>, extra: { latencyMs?: number; model?: string; mode?: string } = {}) {
    audit({ requestId: this.job.requestId, traceId: `filing-${this.job.id}`, kind: 'browser', title, data: { ...data, portalForm: this.portal.view() }, ...extra });
  }

  async run(): Promise<FilingOutcome> {
    assertPortalUrl(config.portalUrl, config.portalAllowedOrigins);
    this.log(`Opened mock ASUC portal (${new URL(config.portalUrl).pathname}, simulated: no browser)`, { url: config.portalUrl });

    const plans: PortalPlan[] = [];
    for (let round = 1; round <= config.maxPlannerRounds; round++) {
      const snap = this.portal.snapshot();
      if (snap.confirmationId) return { confirmationId: snap.confirmationId, duplicate: false, rounds: round - 1, plans };

      const rendered = renderSnapshot(snap);
      const errors = snap.controls.filter((c) => c.error);
      this.log(`Round ${round}: snapshot of ${snap.controls.length} form controls${errors.length ? `, ${errors.length} with errors` : ''} (~${Math.ceil(rendered.length / 4)} tokens)`, {
        snapshot: rendered,
        fingerprint: snapshotFingerprint(snap),
        errors: errors.map((e) => `${e.name}: ${e.error}`),
      });

      const plan = await choosePlan(snap, this.job.payload, round, (title, data, extra) => this.log(title, data as Record<string, unknown>, extra));
      plans.push(plan);
      for (const [i, st] of plan.steps.entries()) {
        const dup = await this.execute(st, i + 1, plan.steps.length, round);
        if (dup) return { confirmationId: dup, duplicate: true, rounds: round, plans };
      }
    }
    const last = this.portal.snapshot();
    if (last.confirmationId) return { confirmationId: last.confirmationId, duplicate: false, rounds: config.maxPlannerRounds, plans };
    throw new Error(`No confirmation after ${config.maxPlannerRounds} rounds. Last errors: ${last.controls.filter((c) => c.error).map((c) => c.error).join(' ') || 'none'}`);
  }

  /** Returns the existing confirmation ID when the portal reports a duplicate. */
  private async execute(st: PlanStep, i: number, n: number, round: number): Promise<string | undefined> {
    const value = st.value_ref ? this.job.payload[st.value_ref] : undefined;
    const res = this.portal.apply(st, value);
    if (config.portalStepDelayMs > 0) await sleep(config.portalStepDelayMs);

    const shown = st.value_ref === 'receipt_file' ? path.basename(value ?? '') : value && value.length > 48 ? `${value.slice(0, 45)}…` : value;
    let title = `${i}/${n} ${describeStep(st)}${shown !== undefined ? ` = “${shown}”` : ''}`;
    if (res) {
      const errs = this.portal.snapshot().controls.filter((c) => c.error).map((c) => c.error!);
      title = res.ok ? `Submitted → portal accepted: ${res.confirmationId}` : `Submitted → rejected${errs.length ? `: ${errs.join(' ')}` : ''}`;
    }
    this.log(title, { round, step: st });
    if (res && !res.ok && res.duplicateOf) {
      this.log(`Portal says ${this.job.payload.external_ref} was already filed as ${res.duplicateOf}, treating as done`, { confirmationId: res.duplicateOf });
      return res.duplicateOf;
    }
    return undefined;
  }
}
