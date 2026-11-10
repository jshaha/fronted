'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Icon, IdChip, Pill, Time, cx } from '@/components/ui';
import { useApp } from '@/components/AppState';
import { TraceDetails } from './TraceDetails';
import { ScreenshotDialog } from './ScreenshotDialog';
import type { AuditView } from '@/lib/view';

const KIND_META: Record<string, { icon: React.ReactNode; label: string; tone: 'neutral' | 'pass' | 'fail' | 'warn' | 'info' | 'advice' | 'live' }> = {
  claude: { icon: <Icon.Sparkle size={18} />, label: 'Claude', tone: 'advice' },
  rules: { icon: <Icon.Ruler size={18} />, label: 'Check', tone: 'check-ink' as any },
  advice: { icon: <Icon.Sparkle size={18} />, label: 'Advice', tone: 'advice' },
  transition: { icon: <Icon.Bolt size={18} />, label: 'State', tone: 'neutral' },
  echo: { icon: <Icon.Check size={18} />, label: 'Read-back', tone: 'neutral' },
  approval: { icon: <Icon.Check size={18} />, label: 'Approval', tone: 'pass' },
  card: { icon: <Icon.Card size={18} />, label: 'Card', tone: 'neutral' },
  issuer_event: { icon: <Icon.Card size={18} />, label: 'Card event', tone: 'neutral' },
  receipt: { icon: <Icon.Receipt size={18} />, label: 'Receipt', tone: 'neutral' },
  filing: { icon: <Icon.Browser size={18} />, label: 'Filing', tone: 'info' },
  browser: { icon: <Icon.Browser size={18} />, label: 'Browser', tone: 'info' },
  ledger: { icon: <Icon.Ledger size={18} />, label: 'Ledger', tone: 'neutral' },
  learning: { icon: <Icon.Book size={18} />, label: 'Learning', tone: 'neutral' },
  error: { icon: <Icon.Alert size={18} />, label: 'Error', tone: 'fail' },
  request: { icon: <Icon.Send size={18} />, label: 'Request', tone: 'neutral' },
};

export function TracePanel() {
  const { state } = useApp();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [showOlderLimit, setShowOlderLimit] = useState(120);
  const [screenshotOpen, setScreenshotOpen] = useState<string | null>(null);
  const [triggerRef, setTriggerRef] = useState<HTMLButtonElement | null>(null);

  const selectedFilter = searchParams.get('trace') || 'all';

  const filteredAudit = state?.audit.filter((a) => selectedFilter === 'all' || a.requestShortId === selectedFilter) || [];
  const displayedAudit = filteredAudit.slice(Math.max(0, filteredAudit.length - showOlderLimit));

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams);
    if (filter === 'all') {
      params.delete('trace');
    } else {
      params.set('trace', filter);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const requestShortIds = Array.from(new Set(state?.audit.map((a) => a.requestShortId).filter(Boolean) as string[])).sort((a, b) =>
    parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])
  );

  if (!state) return null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface rounded-2xl border border-line shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">Agent trace</h2>
          <Pill tone="live" dot>
            Live
          </Pill>
        </div>
        <span className="text-xs text-muted num">{filteredAudit.length}</span>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 pt-4 pb-2 flex-shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => handleFilterChange('all')}
          aria-pressed={selectedFilter === 'all'}
          className={cx(
            'inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150',
            selectedFilter === 'all'
              ? 'bg-brand text-brand-ink shadow-sm'
              : 'bg-[color:var(--line)] text-ink-2 hover:bg-[color:var(--line-strong)]'
          )}
        >
          All
        </button>
        {requestShortIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => handleFilterChange(id)}
            aria-pressed={selectedFilter === id}
            className={cx(
              'inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium font-mono transition-colors duration-150',
              selectedFilter === id
                ? 'bg-brand text-brand-ink shadow-sm'
                : 'bg-[color:var(--line)] text-ink-2 hover:bg-[color:var(--line-strong)]'
            )}
          >
            {id}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="pane-scroll overflow-y-auto flex-1 min-h-0 px-4 pb-4">
        {displayedAudit.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
            <p className="text-sm">Nothing yet. Ask something in the officer chat.</p>
          </div>
        ) : (
          <ul className="space-y-3 pt-4">
            {displayedAudit.map((entry) => (
              <li key={entry.id} className="animate-rise">
                <TraceEntry entry={entry} onScreenshot={(src) => setScreenshotOpen(src)} onTriggerRef={setTriggerRef} />
              </li>
            ))}
          </ul>
        )}

        {filteredAudit.length > showOlderLimit && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() => setShowOlderLimit((s) => s + 120)}
              className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-[color:var(--line)] rounded-lg transition-colors duration-150"
            >
              Show older ({filteredAudit.length - showOlderLimit})
            </button>
          </div>
        )}
      </div>

      <ScreenshotDialog
        src={screenshotOpen}
        alt="Portal screenshot"
        onClose={() => {
          setScreenshotOpen(null);
          triggerRef?.focus();
        }}
      />
    </div>
  );
}

interface TraceEntryProps {
  entry: AuditView;
  onScreenshot: (src: string) => void;
  onTriggerRef: (ref: HTMLButtonElement) => void;
}

const TONE_COLORS: Record<string, string> = {
  neutral: 'text-ink-2',
  pass: 'text-pass',
  fail: 'text-fail',
  warn: 'text-warn',
  info: 'text-info',
  advice: 'text-advice-ink',
  live: 'text-info',
};

function TraceEntry({ entry, onScreenshot, onTriggerRef }: TraceEntryProps) {
  const meta = KIND_META[entry.kind] || { icon: <Icon.Question size={18} />, label: entry.kind, tone: 'neutral' as const };

  const latencyStr = entry.latencyMs
    ? entry.latencyMs < 1000
      ? `${entry.latencyMs} ms`
      : `${(entry.latencyMs / 1000).toFixed(1)} s`
    : null;

  return (
    <div className="space-y-2">
      <div className="flex gap-3 items-start min-w-0">
        {/* Icon tile */}
        <div
          className={cx(
            'size-7 rounded-lg flex items-center justify-center flex-shrink-0',
            entry.kind === 'learning' && 'bg-lime text-lime-ink',
            entry.kind === 'rules' && 'bg-check-bg text-check-ink',
            !['learning', 'rules'].includes(entry.kind) && TONE_COLORS[meta.tone]
          )}
        >
          {meta.icon}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ink break-words font-medium">{entry.title}</div>

          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted mt-0.5">
            {entry.requestShortId && (
              <>
                <IdChip>{entry.requestShortId}</IdChip>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{meta.label}</span>
            {entry.model && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono text-[11px]">{entry.model}</span>
              </>
            )}
            {entry.mode && (
              <>
                <span aria-hidden>·</span>
                <Pill tone={entry.mode === 'live' ? 'advice' : 'neutral'}>{entry.mode}</Pill>
              </>
            )}
            {latencyStr && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono num">{latencyStr}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <Time iso={entry.createdAt} />
          </div>
        </div>
      </div>

      {/* Screenshot thumbnail */}
      {entry.screenshot ? (
        <button
          type="button"
          ref={(el) => {
            if (el) onTriggerRef(el);
          }}
          onClick={() => onScreenshot(`/api/screenshots/${entry.screenshot!}`)}
          className="block rounded-lg border border-line overflow-hidden hover:shadow-md transition-shadow duration-150 focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--focus)]"
          aria-label={`Portal screenshot: ${entry.title}`}
        >
          { }
          <img
            src={`/api/screenshots/${entry.screenshot}`}
            width={160}
            height={110}
            loading="lazy"
            alt=""
            className="w-40 h-[68.75px] object-cover object-top"
          />
        </button>
      ) : null}

      {/* Details */}
      {entry.data ? (
        <details className="group">
          <summary className="flex items-center justify-center cursor-pointer h-6 text-muted text-[12px] hover:text-ink transition-colors duration-150 focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--focus)] rounded-md">
            Details
          </summary>
          <div className="mt-2 pt-2 border-t border-[color:var(--line)]">
            <TraceDetails entry={entry} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
