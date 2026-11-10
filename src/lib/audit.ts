/** audit_log: every tool call, rule result, advice, transition and browser step. */
import { getDb } from './db/client';
import { auditLog } from './db/schema';
import { nowIso } from './clock';

export type AuditKind =
  | 'request'
  | 'claude'
  | 'echo'
  | 'rules'
  | 'advice'
  | 'transition'
  | 'approval'
  | 'card'
  | 'issuer_event'
  | 'receipt'
  | 'filing'
  | 'browser'
  | 'ledger'
  | 'learning'
  | 'error';

export type AuditInput = {
  requestId?: number | null;
  traceId?: string | null;
  kind: AuditKind;
  title: string;
  site?: string;
  model?: string;
  mode?: string;
  latencyMs?: number;
  data?: unknown;
  screenshot?: string;
};

export function audit(e: AuditInput): number {
  const res = getDb()
    .insert(auditLog)
    .values({
      requestId: e.requestId ?? null,
      traceId: e.traceId ?? null,
      kind: e.kind,
      title: e.title,
      site: e.site ?? null,
      model: e.model ?? null,
      mode: e.mode ?? null,
      latencyMs: e.latencyMs ?? null,
      dataJson: e.data === undefined ? null : JSON.stringify(e.data),
      screenshot: e.screenshot ?? null,
      createdAt: nowIso(),
    })
    .run();
  return Number(res.lastInsertRowid);
}
