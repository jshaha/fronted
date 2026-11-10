/**
 * Planner: Claude decides WHERE each payload field goes (never WHAT the value is).
 */
import { callClaude } from '../claude/client';
import { FILING_PAYLOAD_FIELDS, PLANNER_SCHEMA_VERSION, PlanSchema, type FilingPayload, type FormSnapshot, type PortalPlan } from '../types';
import { payloadShape } from './payload';
import { renderSnapshot, snapshotFingerprint } from './snapshot';

export const PLANNER_SYSTEM = `You are the form-filling planner of a browser agent that files expense reports in a university portal.
You see a trimmed snapshot of the form's controls (role, accessible name, required, options, current value, error text) and a payload of named fields.
Output a plan: an ordered list of steps. Each step is one of:
- fill (textbox), select (combobox), upload (file), check (checkbox), click (button)
- target: the control's role and its exact accessible name from the snapshot
- value_ref: for fill/select/upload, the NAME of the payload field whose value goes in. You never write values yourself; you cannot type free text, navigate, or run scripts.

Guidance:
- Fill every required control you can map to a payload field; fill optional ones when a payload field clearly matches (e.g. an external reference).
- Select the payment method before anything that depends on it.
- If controls show ERROR text, fix only those controls (choose a better-matching payload field), then submit again.
- Check required certification checkboxes. End with a click on the form's submit button and set submits=true.
- Skip controls whose current value already matches.
Return only JSON matching the schema.`;

export function plannerFixtureKey(snapshot: FormSnapshot, payload: FilingPayload): string {
  return `${snapshot.formVersion}.${payloadShape(payload)}.${snapshotFingerprint(snapshot)}`;
}

export function buildPlannerInput(snapshot: FormSnapshot, payload: FilingPayload): string {
  const fields = FILING_PAYLOAD_FIELDS.filter((f) => payload[f] !== undefined).map((f) => {
    const v = payload[f]!;
    return `- ${f}: ${JSON.stringify(f === 'receipt_file' ? '(image file)' : v.length > 80 ? `${v.slice(0, 77)}…` : v)}`;
  });
  return `FORM SNAPSHOT\n${renderSnapshot(snapshot)}\n\nPAYLOAD FIELDS (reference by name)\n${fields.join('\n')}`;
}

export async function planFill(snapshot: FormSnapshot, payload: FilingPayload) {
  return callClaude<PortalPlan>({
    site: 'planner',
    fixtureKey: plannerFixtureKey(snapshot, payload),
    schemaVersion: PLANNER_SCHEMA_VERSION,
    schema: PlanSchema,
    system: PLANNER_SYSTEM,
    text: buildPlannerInput(snapshot, payload),
    maxTokens: 4096,
  });
}
