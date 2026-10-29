import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { isOpen, isOverdue } from '../lib/format';
import { Avatar, go } from './ui';
import { Icon, StatusIcon } from './Icons';
import { TIMER_WARN_H, useDialogs } from './Dialogs';
import { api } from '../api';
import { inboxItems } from '../views/Inbox';

export const VIEWS = {
  overdue: { name: 'Overdue', fn: isOverdue },
  week: { name: 'Due this week', fn: (t: { Status: string; DueDate: string | null }) => isOpen(t as never) && !!t.DueDate && !isOverdue(t as never) && Date.parse(t.DueDate) - Date.now() <= 7 * 864e5 },
  blocked: { name: 'Blocked', fn: (t: { Status: string }) => t.Status === 'BLOCK' },
  done: { name: 'Recently done', fn: (t: { Status: string; ClosedAt: string | null }) => t.Status === 'DONE' && !!t.ClosedAt && Date.now() - Date.parse(t.ClosedAt) < 14 * 864e5 },
} as const;
export type ViewKey = keyof typeof VIEWS;

function Timer() {
  const s = useStore();
  const running = s.tickets.find(t => t.TimerStartedAt);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(id) }, []);
  const sec = running?.TimerStartedAt ? Math.max(0, (Date.now() - Date.parse(running.TimerStartedAt)) / 1000) : 0;
  const { openStop } = useDialogs();
  const p = (n: number) => String(Math.floor(n)).padStart(2, '0');
  const long = sec / 3600 > TIMER_WARN_H;
  return (
    <div className={'timer' + (long ? ' warn' : '')}>
      <span className="rec" style={{ visibility: running ? 'visible' : 'hidden' }} />
      <div className="w">
        <div className="clk num">{p(sec / 3600)}:{p(sec % 3600 / 60)}:{p(sec % 60)}</div>
        {long && running
          ? <div className="tk" style={{ color: 'var(--urgent)' }} onClick={() => openStop(running)}>Still working on {running.TicketId}? Stop and correct</div>
          : <div className="tk" onClick={() => running && go('ticket/' + running.TicketId)}>{running ? `${running.TicketId} · ${running.Title}` : 'No timer running'}</div>}
      </div>
      <button className="ib" title="Stop and log time" disabled={!running}
        onClick={() => running && openStop(running)}><Icon name="stop" size={14} /></button>
    </div>
  );
}

export function Sidebar({ route }: { route: string }) {
  const s = useStore();
  const { openNew, openPalette } = useDialogs();
  const unread = inboxItems(s).filter(n => !n.read).length;
  const active = s.tickets.filter(t => isOpen(t) && t.Status !== 'BACKLOG').length;
  const nav: [string, string, string, number | string][] = [
    ['home', 'Home', 'home', ''], ['inbox', 'Inbox', 'inbox', unread || ''], ['list/active', 'My tickets', 'my', active], ['timesheet', 'Timesheet', 'clock', ''],
  ];
  const later: [string, string, string][] = [['transports', 'Transports', 'truck'], ['objects', 'Objects', 'cube'], ['kb', 'Knowledge', 'book'], ['insights', 'Insights', 'chart']];
  const isActive = (h: string) => route === h || (h === 'list/active' && (route === 'list/backlog' || route === 'list/all'));
  const toggleTheme = () => {
    const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('devdesk-theme', r.dataset.theme) } catch { /* ignore */ }
    window.dispatchEvent(new Event('devdesk-theme'));
  };
  return (
    <aside className="side">
      <div className="ws">
        <span className="logo">D</span><span className="name">DevDesk</span><span className="sp" />
        <button className="ib" title="Search (Ctrl K)" onClick={openPalette}><Icon name="search" /></button>
        <button className="ib solid" title="New ticket (C)" onClick={() => openNew()}><Icon name="edit" /></button>
      </div>
      <div className="scroll">
        <nav className="nav">{nav.map(([h, l, i, c]) =>
          <a key={h} className={'ni' + (isActive(h) ? ' active' : '')} href={'#' + h}><Icon name={i} />{l}<span className="c num">{c}</span></a>)}</nav>
        <div className="sec">Views</div>
        <nav className="nav">{(Object.keys(VIEWS) as ViewKey[]).map(k =>
          <a key={k} className={'ni' + (route === 'list/' + k ? ' active' : '')} href={'#list/' + k}>
            {k === 'overdue' ? <span style={{ color: 'var(--danger)', display: 'grid' }}><Icon name="alert" /></span> : k === 'week' ? <Icon name="cal" /> : <StatusIcon status={k === 'blocked' ? 'BLOCK' : 'DONE'} />}
            {VIEWS[k].name}<span className="c num">{s.tickets.filter(t => VIEWS[k].fn(t as never)).length || ''}</span></a>)}</nav>
        <div className="sec">Projects</div>
        <nav className="nav">{s.projects.map(p =>
          <a key={p.Project} className={'ni' + (route.startsWith('project/' + p.Project) ? ' active' : '')} href={'#project/' + p.Project}>
            <span className="dot" style={{ background: p.Color }} />{p.Name}<span className="c num">{s.tickets.filter(t => t.Project === p.Project && isOpen(t)).length || ''}</span></a>)}</nav>
        <div className="sec">Coming in phase 2</div>
        <nav className="nav">{later.map(([h, l, i]) =>
          <a key={h} className={'ni' + (route === h ? ' active' : '')} href={'#' + h} style={{ opacity: .55 }}><Icon name={i} />{l}</a>)}</nav>
      </div>
      <Timer />
      <div className="side-foot">
        <span className="who"><Avatar name={s.user.fullName || s.user.id} />{s.user.fullName || s.user.id}</span>
        <span className="muted" style={{ fontSize: 11 }} title={api.kind === 'mock' ? 'Sample data in this browser' : 'Connected to SAP'}>{api.kind === 'mock' ? 'MOCK' : 'SAP'}</span>
        <button className="ib" title="Light / dark" onClick={toggleTheme}><Icon name="moon" /></button>
      </div>
    </aside>
  );
}
