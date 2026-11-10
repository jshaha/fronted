'use client';
import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MessageView, RequestView } from '@/lib/view';
import { useApp } from '@/components/AppState';
import { Button, Icon, cx } from '@/components/ui';
import { OFFICER_SUGGESTIONS, SAMPLE_RECEIPTS } from '@/lib/demoScript';
import { Bubble, MessageList, PaneShell } from './ChatPane';
import { ApprovalCard } from './ApprovalCard';
import { CardBlock, EchoCard, FilingBlock, FlaggedBlock, OutcomeCard, OwedBackBlock, ReceiptBlock } from './RequestCards';

function useRequests() {
  const { state } = useApp();
  return useMemo(() => new Map((state?.requests ?? []).map((r) => [r.shortId, r])), [state?.requests]);
}

/* ------------------------------------------------------------------ officer */

function OfficerAttachment({ m, reqs }: { m: MessageView; reqs: Map<string, RequestView> }) {
  const a = m.attachment;
  if (!a) return null;
  if (a.type === 'image')
    return (
      <a href={a.url} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`}>
        <img src={a.url} alt={`Attached receipt ${a.name}`} width={96} height={110} className="h-[110px] w-24 rounded-lg border border-line object-cover object-top" />
      </a>
    );
  if (a.type === 'echo') return <EchoCard fields={a.fields} />;
  if (a.type === 'error')
    return (
      <p className="rounded-lg border border-[color:var(--warn)]/30 bg-warn-bg px-3 py-2 font-mono text-[12px] text-warn break-all" translate="no">
        {a.detail}
      </p>
    );
  const req = reqs.get(a.requestShortId);
  if (!req) return null;
  switch (a.type) {
    case 'advice':
      return <OutcomeCard req={req} />;
    case 'card':
      return <CardBlock req={req} />;
    case 'receipt':
      return <ReceiptBlock req={req} memberId={req.officer.id} />;
    case 'filing':
      return <FilingBlock req={req} />;
    case 'owed_back':
      return <OwedBackBlock req={req} />;
    default:
      return null;
  }
}

export function OfficerPane() {
  const { state, act } = useApp();
  const reqs = useRequests();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const officers = (state?.members ?? []).filter((m) => m.role === 'officer');
  const memberId = params.get('officer') && officers.some((o) => o.id === params.get('officer')) ? params.get('officer')! : (officers[0]?.id ?? 'm-maya');
  const me = officers.find((o) => o.id === memberId);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replay = state?.mode.claude === 'replay';
  const messages = (state?.messages ?? []).filter((m) => m.pane === 'officer');
  const names = new Map((state?.members ?? []).map((m) => [m.id, m.name]));

  function setOfficer(id: string) {
    const q = new URLSearchParams(params.toString());
    q.set('officer', id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  async function attachSample(name: string) {
    const blob = await (await fetch(`/api/fixtures/receipts/${name}`)).blob();
    setFile(new File([blob], name, { type: 'image/png' }));
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t && !file) {
      inputRef.current?.focus();
      return;
    }
    const fd = new FormData();
    fd.set('memberId', memberId);
    fd.set('text', t);
    if (file) fd.set('image', file);
    setBusy(true);
    setText('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    const r = await act('/api/officer/message', fd);
    setBusy(false);
    if (!r.ok) setText(t);
    inputRef.current?.focus();
  }

  return (
    <PaneShell
      id="officer"
      title={me ? `${me.name}` : 'Officer'}
      subtitle={me ? `${me.title} · asks before buying, sends receipts` : 'Officer'}
      icon={<Icon.Send size={15} />}
      actions={
        officers.length > 1 && (
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className="hidden sm:inline">Acting as</span>
            <select value={memberId} onChange={(e) => setOfficer(e.target.value)} className="h-8 rounded-lg border border-line-strong px-2 text-[13px]" aria-label="Acting as officer">
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )
      }
      composer={
        <form onSubmit={send} className="flex flex-col gap-2">
          {replay && (
            <div className="flex flex-wrap gap-1.5" aria-label="Demo prompts with replay recordings">
              {OFFICER_SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={async () => {
                    setText(s.text);
                    if ('receipt' in s && s.receipt) {
                      if (memberId !== 'm-arjun' && officers.some((o) => o.id === 'm-arjun')) setOfficer('m-arjun');
                      await attachSample(s.receipt);
                    }
                    inputRef.current?.focus();
                  }}
                  className="min-h-7 shrink-0 rounded-full border border-line-strong bg-surface px-2.5 text-[12px] text-ink-2 transition-colors duration-150 hover:border-[color:var(--muted)] hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {file && (
            <div className="flex w-fit items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]">
              <Icon.Receipt size={14} className="text-muted" />
              <span className="max-w-[16rem] truncate">{file.name}</span>
              <button
                type="button"
                className="grid size-6 place-items-center rounded text-muted hover:text-ink"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                <Icon.X size={13} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              id="officer-file"
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label htmlFor="officer-file" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-line-strong bg-surface text-ink-2 hover:text-ink" title="Attach a receipt photo">
              <Icon.Paperclip size={17} />
              <span className="sr-only">Attach a receipt photo</span>
            </label>
            <details className="relative shrink-0">
              <summary className="grid h-10 cursor-pointer place-items-center rounded-[10px] px-2 text-[12px] text-muted marker:content-none hover:text-ink">Samples…</summary>
              <div className="absolute bottom-12 left-0 z-20 flex w-64 flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
                {SAMPLE_RECEIPTS.map((r) => (
                  <button key={r.file} type="button" onClick={(e) => { void attachSample(r.file); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }} className="min-h-8 rounded-lg px-2 text-left text-[13px] hover:bg-[color:var(--line)]">
                    {r.label}
                  </button>
                ))}
              </div>
            </details>
            <input
              ref={inputRef}
              name="message"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Can I spend $50 on pizza for Thursday’s GM…"
              aria-label="Message to Fronted"
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-surface px-3 text-[16px] text-ink placeholder:text-faint sm:text-[14px]"
            />
            <Button type="submit" variant="primary" loading={busy} aria-label="Send message">
              <Icon.Send size={15} />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </form>
      }
    >
      <MessageList
        label="Officer conversation"
        messages={messages}
        typing={busy ? 'Reading, checking rules, asking the Advisor…' : null}
        empty={
          <div className="max-w-xs text-[13.5px] text-muted">
            <p className="font-medium text-ink">Ask before you buy.</p>
            <p className="mt-1">Fronted checks ASUC rules and your budget sheet, gets cited advice from your org’s past decisions, and asks the treasurer once.</p>
          </div>
        }
        render={(m) => (
          <Bubble m={m} authorName={names.get(m.memberId ?? '') ?? 'Officer'}>
            <OfficerAttachment m={m} reqs={reqs} />
          </Bubble>
        )}
      />
    </PaneShell>
  );
}

/* ---------------------------------------------------------------- treasurer */

export function TreasurerPane() {
  const { state, act } = useApp();
  const reqs = useRequests();
  const treasurer = (state?.members ?? []).find((m) => m.role === 'treasurer');
  const tid = treasurer?.id ?? 'm-jordan';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const replay = state?.mode.claude === 'replay';
  const messages = (state?.messages ?? []).filter((m) => m.pane === 'treasurer');
  const pending = (state?.requests ?? []).filter((r) => r.status === 'awaiting_approval').length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setText('');
    const r = await act('/api/treasurer/message', { memberId: tid, text: t });
    setBusy(false);
    if (!r.ok) setText(t);
  }

  return (
    <PaneShell
      id="treasurer"
      title={treasurer ? treasurer.name : 'Treasurer'}
      subtitle={<>Treasurer · approves once{pending ? ` · ${pending} waiting` : ''}</>}
      icon={<Icon.Ruler size={15} />}
      composer={
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            name="command"
            autoComplete="off"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Y R-13 · N R-13 reason…"
            aria-label="Reply to Fronted (Y R-13 to approve)"
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-surface px-3 font-mono text-[16px] text-ink placeholder:font-sans placeholder:text-faint sm:text-[14px]"
          />
          <Button type="submit" variant="secondary" loading={busy}>
            Reply
          </Button>
        </form>
      }
    >
      <MessageList
        label="Treasurer conversation"
        messages={messages}
        empty={
          <div className="max-w-xs text-[13.5px] text-muted">
            <p className="font-medium text-ink">Nothing to approve.</p>
            <p className="mt-1">Requests that pass every check land here with code’s Check and Claude’s Advice side by side.</p>
          </div>
        }
        render={(m) => {
          const a = m.attachment;
          const req = a && 'requestShortId' in a ? reqs.get(a.requestShortId) : undefined;
          return (
            <Bubble m={m} authorName={treasurer?.name ?? 'Treasurer'}>
              {a?.type === 'approval' && req && <ApprovalCard req={req} treasurerId={tid} replay={!!replay} />}
              {a?.type === 'flagged' && req && <FlaggedBlock req={req} treasurerId={tid} />}
              {a?.type === 'owed_back' && req && <OwedBackBlock req={req} treasurerId={tid} />}
              {a?.type === 'filing' && req && <FilingBlock req={req} treasurerId={tid} />}
            </Bubble>
          );
        }}
      />
    </PaneShell>
  );
}

export function PaneTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tabs = [
    ['officer', 'Officer'],
    ['treasurer', 'Treasurer'],
    ['ledger', 'Budget & trace'],
  ] as const;
  return (
    <div role="tablist" aria-label="Panes" className="flex gap-1 rounded-xl border border-line bg-surface p-1 lg:hidden">
      {tabs.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx('h-9 flex-1 rounded-lg text-[13px] font-medium transition-colors duration-150', value === v ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:bg-[color:var(--line)]')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
