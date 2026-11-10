'use client';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { MessageView } from '@/lib/view';
import { cx, Time } from '@/components/ui';

export function PaneShell({
  id,
  title,
  subtitle,
  icon,
  actions,
  children,
  composer,
  className,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  composer?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cx('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm', className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[color:var(--line)] text-ink-2">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="truncate text-[14px] font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle && <div className="truncate text-[12px] text-muted">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
      {composer && <div className="border-t border-line bg-surface-2 p-3">{composer}</div>}
    </section>
  );
}

/** Message list that sticks to the bottom while the user is near it. */
export function MessageList({
  messages,
  render,
  empty,
  typing,
  label,
}: {
  messages: MessageView[];
  render: (m: MessageView) => ReactNode;
  empty: ReactNode;
  typing?: string | null;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastCount = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (messages.length !== lastCount.current || typing) {
      if (nearBottom.current) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ top: el.scrollHeight, behavior: lastCount.current === 0 || reduce ? 'auto' : 'smooth' });
      }
      lastCount.current = messages.length;
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={ref} className="pane-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-label={label} aria-live="polite" aria-relevant="additions">
      {messages.length === 0 ? (
        <div className="grid h-full place-items-center text-center">{empty}</div>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="animate-rise">
              {render(m)}
            </li>
          ))}
          {typing && (
            <li className="flex items-center gap-2 pl-9 text-[13px] text-muted" aria-live="polite">
              <span className="flex gap-1" aria-hidden>
                <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
                <span className="size-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:300ms]" />
              </span>
              {typing}
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

export function AgentAvatar() {
  return (
    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-brand text-brand-ink">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M6 4h12M6 4v16M6 11h8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Bubble({ m, authorName, children }: { m: MessageView; authorName: string; children?: ReactNode }) {
  const mine = m.author === 'member';
  if (mine) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-baseline gap-2 text-[11.5px] text-muted">
          <span>{authorName}</span>
          <Time iso={m.createdAt} />
        </div>
        {m.body && <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-brand px-3.5 py-2 text-[14px] leading-snug text-brand-ink break-words whitespace-pre-wrap">{m.body}</div>}
        {children}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <AgentAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2 text-[11.5px] text-muted">
          <span className="font-medium text-ink-2" translate="no">
            Fronted
          </span>
          {m.requestShortId && <span className="font-mono">{m.requestShortId}</span>}
          <Time iso={m.createdAt} />
        </div>
        <p className="max-w-[95%] text-[14px] leading-relaxed text-ink break-words">{m.body}</p>
        {children}
      </div>
    </div>
  );
}
