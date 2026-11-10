'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { IdChip, Icon, Money, SectionLabel, cx } from '@/components/ui';
import { useApp } from '@/components/AppState';

export function BudgetPanel() {
  const { state } = useApp();
  const prevRemainingRef = useRef<Record<string, number>>({});
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  // Track which lines changed to trigger flash animation
  useEffect(() => {
    if (!state) return;

    const newFlashing = new Set<string>();
    for (const line of state.budget.lines) {
      const prev = prevRemainingRef.current[line.id];
      if (prev !== undefined && prev !== line.remaining) {
        newFlashing.add(line.id);
      }
      prevRemainingRef.current[line.id] = line.remaining;
    }

    if (newFlashing.size > 0) {
      const timer = setTimeout(() => {
        setFlashingIds(newFlashing);
        setTimeout(() => setFlashingIds(new Set()), 1600);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!state) return null;

  const totalLeft = state.budget.lines.reduce((sum, line) => sum + line.remaining, 0);
  const semester = state.org?.semester || 'FA26';

  return (
    <div className="flex flex-col bg-surface rounded-2xl border border-line shadow-sm">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 p-4 border-b border-line">
        <h2 className="text-sm font-semibold text-ink">Budget</h2>
        <span className="text-xs text-muted">{semester} · from the budget sheet</span>
      </div>

      {/* Lines */}
      <div className="divide-y divide-[color:var(--line)]">
        {state.budget.lines.map((line) => (
          <BudgetLine
            key={line.id}
            line={line}
            isFlashing={flashingIds.has(line.id)}
          />
        ))}
      </div>

      {/* Total footer */}
      <div className="flex items-baseline justify-between gap-3 p-4 border-t border-line bg-surface-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Total left</span>
        <Money cents={totalLeft} className="text-xl tracking-tight font-medium" />
      </div>
    </div>
  );
}

interface BudgetLineProps {
  line: {
    id: string;
    name: string;
    sourceRow: number;
    allocated: number;
    spent: number;
    committed: number;
    remaining: number;
  };
  isFlashing: boolean;
}

function BudgetLine({ line, isFlashing }: BudgetLineProps) {
  const spentFraction = Math.min(1, line.allocated > 0 ? line.spent / line.allocated : 0);
  const committedFraction = Math.min(1, line.allocated > 0 ? line.committed / line.allocated : 0);
  const totalUsedFraction = Math.min(1, (line.spent + line.committed) / (line.allocated || 1));

  return (
    <div className="p-4 space-y-3">
      {/* Title and ID */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h3 className="text-sm text-ink font-medium min-w-0 truncate">{line.name}</h3>
        <IdChip>sheet row {line.sourceRow}</IdChip>
      </div>

      {/* Remaining amount (with flash animation) */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted uppercase tracking-[0.08em] font-medium">left</span>
        <div key={isFlashing ? 'flash' : 'static'} className={cx('text-lg font-medium tracking-tight num', isFlashing && 'animate-flash')}>
          <Money cents={line.remaining} />
        </div>
      </div>

      {/* Stacked bar chart */}
      <div
        role="img"
        aria-label={`${line.name}: ${(line.spent / 100).toFixed(2)} spent, ${(line.committed / 100).toFixed(2)} committed, ${(line.remaining / 100).toFixed(2)} left of ${(line.allocated / 100).toFixed(2)}`}
        className="h-2 rounded-full bg-[color:var(--line)] overflow-hidden"
      >
        {/* Back layer: spent + committed (info color) */}
        {totalUsedFraction > 0 && (
          <div
            className="h-full bg-info bar-fill"
            style={{ transform: `scaleX(${totalUsedFraction})` }}
            aria-hidden
          />
        )}
        {/* Front layer: spent only (ink color) */}
        {spentFraction > 0 && (
          <div
            className="h-full bg-ink/80 bar-fill"
            style={{ transform: `scaleX(${spentFraction / totalUsedFraction || 1})`, transformOrigin: 'left center' }}
            aria-hidden
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[12px] text-muted">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-ink/80" />
          <span>
            Spent <Money cents={line.spent} />
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-info" />
          <span>
            Committed <Money cents={line.committed} />
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-[color:var(--line)]" />
          <span>
            Allocated <Money cents={line.allocated} />
          </span>
        </div>
      </div>
    </div>
  );
}
