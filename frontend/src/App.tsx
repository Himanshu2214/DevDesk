import { useEffect, useState } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, domMax, m } from 'motion/react';
import { toastMotion } from './lib/motion';
import { Icon } from './components/Icons';
import PagePreloader from './components/smoothui/page-preloader';
import { AuthGate } from './components/Auth';
import { StoreProvider, useStore } from './store';
import { Empty, isTyping, MenuProvider, Page, useHash } from './components/ui';
import { DialogsProvider, useDialogs } from './components/Dialogs';
import { Sidebar } from './components/Sidebar';
import { Home } from './views/Home';
import { Inbox } from './views/Inbox';
import { TicketList } from './views/TicketList';
import { TicketPage } from './views/TicketPage';
import { Timesheet } from './views/Timesheet';
import { CalendarPage } from './views/Calendar';
import { Account } from './views/Account';
import { Placeholder } from './views/Placeholder';
import { Transports } from './views/Transports';
import { Objects } from './views/Objects';
import { Knowledge } from './views/Knowledge';
import { Insights } from './views/Insights';
import { api } from './api';
import { ShortcutHelp } from './components/ShortcutHelp';

function Router({ route }: { route: string }) {
  const [head, rest] = [route.split('/')[0], route.split('/').slice(1).join('/')];
  switch (head) {
    case 'home': return <Home />;
    case 'inbox': return <Inbox />;
    case 'list': case 'project': return <TicketList route={route} />;
    case 'ticket': return <TicketPage ticketId={decodeURIComponent(rest)} />;
    case 'timesheet': return <Timesheet />;
    case 'calendar': return <CalendarPage />;
    case 'account': return <Account />;
    case 'transports': return <Transports route={route} />;
    case 'objects': return <Objects route={route} />;
    case 'kb': return <Knowledge route={route} />;
    case 'insights': return <Insights />;
    default: return <Placeholder route={head} />;
  }
}

/** Notification stack (iOS style): toasts pile up behind the newest one and spread out on hover or keyboard focus */
function ToastStack() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const list = s.toasts, n = list.length, expanded = open && n > 1;
  useEffect(() => { if (n < 2) setOpen(false) }, [n]);
  return (
    <div className={'toast-stack' + (expanded ? ' open' : '')} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      {n > 1 && !expanded && <span className="toast-count" aria-hidden="true">{n}</span>}
      <AnimatePresence initial={false}>{list.map((t, idx) => {
        const i = n - 1 - idx; // 0 = newest
        const behind = !expanded && i > 0;
        return <m.div key={t.id} layout="position" role={t.error ? 'alert' : 'status'} className={'toast on' + (t.error ? ' is-error' : '') + (behind ? ' behind' : '')}
          initial={toastMotion.initial} exit={toastMotion.exit}
          animate={{ opacity: behind ? (i > 2 ? 0 : 1 - i * 0.18) : 1, y: behind ? -i * 9 : 0, scale: behind ? 1 - i * 0.05 : 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }} style={{ zIndex: 10 - i }} aria-hidden={behind || undefined}>
          {t.error ? <span style={{ color: 'var(--danger)', display: 'grid' }}><Icon name="alert" size={15} /></span> : <span className="ok-check"><Icon name="check" size={15} /></span>}<span>{t.text}</span>
          {t.action && <button className="toast-act" tabIndex={behind ? -1 : 0} onClick={() => { s.dismissToast(t.id); t.action!.run() }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Close" tabIndex={behind ? -1 : 0} onClick={() => s.dismissToast(t.id)}>×</button></m.div>;
      })}</AnimatePresence>
    </div>
  );
}

/** SmoothUI page preloader: takes over from the static #boot screen in index.html and stays until the data has loaded
 *  (at least ~0.9 s from page open, so a fast load does not flash) */
function Preloader() {
  const s = useStore();
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    document.getElementById('boot')?.remove();
    const id = setTimeout(() => setMinDone(true), Math.max(0, 900 - performance.now()));
    return () => clearTimeout(id);
  }, []);
  return <PagePreloader variant="words" active={!(s.ready && minDone) && !s.error} background="bg-background"
    words={['Loading', 'Fetching your work', 'Almost ready']} />;
}

function Shell() {
  const s = useStore();
  const route = useHash();
  const { openNew, openPalette } = useDialogs();
  const [navOpen, setNavOpen] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp(h => !h); return }
      if (e.key.toLowerCase() === 'c') { e.preventDefault(); openNew() }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [openNew, openPalette]);
  // narrow screens: the menu button in the header opens the sidebar; navigating closes it again
  useEffect(() => {
    const toggle = () => setNavOpen(o => !o), help = () => setHelp(true);
    addEventListener('devdesk-nav', toggle); addEventListener('devdesk-help', help);
    return () => { removeEventListener('devdesk-nav', toggle); removeEventListener('devdesk-help', help) };
  }, []);
  useEffect(() => { setNavOpen(false) }, [route]);

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
      <Sidebar route={route} />
      {s.error
        ? <Page crumb={<b>SLATE·SPACE</b>}><Empty error icon="alert" title="Could not load data" action={<button className="btn primary" onClick={() => s.reload()}><Icon name="refresh" size={14} />Try again</button>}>
            <span className="t2" style={{ whiteSpace: 'pre-wrap', display: 'block', marginBottom: 6 }}>{s.error}</span>
            {api.kind === 'sap' ? 'Check that service ZUI_DD_O4 is published, that you are logged on to SAP (sap-client in the URL), and that ZDD_SETUP has run.' : api.kind === 'supabase' ? 'Check your internet connection. If it keeps failing, sign out and sign in again.' : 'The mock backend failed – try clearing site data.'}</Empty></Page>
        : <Router route={route} />}
      <ToastStack />
      <Preloader />
      <AnimatePresence>{help && <ShortcutHelp key="help" close={() => setHelp(false)} />}</AnimatePresence>
    </div>
  );
}

export default function App() {
  // the standalone (Supabase) build shows sign-in first; data loading starts only after the 2-step code
  const app = (
    <StoreProvider>
      <MenuProvider>
        <DialogsProvider>
          <Shell />
        </DialogsProvider>
      </MenuProvider>
    </StoreProvider>
  );
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        {api.kind === 'supabase' ? <AuthGate>{app}</AuthGate> : app}
      </MotionConfig>
    </LazyMotion>
  );
}
