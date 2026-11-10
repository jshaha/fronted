'use client';
/**
 * Fronted UI primitives. Every frontend file should build from these.
 * Guidelines: docs/web-interface-guidelines.md (focus rings, ≥24px targets,
 * loading buttons keep their label, redundant status cues, tabular numbers).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SVGProps } from 'react';
import { formatCents } from '@/lib/money';
import type { RequestStatus } from '@/lib/types';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ icons */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});
export const Icon = {
  Check: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  ),
  X: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Alert: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 8v5M12 16.5v.01" />
      <path d="M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  ),
  Question: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17v.01" />
    </svg>
  ),
  Sparkle: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  ),
  Ruler: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7l8-4z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  ),
  Card: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  ),
  Receipt: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  Browser: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </svg>
  ),
  Paperclip: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
    </svg>
  ),
  Send: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  External: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  ),
  Reset: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
    </svg>
  ),
  Book: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" />
      <path d="M8 7h7M8 11h5" />
    </svg>
  ),
  Bolt: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
    </svg>
  ),
  Ledger: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}>
      <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  ),
};

/* ---------------------------------------------------------------- buttons */

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin-slow', className)} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'advice' | 'lime';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
  const v = {
    primary: 'bg-brand text-brand-ink hover:opacity-90 active:opacity-100 shadow-sm',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-[color:var(--muted)] shadow-sm',
    ghost: 'text-ink-2 hover:bg-[color:var(--line)] hover:text-ink',
    danger: 'bg-surface text-fail border border-[color:var(--fail)]/35 hover:bg-fail-bg hover:border-[color:var(--fail)]',
    advice: 'bg-advice-bg text-advice-ink border border-advice-line hover:border-[color:var(--advice-accent)]',
    lime: 'bg-lime text-lime-ink hover:brightness-95 shadow-sm',
  }[variant];
  const s = size === 'sm' ? 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg' : 'h-10 px-3.5 text-sm gap-2 rounded-[10px]';
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,border-color,opacity,color,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-55',
        v,
        s,
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

/* ----------------------------------------------------------------- badges */

export function IdChip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'advice' | 'pass' | 'fail' | 'warn'; className?: string }) {
  const t = {
    neutral: 'bg-[color:var(--line)] text-ink-2',
    advice: 'bg-advice-bg text-advice-ink ring-1 ring-inset ring-[color:var(--advice-line)]',
    pass: 'bg-pass-bg text-pass',
    fail: 'bg-fail-bg text-fail',
    warn: 'bg-warn-bg text-warn',
  }[tone];
  return (
    <span translate="no" className={cx('inline-flex items-center rounded-md px-1.5 py-px font-mono text-[11.5px] font-medium leading-5 tracking-tight num', t, className)}>
      {children}
    </span>
  );
}

export function Money({ cents, className }: { cents: number | null | undefined; className?: string }) {
  return <span className={cx('num', className)}>{cents == null ? '—' : formatCents(cents)}</span>;
}

type Tone = 'neutral' | 'pass' | 'fail' | 'warn' | 'info' | 'advice' | 'live';

export const STATUS_META: Record<RequestStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Checking', tone: 'live' },
  needs_info: { label: 'Needs info', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'fail' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'info' },
  denied: { label: 'Denied', tone: 'fail' },
  expired: { label: 'Expired', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'pass' },
  card_issued: { label: 'Card issued', tone: 'pass' },
  purchased: { label: 'Purchased', tone: 'info' },
  receipt_received: { label: 'Receipt received', tone: 'info' },
  receipt_flagged: { label: 'Receipt flagged', tone: 'warn' },
  filing_queued: { label: 'Filing', tone: 'live' },
  filed: { label: 'Filed', tone: 'pass' },
  filing_failed: { label: 'Filing failed', tone: 'fail' },
  needs_human: { label: 'Needs a human', tone: 'warn' },
  closed: { label: 'Filed & closed', tone: 'pass' },
  cancelled: { label: 'Cancelled', tone: 'fail' },
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-[color:var(--line)] text-ink-2',
  pass: 'bg-pass-bg text-pass',
  fail: 'bg-fail-bg text-fail',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  advice: 'bg-advice-bg text-advice-ink',
  live: 'bg-info-bg text-info',
};

export function Pill({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap', TONE_CLASS[tone], className)}>
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full bg-current', tone === 'live' && 'animate-pulse-dot')} />}
      {children}
    </span>
  );
}

export function StatusPill({ status, className }: { status: RequestStatus; className?: string }) {
  const m = STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone };
  return (
    <Pill tone={m.tone} dot className={className}>
      {m.label}
    </Pill>
  );
}

export const VERDICT_META = {
  support: { label: 'Supports', tone: 'pass' as Tone, Icon: Icon.Check },
  caution: { label: 'Caution', tone: 'warn' as Tone, Icon: Icon.Alert },
  against: { label: 'Advises against', tone: 'fail' as Tone, Icon: Icon.X },
  unavailable: { label: 'No recommendation', tone: 'neutral' as Tone, Icon: Icon.Question },
};

export function VerdictPill({ verdict }: { verdict: keyof typeof VERDICT_META }) {
  const m = VERDICT_META[verdict];
  return (
    <Pill tone={m.tone}>
      <m.Icon size={13} />
      {m.label}
    </Pill>
  );
}

/** "Rule result" icon with a text label — never color alone. */
export function OutcomeMark({ outcome }: { outcome: 'pass' | 'fail' | 'needs_info' }) {
  if (outcome === 'pass')
    return (
      <span className="inline-flex items-center gap-1 text-pass">
        <Icon.Check size={14} />
        <span className="sr-only">Pass</span>
      </span>
    );
  if (outcome === 'fail')
    return (
      <span className="inline-flex items-center gap-1 text-fail">
        <Icon.X size={14} />
        <span className="sr-only">Fail</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-warn">
      <Icon.Question size={14} />
      <span className="sr-only">Needs info</span>
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[11px] font-semibold uppercase tracking-[0.08em] text-muted', className)}>{children}</div>;
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
export function Time({ iso, className }: { iso: string; className?: string }) {
  // Rendered client-side only (the simulator is a client component tree), so no hydration mismatch.
  return (
    <time dateTime={iso} className={cx('num', className)} suppressHydrationWarning>
      {timeFmt.format(new Date(iso))}
    </time>
  );
}
