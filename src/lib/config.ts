/**
 * Central configuration. Every switch the brief names lives here.
 * Read lazily so tests and scripts can set process.env before first use.
 */
export type ClaudeMode = 'live' | 'replay';
export type PortalRunner = 'simulated' | 'headed' | 'headless';
export type ClaudeSite = 'extractor' | 'receipt' | 'advisor' | 'planner';

const DEFAULT_MODEL = 'claude-sonnet-5-5';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get claudeMode(): ClaudeMode {
    return process.env.CLAUDE_MODE === 'live' ? 'live' : 'replay';
  },
  /** When live, also write every response to fixtures/replays (npm run record). */
  get recordReplays(): boolean {
    return process.env.CLAUDE_RECORD === '1';
  },
  get refusalFallback(): boolean {
    return process.env.CLAUDE_REFUSAL_FALLBACK === '1';
  },
  model(site: ClaudeSite): string {
    const key = `CLAUDE_MODEL_${site.toUpperCase()}`;
    return process.env[key] || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  },
  get replayLatencyMs(): number {
    return int('REPLAY_LATENCY_MS', 450);
  },
  get portalRunner(): PortalRunner {
    const v = process.env.PORTAL_RUNNER;
    return v === 'headed' || v === 'headless' ? v : 'simulated';
  },
  get portalUrl(): string {
    return process.env.PORTAL_URL || `http://localhost:${process.env.PORT || 3000}/mock-portal`;
  },
  get portalAllowedOrigins(): string[] {
    const raw = process.env.PORTAL_ALLOWED_ORIGINS;
    if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
    const port = process.env.PORT || 3000;
    return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  },
  get portalStepDelayMs(): number {
    return int('PORTAL_STEP_DELAY_MS', 350);
  },
  get issuer(): 'mock' {
    return 'mock';
  },
  get cardBufferPct(): number {
    return int('CARD_BUFFER_PCT', 20);
  },
  get receiptToleranceCents(): number {
    return int('RECEIPT_TOLERANCE_CENTS', 50);
  },
  get dbPath(): string {
    return process.env.DB_PATH || 'data/fronted.sqlite';
  },
  /** Approval requests expire after this many hours. */
  approvalTtlHours: 24,
  /** Card expires this many days after the event (or after approval when no event). */
  cardExpiryDaysAfterEvent: 2,
  /** Precedent rows the Advisor sees (same line + purpose tag). */
  precedentWindow: 12,
  /** Max agent rounds (snapshot → plan → execute) per filing attempt. */
  maxPlannerRounds: 4,
} as const;
