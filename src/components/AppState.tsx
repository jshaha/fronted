'use client';
/**
 * Polls /api/state (1s, paused while the tab is hidden) and exposes `act()` for
 * mutations. Errors surface as a polite toast; nothing fails silently.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState } from '@/lib/view';

type Toast = { id: number; tone: 'error' | 'info'; text: string };

type Ctx = {
  state: AppState | null;
  loadError: string | null;
  refresh: () => Promise<void>;
  act: (path: string, body?: unknown) => Promise<{ ok: boolean; data: Record<string, unknown> }>;
  toasts: Toast[];
  dismiss: (id: number) => void;
  notify: (text: string, tone?: Toast['tone']) => void;
};

const AppStateCtx = createContext<Ctx | null>(null);

export function AppStateProvider({ children, initial }: { children: ReactNode; initial?: AppState | null }) {
  const [state, setState] = useState<AppState | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const inflight = useRef(false);
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setState((await r.json()) as AppState);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      inflight.current = false;
    }
  }, []);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'error') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const act = useCallback(
    async (path: string, body?: unknown) => {
      // Refresh while the request runs so intermediate steps (extraction, rules…) stream in.
      const ticker = setInterval(() => void refresh(), 400);
      try {
        const init: RequestInit = { method: 'POST' };
        if (body instanceof FormData) init.body = body;
        else if (body !== undefined) {
          init.body = JSON.stringify(body);
          init.headers = { 'content-type': 'application/json' };
        }
        const r = await fetch(path, init);
        const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) notify(String(data.error ?? `Request failed (HTTP ${r.status})`));
        return { ok: r.ok, data };
      } catch (e) {
        notify(`Network error: ${(e as Error).message}`);
        return { ok: false, data: {} };
      } finally {
        clearInterval(ticker);
        await refresh();
      }
    },
    [notify, refresh],
  );

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const value = useMemo(() => ({ state, loadError, refresh, act, toasts, dismiss, notify }), [state, loadError, refresh, act, toasts, dismiss, notify]);
  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppStateCtx);
  if (!c) throw new Error('useApp outside AppStateProvider');
  return c;
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${t.tone === 'error' ? 'border-[color:var(--fail)]/30 bg-surface text-ink' : 'border-line bg-surface text-ink'}`}
        >
          <span className={`mt-1 size-2 shrink-0 rounded-full ${t.tone === 'error' ? 'bg-fail' : 'bg-info'}`} aria-hidden />
          <p className="min-w-0 flex-1 break-words">{t.text}</p>
          <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded-md p-1 text-muted hover:text-ink" aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
