import { describe, it, expect } from 'vitest';
import { validatePlan } from '@/lib/portal/planValidator';
import { scriptedPlan } from '@/lib/portal/fallbackPlan';
import { SUBMIT_BUTTON_LABEL, SAVE_DRAFT_BUTTON_LABEL } from '@/lib/mockPortal/fields';
import type { FormSnapshot, FilingPayload, PortalPlan } from '@/lib/types';

describe('portal validation', () => {
  const snapshot: FormSnapshot = {
    url: 'http://localhost:3000/mock-portal',
    title: 'Expense Report',
    formVersion: 'v1',
    alerts: [],
    controls: [
      { role: 'textbox', name: 'Organization Name', required: true, value: '' },
      { role: 'textbox', name: 'Amount (USD)', required: true, value: '' },
      { role: 'textbox', name: 'Transaction Date', required: true, value: '' },
      {
        role: 'combobox',
        name: 'Payment Method',
        required: true,
        options: ['-- Select --', 'ASUC Program Card', 'Personal Funds (Reimbursement)'],
        value: '',
      },
      {
        role: 'combobox',
        name: 'Budget Line',
        required: true,
        options: ['-- Select --', 'Food & Events', 'Project Hardware', 'Marketing'],
        value: '',
      },
      { role: 'file', name: 'Itemized Receipt', required: true },
      { role: 'checkbox', name: 'I certify that this expense complies with the ASUC Finance Policy', required: true },
      { role: 'button', name: SUBMIT_BUTTON_LABEL, required: false },
      { role: 'button', name: SAVE_DRAFT_BUTTON_LABEL, required: false },
    ],
  };

  const payload: FilingPayload = {
    external_ref: 'FRONTED-R-12',
    org_name: 'Neurotech@Berkeley',
    payment_method: 'ASUC Program Card',
    amount: '48.73',
    transaction_date: '2026-11-12',
    transaction_date_us: '11/12/2026',
    budget_line: 'Food & Events',
    receipt_file: '/tmp/r.png',
  };

  const goodPlan: PortalPlan = {
    steps: [
      { action: 'select', target: { role: 'combobox', name: 'Payment Method' }, value_ref: 'payment_method' },
      { action: 'fill', target: { role: 'textbox', name: 'Organization Name' }, value_ref: 'org_name' },
      { action: 'fill', target: { role: 'textbox', name: 'Amount (USD)' }, value_ref: 'amount' },
      { action: 'select', target: { role: 'combobox', name: 'Budget Line' }, value_ref: 'budget_line' },
      { action: 'upload', target: { role: 'file', name: 'Itemized Receipt' }, value_ref: 'receipt_file' },
      { action: 'check', target: { role: 'checkbox', name: 'I certify that this expense complies with the ASUC Finance Policy' } },
      { action: 'click', target: { role: 'button', name: SUBMIT_BUTTON_LABEL } },
    ],
    submits: true,
  };

  describe('validatePlan', () => {
    it('good plan passes', () => {
      const result = validatePlan(goodPlan, snapshot, payload);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.plan).toEqual(goodPlan);
    });

    it('rejects free value in step', () => {
      const badPlan = {
        ...goodPlan,
        steps: [
          ...goodPlan.steps.slice(0, 1),
          { action: 'fill', target: { role: 'textbox', name: 'Organization Name' }, value: '1000.00' },
        ],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('value');
    });

    it('rejects goto action', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'goto' as any, target: { role: 'textbox', name: 'org_name' } }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('not allowed');
    });

    it('rejects step with url key', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'org_name' }, url: 'http://evil.com' } as any],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('rejects fill with no value_ref', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'Organization Name' } }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('rejects check with value_ref', () => {
      const badPlan = {
        ...goodPlan,
        steps: [
          { action: 'check', target: { role: 'checkbox', name: 'I certify...' }, value_ref: 'org_name' as any },
        ],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('rejects value_ref to missing payload field', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'Organization Name' }, value_ref: 'card_last4' }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('card_last4');
    });

    it('rejects target name not in snapshot', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'NonExistent Field' }, value_ref: 'org_name' }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('no such control');
    });

    it('rejects ambiguous target (duplicate control)', () => {
      const dupSnapshot: FormSnapshot = {
        ...snapshot,
        controls: [...snapshot.controls, { role: 'textbox', name: 'Amount (USD)', required: true, value: '' }],
      };
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'Amount (USD)' }, value_ref: 'amount' }],
      };
      const result = validatePlan(badPlan, dupSnapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('ambiguous');
    });

    it('rejects action-role mismatch (fill on combobox)', () => {
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'combobox', name: 'Payment Method' }, value_ref: 'payment_method' }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('needs a');
    });

    it('rejects select with payload value not in options', () => {
      const badPayload: FilingPayload = { ...payload, payment_method: 'Stripe' };
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'select', target: { role: 'combobox', name: 'Payment Method' }, value_ref: 'payment_method' }],
      };
      const result = validatePlan(badPlan, snapshot, badPayload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('not an option');
    });

    it('rejects submits: true without click at end', () => {
      const badPlan: PortalPlan = {
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'Organization Name' }, value_ref: 'org_name' }],
        submits: true,
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('does not end with a click');
    });

    it('rejects extra unknown top-level key (strict mode)', () => {
      const badPlan = {
        ...goodPlan,
        unknownKey: 'value',
      } as any;
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('rejects click role that is a link', () => {
      // Links are not in PLAN_ROLES, so this should be rejected
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'click', target: { role: 'link' as any, name: 'Next Page' } }],
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('rejects navigation attempts (not detectable by construction)', () => {
      // Plans can't contain navigation by design, so we're testing that link role is rejected
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'click', target: { role: 'link', name: 'Navigate' } }] as any,
      };
      const result = validatePlan(badPlan, snapshot, payload);
      expect(result.ok).toBe(false);
    });

    it('empty value_ref string counts as missing', () => {
      const badPayload: FilingPayload = { ...payload, org_name: '' };
      const badPlan = {
        ...goodPlan,
        steps: [{ action: 'fill', target: { role: 'textbox', name: 'Organization Name' }, value_ref: 'org_name' }],
      };
      const result = validatePlan(badPlan, snapshot, badPayload);
      expect(result.ok).toBe(false);
    });
  });

  describe('scriptedPlan', () => {
    it('generates a valid plan that passes validatePlan', () => {
      const plan = scriptedPlan(snapshot, payload);
      const result = validatePlan(plan, snapshot, payload);
      expect(result.ok).toBe(true);
    });

    it('selects payment method first', () => {
      const plan = scriptedPlan(snapshot, payload);
      const firstPaymentStep = plan.steps.find((s) => s.target.name === 'Payment Method');
      expect(firstPaymentStep).toBeDefined();
      expect(plan.steps[0]).toEqual(firstPaymentStep);
    });

    it('ends with click on Submit Expense Report', () => {
      const plan = scriptedPlan(snapshot, payload);
      const lastStep = plan.steps[plan.steps.length - 1];
      expect(lastStep.action).toBe('click');
      expect(lastStep.target.name).toBe(SUBMIT_BUTTON_LABEL);
    });

    it('checks the certify checkbox', () => {
      const plan = scriptedPlan(snapshot, payload);
      const certifyStep = plan.steps.find((s) => s.target.name === 'I certify that this expense complies with the ASUC Finance Policy');
      expect(certifyStep).toBeDefined();
      expect(certifyStep?.action).toBe('check');
    });

    it('never targets Save Draft button', () => {
      const plan = scriptedPlan(snapshot, payload);
      const hasSaveDraft = plan.steps.some((s) => s.target.name === SAVE_DRAFT_BUTTON_LABEL);
      expect(hasSaveDraft).toBe(false);
    });

    it('submits: true', () => {
      const plan = scriptedPlan(snapshot, payload);
      expect(plan.submits).toBe(true);
    });

    it('only includes fields with payload values', () => {
      const minimalPayload: FilingPayload = {
        external_ref: 'REF-123',
        payment_method: 'ASUC Program Card',
        amount: '50.00',
        receipt_file: '/tmp/r.png',
      };
      const plan = scriptedPlan(snapshot, minimalPayload);
      // Should not have steps for fields not in payload
      const organizationStep = plan.steps.find((s) => s.target.name === 'Organization Name');
      expect(organizationStep).toBeUndefined();
    });

    it('skips controls not in PORTAL_FIELDS', () => {
      const unknownSnapshot: FormSnapshot = {
        ...snapshot,
        controls: [...snapshot.controls, { role: 'textbox', name: 'Unknown Field', required: false }],
      };
      const plan = scriptedPlan(unknownSnapshot, payload);
      const unknownStep = plan.steps.find((s) => s.target.name === 'Unknown Field');
      expect(unknownStep).toBeUndefined();
    });

    it('skips checkbox if already checked', () => {
      const checkedSnapshot: FormSnapshot = {
        ...snapshot,
        controls: snapshot.controls.map((c) =>
          c.name === 'I certify that this expense complies with the ASUC Finance Policy' ? { ...c, checked: true } : c
        ),
      };
      const plan = scriptedPlan(checkedSnapshot, payload);
      const certifyStep = plan.steps.find((s) => s.target.name === 'I certify that this expense complies with the ASUC Finance Policy');
      expect(certifyStep).toBeUndefined();
    });

    it('skips textbox if value already matches payload', () => {
      const filledSnapshot: FormSnapshot = {
        ...snapshot,
        controls: snapshot.controls.map((c) => (c.name === 'Amount (USD)' ? { ...c, value: '48.73' } : c)),
      };
      const plan = scriptedPlan(filledSnapshot, payload);
      const amountStep = plan.steps.find((s) => s.target.name === 'Amount (USD)');
      expect(amountStep).toBeUndefined();
    });
  });
});
