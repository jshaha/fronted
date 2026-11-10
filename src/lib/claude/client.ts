/**
 * The one door to Claude. Every model call goes through callClaude():
 *  - live:   real API call (official SDK), structured JSON output, zod-validated, one retry.
 *  - replay: reads fixtures/replays/<site>/<fixtureKey>.v<schemaVersion>.json.
 *            A missing recording is a HARD error; a stub with the input is written
 *            to fixtures/replays/_missing/ so it can be recorded or authored.
 *  - record: live + CLAUDE_RECORD=1 writes each validated response as a recording.
 *
 * Recordings are keyed by site + fixtureKey + schemaVersion — never a prompt hash —
 * so prompt edits don't silently orphan them.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config, type ClaudeSite } from '../config';

export const REPLAY_DIR = path.join(process.cwd(), 'fixtures', 'replays');

export type ImageInput = { mediaType: 'image/png' | 'image/jpeg'; base64: string; sha256: string };

export type ClaudeCall<T> = {
  site: ClaudeSite;
  fixtureKey: string;
  schemaVersion: number;
  schema: z.ZodType<T>;
  system: string;
  /** User-turn text. */
  text: string;
  image?: ImageInput;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
};

export type ClaudeResult<T> = {
  data: T;
  model: string;
  mode: 'live' | 'replay';
  latencyMs: number;
  attempts: number;
  fixtureKey: string;
  recordingPath: string;
  usage?: { input_tokens: number; output_tokens: number };
};

export type Recording = {
  site: ClaudeSite;
  fixtureKey: string;
  schemaVersion: number;
  model: string;
  source: 'recorded' | 'hand-authored';
  recordedAt: string;
  latencyMs: number;
  /** Human note for hand-authored recordings: what scenario this covers. */
  scenario?: string;
  output: unknown;
};

export class ReplayMissingError extends Error {
  constructor(
    public site: string,
    public fixtureKey: string,
    public schemaVersion: number,
    public stubPath: string,
  ) {
    super(
      `No replay recording for ${site}/${fixtureKey}.v${schemaVersion}. ` +
        `In replay mode every Claude call must be recorded. Use the suggested demo inputs, ` +
        `or run "npm run record" with ANTHROPIC_API_KEY set. Input stub: ${stubPath}`,
    );
    this.name = 'ReplayMissingError';
  }
}

export class ModelOutputError extends Error {
  constructor(
    public site: string,
    public issues: string,
  ) {
    super(`Claude output for ${site} failed validation twice: ${issues}`);
    this.name = 'ModelOutputError';
  }
}

export function recordingPath(site: string, fixtureKey: string, schemaVersion: number): string {
  return path.join(REPLAY_DIR, site, `${fixtureKey}.v${schemaVersion}.json`);
}

export function shortHash(input: string | Buffer, len = 8): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

/** Lowercase, strip punctuation/apostrophes, collapse to dashes, cap length. */
export function slugify(text: string, max = 80): string {
  const s = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\$(\d+)\.00\b/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > max ? `${s.slice(0, max).replace(/-+$/, '')}-${shortHash(s, 6)}` : s || 'empty';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/* ------------------------------------------------------------------ replay */

function replay<T>(call: ClaudeCall<T>): Promise<ClaudeResult<T>> {
  const file = recordingPath(call.site, call.fixtureKey, call.schemaVersion);
  if (!fs.existsSync(file)) {
    const stubDir = path.join(REPLAY_DIR, '_missing', call.site);
    fs.mkdirSync(stubDir, { recursive: true });
    const stubPath = path.join(stubDir, `${call.fixtureKey}.v${call.schemaVersion}.json`);
    fs.writeFileSync(
      stubPath,
      JSON.stringify(
        {
          site: call.site,
          fixtureKey: call.fixtureKey,
          schemaVersion: call.schemaVersion,
          system: call.system,
          text: call.text,
          image: call.image ? { sha256: call.image.sha256, mediaType: call.image.mediaType } : undefined,
        },
        null,
        2,
      ),
    );
    return Promise.reject(new ReplayMissingError(call.site, call.fixtureKey, call.schemaVersion, stubPath));
  }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as Recording;
  const parsed = call.schema.safeParse(rec.output);
  if (!parsed.success) {
    return Promise.reject(new Error(`Replay recording ${file} does not match schema v${call.schemaVersion}: ${formatIssues(parsed.error)}`));
  }
  const delay = config.replayLatencyMs;
  return sleep(delay).then(() => ({
    data: parsed.data,
    model: rec.model,
    mode: 'replay' as const,
    latencyMs: rec.latencyMs,
    attempts: 1,
    fixtureKey: call.fixtureKey,
    recordingPath: path.relative(process.cwd(), file),
  }));
}

/* -------------------------------------------------------------------- live */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function extractJsonText(msg: Anthropic.Message): string {
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  // Structured outputs return bare JSON; tolerate a fenced block just in case.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text;
}

async function live<T>(call: ClaudeCall<T>): Promise<ClaudeResult<T>> {
  const model = config.model(call.site);
  const userContent: Anthropic.ContentBlockParam[] = [];
  if (call.image) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: call.image.mediaType, data: call.image.base64 } });
  }
  userContent.push({ type: 'text', text: call.text });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];
  const started = Date.now();
  let lastIssues = '';
  let usage: ClaudeResult<T>['usage'];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const params = {
      model,
      max_tokens: call.maxTokens ?? 4096,
      system: call.system,
      messages,
      output_config: { format: zodOutputFormat(call.schema as never), effort: call.effort ?? 'low' },
    };
    const msg = config.refusalFallback
      ? ((await getClient().beta.messages.create({
          ...(params as object),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as never)) as unknown as Anthropic.Message)
      : await getClient().messages.create(params as never);

    usage = { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens };
    if (msg.stop_reason === 'refusal') throw new ModelOutputError(call.site, 'model declined the request (refusal)');

    const raw = extractJsonText(msg);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      lastIssues = 'response was not valid JSON';
      json = undefined;
    }
    if (json !== undefined) {
      const parsed = call.schema.safeParse(json);
      if (parsed.success) {
        const latencyMs = Date.now() - started;
        const file = recordingPath(call.site, call.fixtureKey, call.schemaVersion);
        if (config.recordReplays) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          const rec: Recording = {
            site: call.site,
            fixtureKey: call.fixtureKey,
            schemaVersion: call.schemaVersion,
            model,
            source: 'recorded',
            recordedAt: new Date().toISOString(),
            latencyMs,
            output: parsed.data,
          };
          fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
        }
        return { data: parsed.data, model, mode: 'live', latencyMs, attempts: attempt, fixtureKey: call.fixtureKey, recordingPath: path.relative(process.cwd(), file), usage };
      }
      lastIssues = formatIssues(parsed.error);
    }
    // Retry once, telling the model exactly what failed.
    messages.push({ role: 'assistant', content: raw || '(empty)' });
    messages.push({ role: 'user', content: `That output failed validation: ${lastIssues}. Reply again with JSON that satisfies the schema exactly.` });
  }
  throw new ModelOutputError(call.site, lastIssues);
}

export function callClaude<T>(call: ClaudeCall<T>): Promise<ClaudeResult<T>> {
  return config.claudeMode === 'live' ? live(call) : replay(call);
}
