'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppState';
import { Button, Icon, Pill, cx } from '@/components/ui';
import type { SimView } from './Simulator';

const VIEWS: { view: SimView; href: string; label: string }[] = [
  { view: 'officer', href: '/officer', label: 'Officer' },
  { view: 'treasurer', href: '/treasurer', label: 'Treasurer' },
  { view: 'all', href: '/simulator', label: 'Side by side' },
];

function ViewSwitch({ view }: { view: SimView }) {
  const { state } = useApp();
  const waiting = state?.requests.filter((r) => r.status === 'awaiting_approval').length ?? 0;
  return (
    <nav aria-label="Switch view" className="flex items-center rounded-lg border border-line bg-[color:var(--surface,transparent)] p-0.5">
      {VIEWS.map((v) => (
        <a
          key={v.view}
          href={v.href}
          aria-current={v.view === view ? 'page' : undefined}
          className={cx(
            'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium',
            v.view === view ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:bg-[color:var(--line)] hover:text-ink',
            v.view === 'all' && 'hidden xl:inline-flex',
          )}
        >
          {v.label}
          {v.view === 'treasurer' && waiting > 0 && (
            <span className="rounded-full bg-[color:var(--lime)] px-1.5 text-[11px] font-semibold tabular-nums text-black" aria-label={`${waiting} waiting`}>
              {waiting}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-brand text-brand-ink shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 4h12M6 4v16M6 11h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="17.5" cy="17.5" r="2.5" fill="var(--lime)" />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight tracking-tight" translate="no">
          Fronted
        </div>
        <div className="truncate text-[12px] leading-tight text-muted">…so nobody has to front it.</div>
      </div>
    </div>
  );
}

export function Header({ view = 'all' }: { view?: SimView }) {
  const { state, act, notify } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = state?.mode;

  async function reset() {
    setBusy(true);
    const r = await act('/api/dev/reset');
    setBusy(false);
    setConfirming(false);
    if (r.ok) notify('Demo reset: fresh Neurotech@Berkeley data.', 'info');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color:var(--bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--bg)]/70">
      <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-3 px-[max(16px,env(safe-area-inset-left))]">
        <Wordmark />
        <div className="mx-2 hidden h-6 w-px bg-line md:block" aria-hidden />
        <div className="hidden min-w-0 items-center gap-1.5 md:flex" aria-label="Run mode">
          {state?.org && <span className="truncate text-[13px] font-medium text-ink-2">{state.org.name}</span>}
          {m && (
            <>
              <Pill tone={m.claude === 'live' ? 'advice' : 'neutral'} className="font-mono" dot={m.claude === 'live'}>
                <span translate="no">Claude · {m.claude}</span>
              </Pill>
              <Pill className="hidden font-mono 2xl:inline-flex">
                <span translate="no">portal · {m.portalRunner}</span>
              </Pill>
              <Pill className="hidden font-mono 2xl:inline-flex">
                <span translate="no">issuer · {m.issuer}</span>
              </Pill>
            </>
          )}
        </div>
        <div className="ml-auto">
          <ViewSwitch view={view} />
        </div>
        <nav className="flex items-center gap-1.5" aria-label="Demo tools">
          <a
            href="/mock-portal/submissions"
            target="_blank"
            rel="noreferrer"
            className="hidden h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-[color:var(--line)] hover:text-ink 2xl:inline-flex"
          >
            ASUC portal (mock)
            <Icon.External size={14} />
          </a>
          {confirming ? (
            <div className="flex items-center gap-1.5 animate-rise">
              <span className="hidden text-[13px] text-muted sm:inline">Wipe all requests?</span>
              <Button size="sm" variant="danger" loading={busy} onClick={reset}>
                Reset demo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className={cx('text-ink-2')}>
              <Icon.Reset size={14} />
              Reset…
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
