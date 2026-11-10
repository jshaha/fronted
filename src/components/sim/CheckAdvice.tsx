'use client';
/**
 * Two fixed words, two visually distinct panels:
 *   Check  — from code, can block, cites a rule.
 *   Advice — from Claude, never blocks, cites sources (verified by code).
 */
import { useId, useState } from 'react';
import type { RequestView } from '@/lib/view';
import type { RenderedReason } from '@/lib/types';
import { Icon, IdChip, OutcomeMark, VERDICT_META, VerdictPill, cx } from '@/components/ui';

export function CheckPanel({ req, compact }: { req: RequestView; compact?: boolean }) {
  const rules = req.rules;
  const failed = rules.find((r) => r.outcome !== 'pass');
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-check-line bg-check-bg">
      <div className="flex items-center gap-2 border-b border-check-line px-3 py-2">
        <Icon.Ruler size={15} className="text-ink-2" />
        <h4 className="text-[13px] font-semibold">Check</h4>
        <span className="text-[11.5px] text-muted">code · can block</span>
        <span className="ml-auto text-[11.5px] font-medium">
          {rules.length === 0 ? (
            <span className="text-muted">Not run</span>
          ) : failed ? (
            <span className={failed.outcome === 'fail' ? 'text-fail' : 'text-warn'}>{failed.outcome === 'fail' ? 'Blocked' : 'Needs info'}</span>
          ) : (
            <span className="text-pass">{rules.length} of {rules.length} passed</span>
          )}
        </span>
      </div>
      <ul className={cx('divide-y divide-[color:var(--check-line)]', compact && 'text-[12.5px]')}>
        {rules.map((r) => (
          <li key={r.id} className={cx('flex gap-2.5 px-3 py-2', r.outcome !== 'pass' && (r.outcome === 'fail' ? 'bg-fail-bg' : 'bg-warn-bg'))}>
            <span className="mt-0.5">
              <OutcomeMark outcome={r.outcome} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <IdChip tone={r.outcome === 'pass' ? 'neutral' : r.outcome === 'fail' ? 'fail' : 'warn'}>{r.ruleId}</IdChip>
                <span className="text-[11px] uppercase tracking-wide text-faint">Tier {r.tier}</span>
                <span className="ml-auto truncate font-mono text-[11px] text-muted">{r.citation}</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2 break-words">{r.message}</p>
              {r.suggestion && r.outcome !== 'pass' && <p className="mt-1 text-[13px] font-medium leading-snug text-ink">Fix: {r.suggestion}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CiteChip({ cite, open, onToggle, controls }: { cite: { type: string; id: string; label: string; detail: string }; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      title={cite.detail}
      className={cx(
        'inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 font-mono text-[11.5px] font-medium ring-1 ring-inset transition-colors duration-150',
        open ? 'bg-[color:var(--advice-accent)] text-white ring-transparent' : 'bg-surface text-advice-ink ring-[color:var(--advice-line)] hover:ring-[color:var(--advice-accent)]',
      )}
    >
      <span className="sr-only">{cite.type === 'past_spending' ? 'Precedent' : cite.type === 'rule' ? 'Rule' : 'Number'} </span>
      {cite.label}
    </button>
  );
}

function Reason({ reason, index }: { reason: RenderedReason; index: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const uid = useId();
  const open = reason.cites.find((c) => c.id === openId);
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[3px] grid size-4.5 shrink-0 place-items-center rounded-full bg-surface font-mono text-[10.5px] font-semibold text-advice-ink ring-1 ring-[color:var(--advice-line)]">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-ink break-words">{reason.text}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {reason.cites.map((c) => (
            <CiteChip key={`${c.type}:${c.id}`} cite={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} controls={`${uid}-detail`} />
          ))}
        </div>
        <div id={`${uid}-detail`} aria-live="polite">
          {open && (
            <div className="mt-2 rounded-lg border border-advice-line bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink-2 animate-rise">
              <span className="font-mono font-semibold text-advice-ink">{open.label}</span> <span className="text-muted">· {open.type === 'past_spending' ? 'precedent' : open.type === 'rule' ? 'criterion / rule' : 'computed by code'}</span>
              <p className="mt-0.5 break-words">{open.detail}</p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function AdvicePanel({ req, compact }: { req: RequestView; compact?: boolean }) {
  const rec = req.recommendation;
  const blocked = req.rules.some((r) => r.outcome !== 'pass');
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-advice-line bg-advice-bg">
      <div className="flex items-center gap-2 border-b border-advice-line px-3 py-2">
        <Icon.Sparkle size={15} className="text-advice-accent" />
        <h4 className="text-[13px] font-semibold text-advice-ink">Advice</h4>
        <span className="text-[11.5px] text-muted">Claude · never blocks</span>
        <span className="ml-auto">{rec && <VerdictPill verdict={rec.verdict} />}</span>
      </div>
      <div className="flex flex-col gap-3 px-3 py-3">
        {!rec ? (
          <p className="text-[13px] text-muted">{blocked ? 'Not asked: a hard rule did not pass, so the Advisor never runs.' : 'Waiting for the Advisor…'}</p>
        ) : (
          <>
            {rec.verdict !== 'unavailable' && <p className="text-[14px] font-medium leading-snug text-ink">{rec.headline}</p>}
            {rec.verdict === 'unavailable' && <p className="text-[13px] text-muted">No recommendation. Nothing the Advisor said survived the citation check, so you decide on the checks alone.</p>}
            {rec.reasons.length > 0 && (
              <ol className="flex flex-col gap-2.5">
                {rec.reasons.map((r, i) => (
                  <Reason key={i} reason={r} index={i} />
                ))}
              </ol>
            )}
            {!compact && (rec.dropped.length > 0 || rec.stats.length > 0) && (
              <div className="flex flex-col gap-1 border-t border-advice-line pt-2">
                {rec.dropped.length > 0 && (
                  <details className="group text-[12.5px]">
                    <summary className="flex min-h-6 cursor-pointer items-center gap-1 text-warn marker:content-none">
                      <Icon.Alert size={13} /> {rec.dropped.length} reason{rec.dropped.length > 1 ? 's' : ''} dropped by the citation check
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1 pl-4">
                      {rec.dropped.map((d, i) => (
                        <li key={i}>
                          <span className="text-muted line-through">{d.text}</span> <span className="text-warn">— {d.why}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {rec.stats.length > 0 && (
                  <details className="text-[12.5px]">
                    <summary className="flex min-h-6 cursor-pointer items-center gap-1 text-muted marker:content-none hover:text-ink">
                      <Icon.Ledger size={13} /> Every number above was computed by code ({rec.stats.length} stats)
                    </summary>
                    <table className="mt-1 w-full text-left">
                      <tbody>
                        {rec.stats.map((s) => (
                          <tr key={s.id} className="border-t border-advice-line/60">
                            <td className="py-1 pr-2 font-mono text-[11.5px] text-advice-ink">{s.id}</td>
                            <td className="py-1 pr-2 text-ink-2">{s.label}</td>
                            <td className="num py-1 text-right font-medium">{s.display}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function verdictTone(v: keyof typeof VERDICT_META) {
  return VERDICT_META[v].tone;
}
