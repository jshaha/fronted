/**
 * Code validates every plan before a single keystroke:
 *  - only fill/select/check/upload/click; strict shape, so no free-text "value",
 *    no URLs, no scripts, no navigation (links are not even targetable roles)
 *  - fill/select/upload must reference a FilingPayload field that has a value
 *  - each target (role + accessible name) matches exactly one control in the snapshot
 *  - action ↔ role compatibility; select values must be real options
 */
import { PlanSchema, type FilingPayload, type FormSnapshot, type PortalPlan } from '../types';

const ACTION_ROLE: Record<string, string> = { fill: 'textbox', select: 'combobox', check: 'checkbox', upload: 'file', click: 'button' };
const FORBIDDEN_KEYS = ['value', 'text', 'url', 'href', 'goto', 'navigate', 'script', 'evaluate', 'js', 'selector', 'xpath'];

export type PlanValidation = { ok: true; plan: PortalPlan } | { ok: false; errors: string[] };

export function validatePlan(input: unknown, snapshot: FormSnapshot, payload: FilingPayload): PlanValidation {
  const errors: string[] = [];

  // Friendly errors for the attacks we care most about, before the strict schema.
  const steps = (input as { steps?: unknown })?.steps;
  if (Array.isArray(steps)) {
    steps.forEach((st, i) => {
      if (st && typeof st === 'object') {
        for (const k of FORBIDDEN_KEYS) if (k in st) errors.push(`step ${i + 1}: "${k}" is not allowed — values must come from the payload by reference`);
        const a = (st as { action?: unknown }).action;
        if (typeof a === 'string' && !(a in ACTION_ROLE)) errors.push(`step ${i + 1}: action "${a}" is not allowed`);
      }
    });
  }
  if (errors.length) return { ok: false, errors };

  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || 'plan'}: ${i.message}`) };
  }
  const plan = parsed.data;

  plan.steps.forEach((st, i) => {
    const n = `step ${i + 1} (${st.action} ${st.target.role} "${st.target.name}")`;
    if (ACTION_ROLE[st.action] !== st.target.role) errors.push(`${n}: ${st.action} needs a ${ACTION_ROLE[st.action]}`);
    const needsValue = st.action === 'fill' || st.action === 'select' || st.action === 'upload';
    if (needsValue && !st.value_ref) errors.push(`${n}: must reference a payload field`);
    if (!needsValue && st.value_ref) errors.push(`${n}: ${st.action} takes no value`);
    if (st.value_ref) {
      const v = payload[st.value_ref];
      if (v === undefined || v === '') errors.push(`${n}: payload field ${st.value_ref} has no value`);
    }
    const matches = snapshot.controls.filter((c) => c.role === st.target.role && c.name === st.target.name);
    if (matches.length === 0) errors.push(`${n}: no such control on the page`);
    else if (matches.length > 1) errors.push(`${n}: target is ambiguous (${matches.length} matches)`);
    else if (st.action === 'select' && st.value_ref) {
      const v = payload[st.value_ref];
      if (v && !(matches[0].options ?? []).includes(v)) errors.push(`${n}: "${v}" is not an option`);
    }
  });
  if (plan.submits) {
    const last = plan.steps[plan.steps.length - 1];
    if (last.action !== 'click') errors.push('plan says it submits but does not end with a click');
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan };
}
