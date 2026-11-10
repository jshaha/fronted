'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppStateProvider, Toasts, useApp } from '@/components/AppState';
import { BudgetPanel } from '@/components/side/BudgetPanel';
import { SidePanel } from '@/components/side/SidePanel';
import { cx } from '@/components/ui';
import { Header } from './Header';
import { OfficerPane, PaneTabs, TreasurerPane } from './Panes';

export type SimView = 'all' | 'officer' | 'treasurer';

const TITLES: Record<SimView, string> = {
  all: 'Fronted simulator: officer, treasurer and ledger',
  officer: 'Fronted: officer view',
  treasurer: 'Fronted: treasurer view',
};

function LoadError() {
  const { state, loadError } = useApp();
  if (!loadError || state) return null;
  return (
    <p role="alert" className="rounded-xl border border-[color:var(--fail)]/30 bg-fail-bg px-4 py-3 text-[13.5px] text-fail">
      Can’t reach the app server ({loadError}). Is <code className="font-mono">npm run demo</code> running?
    </p>
  );
}

/** One role per screen: the chat pane plus the panel that role needs. */
function SingleRole({ view }: { view: 'officer' | 'treasurer' }) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex h-[calc(100dvh-140px)] min-h-0 flex-col lg:h-auto">
        {view === 'officer' ? <OfficerPane /> : <TreasurerPane />}
      </div>
      <aside
        aria-label={view === 'officer' ? 'Budget' : 'Budget and agent trace'}
        className="flex min-h-0 flex-col lg:h-auto"
      >
        {view === 'officer' ? (
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <BudgetPanel />
          </div>
        ) : (
          <SidePanel />
        )}
      </aside>
    </div>
  );
}

function AllRoles() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pane = params.get('pane') ?? 'officer';
  const setPane = (v: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('pane', v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <>
      <PaneTabs value={pane} onChange={setPane} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(320px,380px)]">
        <div className={cx('h-[calc(100dvh-140px)] min-h-0 lg:h-auto', pane !== 'officer' && 'hidden lg:flex', 'flex flex-col')}>
          <OfficerPane />
        </div>
        <div className={cx('h-[calc(100dvh-140px)] min-h-0 lg:h-auto', pane !== 'treasurer' && 'hidden lg:flex', 'flex flex-col')}>
          <TreasurerPane />
        </div>
        <aside aria-label="Budget and agent trace" className={cx('min-h-0 lg:h-auto', pane !== 'ledger' && 'hidden lg:flex', 'flex flex-col')}>
          <SidePanel />
        </aside>
      </div>
    </>
  );
}

function Layout({ view }: { view: SimView }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header view={view} />
      <main id="main" className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-[max(16px,env(safe-area-inset-left))] py-3 lg:h-[calc(100dvh-56px)]">
        <h1 className="sr-only">{TITLES[view]}</h1>
        <LoadError />
        {view === 'all' ? <AllRoles /> : <SingleRole view={view} />}
      </main>
      <Toasts />
    </>
  );
}

export function Simulator({ view = 'all' }: { view?: SimView }) {
  return (
    <AppStateProvider>
      <Layout view={view} />
    </AppStateProvider>
  );
}
