import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { isTyping, MenuProvider, Page, useHash } from './components/ui';
import { DialogsProvider, useDialogs } from './components/Dialogs';
import { Sidebar } from './components/Sidebar';
import { Home } from './views/Home';
import { Inbox } from './views/Inbox';
import { TicketList } from './views/TicketList';
import { TicketPage } from './views/TicketPage';
import { Timesheet } from './views/Timesheet';
import { Placeholder } from './views/Placeholder';
import { Transports } from './views/Transports';
import { Objects } from './views/Objects';
import { Knowledge } from './views/Knowledge';
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
    case 'transports': return <Transports route={route} />;
    case 'objects': return <Objects route={route} />;
    case 'kb': return <Knowledge route={route} />;
    default: return <Placeholder route={head} />;
  }
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
        ? <Page crumb={<b>DevDesk</b>}><div className="home"><div className="panel" style={{ padding: '22px 24px', maxWidth: 680 }}>
            <h2 style={{ fontSize: 18 }}>Could not load data</h2>
            <p className="t2" style={{ whiteSpace: 'pre-wrap' }}>{s.error}</p>
            <p className="muted">{api.kind === 'sap' ? 'Check that service ZUI_DD_O4 is published, that you are logged on to SAP (sap-client in the URL), and that ZDD_SETUP has run.' : 'The mock backend failed – try clearing site data.'}</p>
            <button className="btn primary" onClick={() => s.reload()}>Try again</button></div></div></Page>
        : <Router route={route} />}
      <div style={{ position: 'fixed', right: 18, bottom: 18, display: 'grid', gap: 8, zIndex: 95 }}>
        {s.toasts.map(t => <div key={t.id} role="status" className="toast on" style={{ position: 'static', transform: 'none', pointerEvents: 'auto', ...(t.error ? { borderColor: 'var(--danger)', color: 'var(--text)', whiteSpace: 'pre-wrap', maxWidth: 420 } : {}) }}>
          {t.error && <span style={{ color: 'var(--danger)' }}>●</span>}<span>{t.text}</span>
          {t.action && <button className="toast-act" onClick={() => { s.dismissToast(t.id); t.action!.run() }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Close" onClick={() => s.dismissToast(t.id)}>×</button></div>)}
      </div>
      {help && <ShortcutHelp close={() => setHelp(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MenuProvider>
        <DialogsProvider>
          <Shell />
        </DialogsProvider>
      </MenuProvider>
    </StoreProvider>
  );
}
