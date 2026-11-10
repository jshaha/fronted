/**
 * Scripted fallback plan: a deterministic label → payload mapping used when the
 * planner's output fails validation twice (or PLANNER=scripted). Same validator.
 */
import { PORTAL_FIELDS, SUBMIT_BUTTON_LABEL } from '../mockPortal/fields';
import type { FilingPayload, FormSnapshot, PortalPlan, PlanStep } from '../types';

export function scriptedPlan(snapshot: FormSnapshot, payload: FilingPayload): PortalPlan {
  const steps: PlanStep[] = [];
  const byLabel = new Map(PORTAL_FIELDS.map((f) => [f.label, f]));
  // Payment method first so conditional fields can appear on the next round.
  const ordered = [...snapshot.controls].sort((a, b) => (a.name === 'Payment Method' ? -1 : b.name === 'Payment Method' ? 1 : 0));
  for (const c of ordered) {
    const f = byLabel.get(c.name);
    if (!f) continue;
    if (c.role === 'checkbox') {
      if (!c.checked) steps.push({ action: 'check', target: { role: 'checkbox', name: c.name }, why: 'certification' });
      continue;
    }
    const field = f.payloadField;
    if (!field || payload[field] === undefined || payload[field] === '') continue;
    if (c.role === 'textbox' && c.value === payload[field]) continue;
    if (c.role === 'combobox' && c.value === payload[field]) continue;
    if (c.role === 'file' && c.value) continue;
    const action = c.role === 'combobox' ? 'select' : c.role === 'file' ? 'upload' : 'fill';
    steps.push({ action, target: { role: c.role, name: c.name }, value_ref: field, why: 'scripted mapping' });
  }
  steps.push({ action: 'click', target: { role: 'button', name: SUBMIT_BUTTON_LABEL }, why: 'submit' });
  return { steps, submits: true, notes: 'scripted fallback plan' };
}
