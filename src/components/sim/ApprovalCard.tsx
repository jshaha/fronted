'use client';
import { useRef, useState } from 'react';
import type { RequestView } from '@/lib/view';
import { useApp } from '@/components/AppState';
import { Button, Icon, IdChip, Money, StatusPill } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { prettyYmd } from '@/lib/dates';
import { DEMO } from '@/lib/demoScript';
import { AdvicePanel, CheckPanel } from './CheckAdvice';

export function ApprovalCard({ req, treasurerId, replay }: { req: RequestView; treasurerId: string; replay: boolean }) {
  const { act } = useApp();
  const [note, setNote] = useState('');
  const [saveAsCriterion, setSaveAsCriterion] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDeny, setConfirmDeny] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const open = req.status === 'awaiting_approval';
  const suggested = req.recommendation?.suggestedAmountCents ?? null;
  const showSuggested = suggested != null && req.amountCents != null && suggested < req.amountCents;
  const decision = req.approvals.at(-1);
  const demoNote = req.message === DEMO.gmPizza ? DEMO.gmPizzaNote : null;

  async function approve(amountCents?: number) {
    setBusy(amountCents ? 'approve-suggested' : 'approve');
    await act(`/api/requests/${req.shortId}/approve`, { actorId: treasurerId, note: note.trim() || undefined, amountCents, saveAsCriterion });
    setBusy(null);
  }
  async function deny() {
    setBusy('deny');
    await act(`/api/requests/${req.shortId}/deny`, { actorId: treasurerId, note: note.trim() || undefined, saveAsCriterion });
    setBusy(null);
    setConfirmDeny(false);
  }

  return (
    <article className="w-full min-w-0 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-md" aria-label={`Approval request ${req.shortId}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{req.shortId}</IdChip>
            <span className="text-[12px] text-muted">{req.fundingSource === 'out_of_pocket' ? 'Reimbursement' : 'Card request'}</span>
            <StatusPill status={req.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <Money cents={req.amountCents} className="text-[24px] font-semibold tracking-tight" />
            {req.line && (
              <span className="text-[13.5px] text-ink-2">
                {req.line.name} <span className="font-mono text-[11.5px] text-muted">sheet row {req.line.sourceRow}</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted break-words">
            {req.officer.name}
            {req.event && ` · ${req.event.name}, ${prettyYmd(req.event.date)}`}
            {req.attendeeCount ? ` · ${req.attendeeCount} RSVPs` : ''}
            {req.projectName ? ` · ${req.projectName}` : ''}
          </p>
          <blockquote className="mt-1.5 border-l-2 border-line-strong pl-2.5 text-[13px] italic text-ink-2 break-words">“{req.message}”</blockquote>
        </div>
      </header>

      <div className="grid gap-3 p-3 xl:grid-cols-2">
        <CheckPanel req={req} />
        <AdvicePanel req={req} />
      </div>

      {open ? (
        <form
          className="flex flex-col gap-2.5 border-t border-line bg-surface-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void approve();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`note-${req.shortId}`} className="text-[12.5px] font-medium text-ink-2">
              Note <span className="font-normal text-muted">becomes precedent the Advisor cites next time</span>
            </label>
            {replay && demoNote && note !== demoNote && (
              <button
                type="button"
                className="min-h-6 shrink-0 rounded px-1 text-[12px] font-medium text-advice-ink hover:underline"
                onClick={() => {
                  setNote(demoNote);
                  noteRef.current?.focus();
                }}
              >
                Use demo note
              </button>
            )}
          </div>
          <textarea
            ref={noteRef}
            id={`note-${req.shortId}`}
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void approve();
              }
            }}
            placeholder="e.g. Recruiting GMs can run higher — walk-ins beat RSVPs…"
            className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[16px] leading-snug text-ink placeholder:text-faint sm:text-[14px]"
          />
          <label className="flex min-h-6 w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={saveAsCriterion} onChange={(e) => setSaveAsCriterion(e.target.checked)} className="size-4 accent-[color:var(--advice-accent)]" />
            Also save the note as a standing criterion
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={busy === 'approve'} disabled={!!busy && busy !== 'approve'}>
              <Icon.Check size={15} /> Approve {formatCents(req.amountCents ?? 0)}
            </Button>
            {showSuggested && (
              <Button type="button" variant="advice" loading={busy === 'approve-suggested'} disabled={!!busy} onClick={() => approve(suggested!)}>
                Approve suggested {formatCents(suggested!)}
              </Button>
            )}
            {confirmDeny ? (
              <span className="flex items-center gap-1.5">
                <Button type="button" variant="danger" loading={busy === 'deny'} onClick={deny}>
                  Confirm deny
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDeny(false)} disabled={busy === 'deny'}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmDeny(true)} disabled={!!busy}>
                Deny…
              </Button>
            )}
            <span className="ml-auto hidden text-[11.5px] text-muted lg:inline">
              <kbd className="font-mono">⌘</kbd>&nbsp;<kbd className="font-mono">Enter</kbd> approves
            </span>
          </div>
        </form>
      ) : decision ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-3 text-[13px]">
          {decision.decision === 'approve' ? <Icon.Check size={15} className="text-pass" /> : <Icon.X size={15} className="text-fail" />}
          <span>
            {decision.decision === 'approve' ? 'Approved' : 'Denied'}
            {decision.amountCents != null && decision.decision === 'approve' ? ` ${formatCents(decision.amountCents)}` : ''} by {decision.memberName}
          </span>
          {decision.precedentId && (
            <span className="flex items-center gap-1 text-muted">
              · saved as <IdChip tone="advice">{decision.precedentId}</IdChip>
              {decision.criterionId && (
                <>
                  and <IdChip tone="advice">{decision.criterionId}</IdChip>
                </>
              )}
            </span>
          )}
          {decision.note && <p className="w-full text-ink-2 italic break-words">“{decision.note}”</p>}
        </footer>
      ) : null}
    </article>
  );
}
