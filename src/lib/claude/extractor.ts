/**
 * Extractor: Claude reads the officer's message into fields. Code then verifies
 * (amount text appears verbatim, line name exists) and does every conversion.
 */
import { callClaude } from './client';
import { slugify } from './client';
import { EXTRACTOR_SCHEMA_VERSION, ExtractionSchema, PURPOSE_TAGS, type Extraction } from '../types';

export const EXTRACTOR_SYSTEM = `You read one message from a student-org officer to their treasury assistant and extract structured fields. You never decide anything and never compute anything.

Rules:
- amount_text: copy the money amount EXACTLY as the officer wrote it (e.g. "$50", "86.40"). Do not reformat, round or convert. null if there is no amount.
- intent: "pre_approval" if they ask before buying; "reimbursement" if they already paid and want money back; otherwise "other".
- budget_line: one of the org's line names exactly as given in the input, or null if unclear.
- purpose_tag: pick the closest tag from the allowed list. gm_food = food for a general meeting (GM).
- event_phrase: copy the phrase that names the event exactly as written (e.g. "Thursday's GM"), or null. event_type: gm, workshop, social, tabling, other, or null.
- attendee_count: only if the officer states a number of people. Do not infer it.
- items: the things being bought, as short nouns.
- project_name: only for hardware/project purchases, the project as the officer names it.
- missing: names of fields you could not find among amount, purpose, budget_line, event, attendee_count, project_name.
Return only JSON matching the schema.`;

export type ExtractorOrgContext = { lineNames: string[]; orgName: string };

export function extractorFixtureKey(message: string): string {
  return slugify(message);
}

export async function extractRequest(message: string, org: ExtractorOrgContext) {
  const text = [
    `Org: ${org.orgName}`,
    `Budget lines: ${org.lineNames.map((n) => JSON.stringify(n)).join(', ')}`,
    `Allowed purpose_tag values: ${PURPOSE_TAGS.join(', ')}`,
    '',
    'Officer message:',
    `"""${message}"""`,
  ].join('\n');
  return callClaude<Extraction>({
    site: 'extractor',
    fixtureKey: extractorFixtureKey(message),
    schemaVersion: EXTRACTOR_SCHEMA_VERSION,
    schema: ExtractionSchema,
    system: EXTRACTOR_SYSTEM,
    text,
  });
}
