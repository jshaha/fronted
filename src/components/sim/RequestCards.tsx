'use client';
/** Cards rendered under agent messages. All read live request state, so they update in place. */
import { useState } from 'react';
import type { RequestView } from '@/lib/view';
import { useApp } from '@/components/AppState';
import { Button, Icon, IdChip, Money, Pill, StatusPill, cx } from '@/components/ui';
import { formatCents, parseMoneyToCents } from '@/lib/money';
import { SAMPLE_RECEIPTS } from '@/lib/demoScript';
import { MERCHANT_CATEGORIES } from '@/lib/card/issuer';
import { CheckPanel, AdvicePanel } from './CheckAdvice';

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });

export function Card({ children, className, tone }: { children: React.ReactNode; className?: string; tone?: 'fail' | 'warn' | 'pass' }) {
  return (
    <div
      className={cx(
        'w-full min-w-0 rounded-xl border bg-surface shadow-sm',
        tone === 'fail' ? 'border-[color:var(--fail)]/30' : tone === 'warn' ? 'border-[color:var(--warn)]/30' : tone === 'pass' ? 'border-[color:var(--pass)]/30' : 'border-line',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EchoCard({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <Card className="px-3.5 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted">
        <Icon.Check size={13} /> I read
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13.5px]">
        {fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-muted">{f.label}</dt>
            <dd className="num min-w-0 break-words font-medium text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-muted">Code checked that the amount appears word for word in your message.</p>
    </Card>
  );
}

/** Officer-facing outcome: rejection with a fix, or the advice they see before the treasurer. */
export function OutcomeCard({ req }: { req: RequestView }) {
  const failed = req.rules.find((r) => r.outcome !== 'pass');
  if (failed) {
    return (
      <Card tone={failed.outcome === 'fail' ? 'fail' : 'warn'} className="px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <IdChip tone={failed.outcome === 'fail' ? 'fail' : 'warn'}>{failed.ruleId}</IdChip>
          <span className="font-mono text-[11.5px] text-muted">{failed.citation}</span>
          <StatusPill status={req.status} className="ml-auto" />
        </div>
        <p className="mt-2 text-[13.5px] leading-snug text-ink">{failed.message}</p>
        {failed.suggestion && (
          <p className="mt-1.5 flex gap-1.5 text-[13.5px] font-medium leading-snug">
            <span className="text-muted">Fix:</span> {failed.suggestion}
          </p>
        )}
      </Card>
    );
  }
  if (!req.recommendation) return null;
  return <AdvicePanel req={req} compact />;
}

/* ------------------------------------------------------------ the card */

export function VirtualCard({ req }: { req: RequestView }) {
  const c = req.card;
  if (!c) return null;
  const active = c.status === 'active';
  return (
    <div
      className={cx(
        'relative aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-2xl p-4 text-white shadow-md',
        active ? 'bg-[#15161a]' : 'bg-[#4a4d55]',
      )}
      role="img"
      aria-label={`Virtual card ending ${c.last4}, limit ${formatCents(c.limitCents)}, ${active ? 'active' : c.status}, expires ${dateFmt.format(new Date(c.expiresAt))}`}
    >
      <div aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full bg-[radial-gradient(circle,rgba(217,242,107,0.35),transparent_65%)]" />
      <div aria-hidden className="absolute -bottom-20 -left-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(109,94,252,0.35),transparent_65%)]" />
      <div className="relative flex h-full flex-col justify-between" aria-hidden>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/60">ASUC program card</div>
            <div className="text-[13px] font-medium">{req.officer.name}</div>
          </div>
          <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium', active ? 'bg-[#d9f26b] text-[#1d2400]' : 'bg-white/15 text-white')}>
            {active ? 'Active' : c.status === 'terminated' ? 'Closed' : 'Expired'}
          </span>
        </div>
        <div className="num font-mono text-[19px] tracking-[0.12em]">•••• •••• •••• {c.last4}</div>
        <div className="flex items-end justify-between text-[12px]">
          <div>
            <div className="text-white/55">Limit</div>
            <div className="num text-[15px] font-semibold">{formatCents(c.limitCents)}</div>
          </div>
          <div className="text-right">
            <div className="text-white/55">Expires</div>
            <div className="num font-medium">{dateFmt.format(new Date(c.expiresAt))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimulatePurchase({ req }: { req: RequestView }) {
  const { act } = useApp();
  const [merchant, setMerchant] = useState('Telegraph Slice Co.');
  const [amount, setAmount] = useState('48.73');
  const [category, setCategory] = useState(req.card?.allowedCategories[0] ?? 'restaurants');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(amount.trim());
    if (!cents || cents <= 0) {
      setError('Enter an amount like 48.73.');
      return;
    }
    setError(null);
    setBusy(true);
    await act(`/api/requests/${req.shortId}/simulate-purchase`, { actorId: req.officer.id, amountCents: cents, merchantName: merchant.trim(), merchantCategory: category });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        <Icon.Bolt size={13} /> Simulate purchase
        <span className="font-normal">· sent as a normalized <code className="font-mono text-[11.5px]">transaction.settled</code> event</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-[12px] text-muted">
          Merchant
          <input name="merchant" autoComplete="off" value={merchant} onChange={(e) => setMerchant(e.target.value)} className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[16px] text-ink sm:text-[14px]" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Amount
          <input
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${req.shortId}-amt-err` : undefined}
            className="num h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[16px] text-ink sm:text-[14px]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-muted">
          Category
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-line-strong px-2 text-[14px]">
            {MERCHANT_CATEGORIES.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, ' ')}
                {req.card?.allowedCategories.includes(m) ? '' : ' (blocked)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p id={`${req.shortId}-amt-err`} className="text-[12.5px] text-fail" aria-live="polite">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          <Icon.Card size={14} /> Charge the card
        </Button>
        <button type="button" className="min-h-6 rounded text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setAmount('59.52')}>
          Use the beer receipt amount ($59.52)
        </button>
      </div>
    </form>
  );
}

export function CardBlock({ req }: { req: RequestView }) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <VirtualCard req={req} />
      {req.card && (
        <div className="flex flex-wrap gap-1">
          {req.card.allowedCategories.map((c) => (
            <Pill key={c}>{c.replace(/_/g, ' ')}</Pill>
          ))}
          <Pill tone="info">app-enforced expiry</Pill>
        </div>
      )}
      {req.status === 'card_issued' && req.card?.status === 'active' && <SimulatePurchase req={req} />}
      {req.transaction && (
        <p className="text-[13px] text-ink-2">
          Charged <Money cents={req.transaction.amountCents} className="font-semibold text-ink" /> at {req.transaction.merchantName}. Card closed after one use.
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- receipts */

export function SampleReceiptButtons({ files, memberId }: { files: string[]; memberId: string }) {
  const { act } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  async function send(file: string) {
    setBusy(file);
    const blob = await (await fetch(`/api/fixtures/receipts/${file}`)).blob();
    const fd = new FormData();
    fd.set('memberId', memberId);
    fd.set('text', '');
    fd.set('image', new File([blob], file, { type: 'image/png' }));
    await act('/api/officer/message', fd);
    setBusy(null);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {SAMPLE_RECEIPTS.filter((r) => files.includes(r.file)).map((r) => (
        <Button key={r.file} size="sm" variant="secondary" loading={busy === r.file} disabled={!!busy} onClick={() => send(r.file)}>
          <Icon.Receipt size={14} /> Send {r.label}
        </Button>
      ))}
    </div>
  );
}

export function ReceiptBlock({ req, memberId }: { req: RequestView; memberId: string }) {
  if (req.status === 'purchased' && !req.receipt) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[12.5px] text-muted">Attach a photo with the paperclip, or send a sample:</p>
        <SampleReceiptButtons files={['pizza-clean.png', 'pizza-beer.png']} memberId={memberId} />
      </div>
    );
  }
  const r = req.receipt;
  if (!r) return null;
  const tone = r.outcome === 'ok' ? 'pass' : r.outcome === 'alcohol' ? 'fail' : r.outcome ? 'warn' : undefined;
  return (
    <Card tone={tone} className="flex gap-3 p-3">
      <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0" aria-label="Open receipt photo in a new tab">
        <img src={r.url} alt={`Receipt from ${r.merchant ?? 'the merchant'}`} width={64} height={74} className="h-[74px] w-16 rounded-md border border-line object-cover object-top" />
      </a>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{r.merchant ?? 'Receipt'}</span>
          {r.outcome === 'ok' && (
            <Pill tone="pass">
              <Icon.Check size={12} /> Reconciled
            </Pill>
          )}
          {r.outcome === 'alcohol' && (
            <Pill tone="fail">
              <Icon.X size={12} /> Alcohol
            </Pill>
          )}
          {(r.outcome === 'flagged' || r.outcome === 'unreadable') && (
            <Pill tone="warn">
              <Icon.Alert size={12} /> Flagged
            </Pill>
          )}
        </div>
        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 text-ink-2">
          <dt className="text-muted">Receipt total</dt>
          <dd>
            <Money cents={r.totalCents} />
          </dd>
          {req.transaction && (
            <>
              <dt className="text-muted">Card charge</dt>
              <dd>
                <Money cents={req.transaction.amountCents} />
              </dd>
            </>
          )}
        </dl>
        {r.flags.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-[12.5px] text-warn">
            {r.flags.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- filing */

const FILING_STEPS = ['Queued', 'Browser agent filling the portal', 'Confirmation received'];

export function FilingBlock({ req, treasurerId }: { req: RequestView; treasurerId?: string }) {
  const { act } = useApp();
  const [busy, setBusy] = useState(false);
  const f = req.filing;
  if (!f) return null;
  const stage = f.confirmationId ? 2 : f.status === 'running' ? 1 : f.status === 'queued' ? (f.attempts > 0 ? 1 : 0) : 1;
  const failed = f.status === 'needs_human';
  return (
    <Card tone={f.confirmationId ? 'pass' : failed ? 'warn' : undefined} className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Icon.Browser size={15} className="text-info" />
        <span className="text-[13px] font-semibold">ASUC portal filing</span>
        <span className="font-mono text-[11.5px] text-muted">{f.idempotencyKey}</span>
        <span className="ml-auto">
          {f.confirmationId ? <Pill tone="pass">Filed</Pill> : failed ? <Pill tone="warn">Needs a human</Pill> : <Pill tone="live" dot>Working</Pill>}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row">
        <ol className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px]">
          {FILING_STEPS.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-2', i > stage && 'text-faint')}>
              <span
                aria-hidden
                className={cx(
                  'grid size-4.5 shrink-0 place-items-center rounded-full text-[10px]',
                  i < stage || (i === 2 && f.confirmationId) ? 'bg-pass text-white' : i === stage && !failed ? 'bg-info-bg text-info ring-1 ring-[color:var(--info)]' : 'bg-[color:var(--line)]',
                )}
              >
                {i < stage || (i === 2 && f.confirmationId) ? <Icon.Check size={11} /> : i === stage && !failed ? <span className="size-1.5 rounded-full bg-current animate-pulse-dot" /> : null}
              </span>
              <span>{s}</span>
              <span className="sr-only">{i < stage || (i === 2 && f.confirmationId) ? '(done)' : i === stage ? '(in progress)' : '(pending)'}</span>
            </li>
          ))}
          {f.confirmationId && (
            <li className="mt-1 text-[13px]">
              Confirmation{' '}
              <strong className="num font-mono text-[14px] tracking-tight" translate="no">
                {f.confirmationId}
              </strong>
            </li>
          )}
          {failed && f.lastError && <li className="text-[12.5px] text-warn break-words">{f.lastError}</li>}
          {failed && treasurerId && (
            <li>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await act(`/api/requests/${req.shortId}/retry-filing`, { actorId: treasurerId });
                  setBusy(false);
                }}
              >
                Retry filing
              </Button>
            </li>
          )}
        </ol>
        {f.latestScreenshot && (
          <a href={`/api/screenshots/${f.latestScreenshot}`} target="_blank" rel="noreferrer" className="shrink-0" aria-label="Open the latest portal screenshot">
            <img
              src={`/api/screenshots/${f.latestScreenshot}`}
              alt="Latest screenshot of the browser agent in the mock ASUC portal"
              width={180}
              height={133}
              className="h-[133px] w-[180px] rounded-lg border border-line object-cover object-top"
            />
          </a>
        )}
      </div>
    </Card>
  );
}

export function OwedBackBlock({ req, treasurerId }: { req: RequestView; treasurerId?: string }) {
  const { act } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = req.transaction;
  if (!t) return null;
  const repaid = t.resolution === 'repaid';
  return (
    <Card tone={repaid ? 'pass' : 'fail'} className="px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <IdChip tone="fail">ASUC-ALC</IdChip>
        <StatusPill status={req.status} />
        <span className="ml-auto text-[13px]">
          <Money cents={t.amountCents} className="font-semibold" /> {repaid ? 'repaid' : 'owed back'}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">
        Whole request cancelled; no lines dropped, nothing filed. {repaid ? 'The charge was repaid, so it no longer counts as unreconciled.' : 'The card charge stays unreconciled until the officer repays it.'}
      </p>
      {!repaid && treasurerId && (
        <div className="mt-2 flex gap-2">
          {confirm ? (
            <>
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await act(`/api/requests/${req.shortId}/repaid`, { actorId: treasurerId });
                  setBusy(false);
                  setConfirm(false);
                }}
              >
                Confirm repaid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
              Mark repaid…
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function FlaggedBlock({ req, treasurerId }: { req: RequestView; treasurerId: string }) {
  const { act } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const open = req.status === 'receipt_flagged';
  async function go(decision: 'accept' | 'cancel') {
    setBusy(decision);
    await act(`/api/requests/${req.shortId}/resolve`, { actorId: treasurerId, decision });
    setBusy(null);
  }
  return (
    <div className="flex flex-col gap-2">
      <ReceiptBlock req={req} memberId={req.officer.id} />
      {open ? (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={busy === 'accept'} disabled={!!busy} onClick={() => go('accept')}>
            Accept and file
          </Button>
          <Button size="sm" variant="danger" loading={busy === 'cancel'} disabled={!!busy} onClick={() => go('cancel')}>
            Cancel request
          </Button>
        </div>
      ) : (
        <StatusPill status={req.status} />
      )}
    </div>
  );
}

export { CheckPanel, AdvicePanel };
