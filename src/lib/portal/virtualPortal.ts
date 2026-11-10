/**
 * An in-process stand-in for the mock ASUC portal page, for hosts that cannot
 * run a browser (small containers). It renders the same form from the same
 * field definitions, so its snapshots match what Playwright captures from
 * /mock-portal (same fingerprint, so planner replays still apply), and it
 * submits through the same server-side validation and store as the real route.
 */
import path from 'node:path';
import type { FormSnapshot, PlanStep, SnapshotControl } from '../types';
import {
  PORTAL_ERRORS,
  PORTAL_FORM_VERSION,
  PORTAL_SECTIONS,
  SAVE_DRAFT_BUTTON_LABEL,
  SELECT_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL,
  visibleFields,
  type PortalField,
} from '../mockPortal/fields';
import { validateSubmission } from '../mockPortal/validate';
import { findByExternalRef, insertSubmission } from '../mockPortal/store';

export const PORTAL_TITLE = 'New Expense Report — ASUC Portal (Mock)';

const sectionTitle = (f: PortalField) => PORTAL_SECTIONS.find((s) => s.id === f.section)!.title;
const truncate = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v);

/** What the UI draws: the form as the agent sees it after each step. */
export type PortalFormView = {
  sections: { title: string; fields: { label: string; kind: PortalField['kind']; value: string; error?: string; active?: boolean }[] }[];
  alerts: string[];
  confirmationId?: string;
};

export type SubmitResult = { ok: true; confirmationId: string } | { ok: false; duplicateOf?: string };

export class VirtualPortal {
  private values: Record<string, string> = {};
  private checked = false;
  private receiptPath: string | null = null;
  private errors: Record<string, string> = {};
  private alerts: string[] = [];
  private confirmationId?: string;
  private active?: string;

  constructor(private url: string) {}

  private fields(): PortalField[] {
    return visibleFields(this.values.payment_method);
  }

  private byTarget(st: PlanStep): PortalField | 'submit' | 'draft' {
    if (st.target.role === 'button') {
      if (st.target.name === SUBMIT_BUTTON_LABEL) return 'submit';
      if (st.target.name === SAVE_DRAFT_BUTTON_LABEL) return 'draft';
    }
    const role = (f: PortalField) => ({ text: 'textbox', textarea: 'textbox', select: 'combobox', file: 'file', checkbox: 'checkbox' })[f.kind];
    const hits = this.fields().filter((f) => f.label === st.target.name && role(f) === st.target.role);
    if (hits.length !== 1) throw new Error(`target ${st.target.role} “${st.target.name}” resolved to ${hits.length} elements (need exactly 1)`);
    return hits[0];
  }

  snapshot(): FormSnapshot {
    if (this.confirmationId) return { url: this.url, title: PORTAL_TITLE, formVersion: PORTAL_FORM_VERSION, alerts: [], controls: [], confirmationId: this.confirmationId };
    const controls: SnapshotControl[] = this.fields().map((f) => {
      const base = { name: f.label, required: f.required, section: sectionTitle(f) };
      let c: SnapshotControl;
      if (f.kind === 'select') c = { role: 'combobox', ...base, options: [...(f.options ?? [])], value: this.values[f.name] || SELECT_PLACEHOLDER };
      else if (f.kind === 'checkbox') c = { role: 'checkbox', ...base, checked: this.checked };
      else if (f.kind === 'file') c = { role: 'file', ...base, value: this.receiptPath ? path.basename(this.receiptPath) : '' };
      else c = { role: 'textbox', ...base, value: truncate(this.values[f.name] ?? '') };
      if (this.errors[f.name]) c.error = this.errors[f.name];
      return c;
    });
    controls.push({ role: 'button', name: SUBMIT_BUTTON_LABEL, required: false }, { role: 'button', name: SAVE_DRAFT_BUTTON_LABEL, required: false });
    return { url: this.url, title: PORTAL_TITLE, formVersion: PORTAL_FORM_VERSION, alerts: [...this.alerts], controls };
  }

  /** Applies one validated plan step. Returns a submit result when the step submitted. */
  apply(st: PlanStep, value: string | undefined): SubmitResult | undefined {
    const target = this.byTarget(st);
    if (target === 'draft') return undefined;
    if (target === 'submit') {
      this.active = undefined;
      return this.submit();
    }
    this.active = target.name;
    switch (st.action) {
      case 'fill':
        this.values[target.name] = (value ?? '').trim();
        break;
      case 'select':
        if (!target.options?.includes(value ?? '')) throw new Error(`“${value}” is not an option of ${target.label}`);
        this.values[target.name] = value === SELECT_PLACEHOLDER ? '' : value!;
        break;
      case 'check':
        this.checked = true;
        break;
      case 'upload':
        this.receiptPath = value ?? null;
        break;
      default:
        throw new Error(`cannot ${st.action} ${st.target.role} “${st.target.name}”`);
    }
    return undefined;
  }

  private submit(): SubmitResult {
    const fields: Record<string, string> = {};
    for (const f of this.fields()) if (f.kind !== 'file' && f.kind !== 'checkbox') fields[f.name] = this.values[f.name] ?? '';
    fields.payment_method = this.values.payment_method ?? '';
    if (this.checked) fields.certify = 'on';
    const ext = path.extname(this.receiptPath ?? '').toLowerCase();
    const receipt = this.receiptPath ? { name: path.basename(this.receiptPath), type: ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream', size: 1 } : null;

    let errors = validateSubmission(fields, receipt);
    let duplicateOf: string | undefined;
    if (!Object.keys(errors).length && fields.external_ref) {
      const existing = findByExternalRef(fields.external_ref);
      if (existing) {
        duplicateOf = existing.confirmationId;
        errors = { external_ref: PORTAL_ERRORS.duplicate(existing.confirmationId) };
      }
    }
    if (Object.keys(errors).length) {
      this.errors = errors;
      // Same order as the page's error summary: visible fields, top to bottom.
      const ordered = this.fields().filter((f) => errors[f.name]).map((f) => errors[f.name]);
      this.alerts = [[PORTAL_ERRORS.summary, ...ordered].join(' ')];
      return { ok: false, duplicateOf };
    }
    this.errors = {};
    this.alerts = [];
    this.confirmationId = insertSubmission(PORTAL_FORM_VERSION, fields.external_ref, fields, this.receiptPath ? path.basename(this.receiptPath) : null);
    return { ok: true, confirmationId: this.confirmationId };
  }

  view(): PortalFormView {
    const fields = this.fields();
    return {
      sections: PORTAL_SECTIONS.map((s) => ({
        title: s.title,
        fields: fields
          .filter((f) => f.section === s.id)
          .map((f) => ({
            label: f.label,
            kind: f.kind,
            value: f.kind === 'checkbox' ? (this.checked ? 'yes' : '') : f.kind === 'file' ? (this.receiptPath ? path.basename(this.receiptPath) : '') : (this.values[f.name] ?? ''),
            error: this.errors[f.name],
            active: this.active === f.name || undefined,
          })),
      })).filter((s) => s.fields.length),
      alerts: [...this.alerts],
      confirmationId: this.confirmationId,
    };
  }
}
