'use client';
/**
 * Org inputs: the Slack, email, calendar and meeting-notes items the Advisor
 * can cite. Items cited by an open request's advice are marked.
 */
import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppState';
import { cx } from '@/components/ui';

const GLYPH: Record<string, string> = { slack: '#', email: '@', calendar: '◷', notes: '¶' };
const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function when(iso: string): string {
  const days = Math.round((new Date(iso.slice(0, 10)).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime()) / 86_400_000);
  return rel.format(days, 'day');
}

export function OrgInputsPanel() {
  const { state } = useApp();
  const [filter, setFilter] = useState<string>('all');

  const cited = useMemo(() => {
    const ids = new Set<string>();
    for (const r of state?.requests ?? []) {
      if (r.status !== 'awaiting_approval') continue;
      for (const reason of r.recommendation?.reasons ?? []) for (const c of reason.cites) if (c.type === 'signal') ids.add(c.id);
    }
    return ids;
  }, [state?.requests]);

  if (!state) return null;
  const { connectors, items } = state.orgInputs;
  const shown = items.filter((g) => filter === 'all' || g.source === filter);

  return (
    <section aria-labelledby="org-inputs-title" className="flex flex-col rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 pb-3">
        <h2 id="org-inputs-title" className="text-[15px] font-semibold">
          Org inputs
        </h2>
        <span className="text-[12px] text-muted">what the Advisor reads</span>
      </div>

      <div role="group" aria-label="Filter by source" className="flex flex-wrap gap-1.5 px-4 pt-3">
        {[{ id: 'all', label: 'All', count: items.length, scope: 'Every connected source' }, ...connectors].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            title={c.scope}
            className={cx(
              'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-150',
              filter === c.id ? 'border-transparent bg-brand text-brand-ink' : 'border-line-strong text-ink-2 hover:text-ink',
            )}
          >
            {c.id !== 'all' && (
              <span aria-hidden className="font-mono opacity-70">
                {GLYPH[c.id]}
              </span>
            )}
            {c.label}
            <span className="num opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      <p className="px-4 pt-2 text-[11.5px] text-muted">
        Seeded connectors for the demo. A live Slack or Gmail connector writes into the same table.
        {cited.size > 0 && (
          <>
            {' '}
            <span className="font-medium text-ink-2">{cited.size} cited</span> in the advice waiting for you.
          </>
        )}
      </p>

      <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto overscroll-contain p-3" aria-label="Recent org inputs">
        {shown.map((g) => {
          const isCited = cited.has(g.id);
          return (
            <li
              key={g.id}
              className={cx('rounded-xl border px-3 py-2', isCited ? 'border-[color:var(--lime)] bg-[color:var(--lime)]/15' : 'border-line bg-[color:var(--surface-2)]')}
            >
              <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <span aria-hidden className="font-mono text-ink-2">
                  {GLYPH[g.source]}
                </span>
                <span className="font-mono font-semibold text-ink-2" translate="no">
                  {g.id}
                </span>
                <span className="min-w-0 truncate">
                  {g.location} · {g.author}
                </span>
                <time className="ml-auto shrink-0" dateTime={g.sentAt}>
                  {when(g.sentAt)}
                </time>
              </div>
              {g.subject && <p className="mt-0.5 text-[12.5px] font-medium text-ink">{g.subject}</p>}
              <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{g.body}</p>
              {isCited && <p className="mt-1 text-[11px] font-medium text-ink-2">Cited in pending advice</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
