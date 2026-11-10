'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, IdChip, Money, Pill, Button, cx } from '@/components/ui';
import { useApp } from '@/components/AppState';

export function UnreconciledPanel() {
  const { state, act, notify } = useApp();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const prevPrecedentRef = useRef<string | null>(null);
  const [flashingPrecedent, setFlashingPrecedent] = useState(false);

  // Track precedent changes for flash animation
  useEffect(() => {
    if (!state) return;

    const latestId = state.knowledge.latestPrecedent?.id;
    if (latestId && latestId !== prevPrecedentRef.current) {
      prevPrecedentRef.current = latestId;
      const timer = setTimeout(() => {
        setFlashingPrecedent(true);
        setTimeout(() => setFlashingPrecedent(false), 1600);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (latestId) prevPrecedentRef.current = latestId;
  }, [state]);

  if (!state) return null;

  const treasurerMember = state.members.find((m) => m.role === 'treasurer');
  const treasurerId = treasurerMember?.id || '';

  const { totalCents, items } = state.budget.unreconciled;
  const hasOwedBack = items.some((i) => i.resolution === 'owed_back');

  const handleMarkRepaid = async (shortId: string) => {
    setLoadingId(shortId);
    try {
      const result = await act(`/api/requests/${shortId}/repaid`, { actorId: treasurerId });
      if (result.ok) {
        notify('Marked as repaid', 'info');
        setConfirmingId(null);
      }
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col bg-surface rounded-2xl border border-line shadow-sm">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 p-4 border-b border-line">
        <h2 className="text-sm font-semibold text-ink">Unreconciled</h2>
      </div>

      {/* Info */}
      <div className="px-4 pt-4 space-y-2">
        <p className="text-xs text-muted">Spent on a card, not yet filed.</p>
        <div className="flex items-baseline justify-between gap-2">
          <Money cents={totalCents} className="text-2xl font-medium tracking-tight num" />
          {hasOwedBack && <Pill tone="fail">Owed back</Pill>}
        </div>
      </div>

      {/* Items or empty state */}
      <div className="flex-1 px-4 py-3 border-b border-line">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted">
            <Icon.Check size={20} className="text-pass" />
            <p className="text-sm">All card spend is filed.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.shortId} className="flex items-center justify-between gap-2 pb-2 border-b border-[color:var(--line)] last:border-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <IdChip>{item.shortId}</IdChip>
                  </div>
                  <p className="text-xs text-ink truncate">{item.merchantName}</p>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Money cents={item.amountCents} className="text-sm font-medium num" />

                  {item.resolution === 'owed_back' ? (
                    confirmingId === item.shortId ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={loadingId === item.shortId}
                          onClick={() => handleMarkRepaid(item.shortId)}
                          className="text-[12px]"
                        >
                          Confirm
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmingId(null)} disabled={loadingId !== null} className="text-[12px]">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setConfirmingId(item.shortId)} className="text-[12px]">
                        Mark repaid…
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-muted">filing…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Knowledge strip */}
      <div className="px-4 py-3 space-y-2 bg-surface-2">
        <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
          <Icon.Book size={14} />
          <span>
            {state.knowledge.precedents} precedents · {state.knowledge.criteria} criteria
          </span>
        </div>

        {state.knowledge.latestPrecedent && (
          <div className="space-y-1">
            <div className="text-xs text-muted">Newest:</div>
            <div className={cx('space-y-1', flashingPrecedent && 'animate-flash')}>
              <div className="flex items-center gap-2 flex-wrap">
                <IdChip tone="advice">{state.knowledge.latestPrecedent.id}</IdChip>
                <span className="text-xs text-muted">from a treasurer note</span>
              </div>
              {state.knowledge.latestPrecedent.note && (
                <blockquote className="text-xs italic text-muted line-clamp-2 border-l-2 border-advice-line pl-2">
                  &ldquo;{state.knowledge.latestPrecedent.note}&rdquo;
                </blockquote>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
