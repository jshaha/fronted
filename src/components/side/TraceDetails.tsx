'use client';

import { IdChip, Icon, OutcomeMark, cx } from '@/components/ui';
import type { AuditView } from '@/lib/view';

export function TraceDetails({ entry }: { entry: AuditView }) {
  return (
    <div className="text-[12px] text-ink space-y-2">
      {entry.kind === 'rules' && <RulesDetails data={entry.data} />}
      {entry.kind === 'advice' && <AdviceDetails data={entry.data} />}
      {entry.kind === 'claude' && <ClaudeDetails data={entry.data} />}
      {entry.kind === 'browser' && <BrowserDetails data={entry.data} />}
      {entry.kind === 'transition' && <TransitionDetails data={entry.data} />}
      {!['rules', 'advice', 'claude', 'browser', 'transition'].includes(entry.kind) && <JSONDetails data={entry.data} />}
    </div>
  );
}

function RulesDetails({ data }: { data: unknown }) {
  const isValid = (d: unknown): d is { outcome: string; results: Array<{ tier: string; ruleId: string; outcome: string; message: string; suggestion?: string; citation: string }> } =>
    typeof d === 'object' && d !== null && 'outcome' in d && 'results' in d && Array.isArray((d as any).results);

  if (!isValid(data)) return <JSONDetails data={data} />;

  return (
    <div className="space-y-2">
      {data.results.map((r, i) => (
        <div key={i} className="space-y-1 pb-2 border-b border-[color:var(--line)] last:border-0 last:pb-0">
          <div className="flex items-center gap-2">
            <OutcomeMark outcome={r.outcome as 'pass' | 'fail' | 'needs_info'} />
            <IdChip tone="neutral">{r.ruleId}</IdChip>
            <span className="text-muted text-[11px]">Tier {r.tier}</span>
          </div>
          <p className="text-[12px]">{r.message}</p>
          {r.citation && <p className="text-muted text-[11.5px]">{r.citation}</p>}
          {r.suggestion && <p className="italic text-[11.5px]">{r.suggestion}</p>}
        </div>
      ))}
    </div>
  );
}

function AdviceDetails({ data }: { data: unknown }) {
  const d = data as any;

  return (
    <div className="space-y-3">
      {Array.isArray(d?.reasons) && d.reasons.length > 0 && (
        <div className="space-y-2">
          <div className="text-muted text-[11px] font-medium">Reasons</div>
          {d.reasons.map((r: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[12px]">{r.text}</p>
              {Array.isArray(r.cites) && r.cites.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {r.cites.map((c: any, j: number) => (
                    <span key={j} title={c.detail}>
                      <IdChip tone="advice">{c.label}</IdChip>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(d?.dropped) && d.dropped.length > 0 && (
        <div className="space-y-1">
          <div className="text-muted text-[11px] font-medium">Dropped</div>
          {d.dropped.map((dr: any, i: number) => (
            <p key={i} className="line-through text-muted text-[12px]">
              {dr.text} <span className="text-[11px]">({dr.why})</span>
            </p>
          ))}
        </div>
      )}

      {Array.isArray(d?.stats) && d.stats.length > 0 && (
        <div className="space-y-1">
          <div className="text-muted text-[11px] font-medium">Stats</div>
          <table className="text-[11.5px] w-full">
            <tbody>
              {d.stats.map((s: any, i: number) => (
                <tr key={i} className="border-b border-[color:var(--line)] last:border-0">
                  <td className="py-1 pr-2">{s.label}</td>
                  <td className="py-1 text-right font-mono text-ink num">{s.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d?.skipped && <p className="italic text-muted text-[12px]">Advisor was not called because a hard rule did not pass.</p>}
    </div>
  );
}

function ClaudeDetails({ data }: { data: unknown }) {
  const d = data as any;
  return (
    <div className="space-y-2">
      {d?.fixtureKey && (
        <div>
          <span className="text-muted text-[11px]">Fixture: </span>
          <span className="font-mono text-[11px]">{d.fixtureKey}</span>
        </div>
      )}
      {d?.recording && (
        <div>
          <span className="text-muted text-[11px]">Recording: </span>
          <span className="font-mono text-[11px] break-words">{d.recording}</span>
        </div>
      )}
      {d?.attempts !== undefined && (
        <div>
          <span className="text-muted text-[11px]">Attempts: </span>
          <span className="font-mono text-[11px]">{d.attempts}</span>
        </div>
      )}
      {d?.output && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto rounded-lg bg-bg-sunken p-2">
          {typeof d.output === 'string' ? d.output : JSON.stringify(d.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function BrowserDetails({ data }: { data: unknown }) {
  const d = data as any;

  return (
    <div className="space-y-2">
      {d?.snapshot && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto rounded-lg bg-bg-sunken p-2">
          {typeof d.snapshot === 'string' ? d.snapshot : JSON.stringify(d.snapshot, null, 2)}
        </pre>
      )}

      {Array.isArray(d?.steps) && d.steps.length > 0 && (
        <div className="space-y-1">
          <div className="text-muted text-[11px] font-medium">Steps</div>
          <ol className="list-decimal list-inside space-y-1 font-mono text-[12px]">
            {d.steps.map((step: string, i: number) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(d?.errors) && d.errors.length > 0 && (
        <div className="space-y-1">
          <div className="text-fail text-[11px] font-medium">Errors</div>
          <ul className="space-y-1 text-fail text-[12px]">
            {d.errors.map((e: string, i: number) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {d?.plan && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto rounded-lg bg-bg-sunken p-2">
          {JSON.stringify(d.plan, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TransitionDetails({ data }: { data: unknown }) {
  const d = data as any;

  return (
    <div className="space-y-2">
      {d?.event && (
        <div className="font-mono text-[12px]">
          <span className="text-muted">{d.event}</span>
          {d?.from && <span className="text-muted"> {d.from}</span>}
          {d?.to && <span className="text-muted"> → {d.to}</span>}
        </div>
      )}

      {Array.isArray(d?.effects) && d.effects.length > 0 && (
        <div className="space-y-1">
          <div className="text-muted text-[11px] font-medium">Effects</div>
          <div className="flex flex-wrap gap-1">
            {d.effects.map((e: string, i: number) => (
              <IdChip key={i} tone="neutral">
                {e}
              </IdChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JSONDetails({ data }: { data: unknown }) {
  return (
    <pre className="text-[11.5px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto rounded-lg bg-bg-sunken p-2">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
