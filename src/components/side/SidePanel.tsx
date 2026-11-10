'use client';

import { BudgetPanel } from './BudgetPanel';
import { UnreconciledPanel } from './UnreconciledPanel';
import { TracePanel } from './TracePanel';
import { OrgInputsPanel } from './OrgInputsPanel';

export function SidePanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
      {/* Budget Panel */}
      <div className="flex-shrink-0">
        <BudgetPanel />
      </div>

      {/* Unreconciled Panel */}
      <div className="flex-shrink-0">
        <UnreconciledPanel />
      </div>

      <div className="flex-shrink-0">
        <OrgInputsPanel />
      </div>

      {/* Trace Panel - takes remaining height and scrolls internally */}
      <div className="min-h-[360px] flex-1">
        <TracePanel />
      </div>
    </div>
  );
}
