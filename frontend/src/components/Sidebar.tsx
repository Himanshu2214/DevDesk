import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { indicatorTransition } from '../lib/motion';
import { useStore, useTransports } from '../store';
import { isOpen, isOverdue } from '../lib/format';
import { Avatar, Tip } from './ui';
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from './smoothui/collapsible';
import { Icon, LogoMark, StatusIcon } from './Icons';
import { useDialogs } from './Dialogs';
import { api } from '../api';
import { signOut } from './Auth';
import { inboxItems } from '../views/Inbox';

export const VIEWS = {
  overdue: { name: 'Overdue', fn: isOverdue },
  week: { name: 'Due this week', fn: (t: { Status: string; DueDate: string | null }) => isOpen(t as never) && !!t.DueDate && !isOverdue(t as never) && Date.parse(t.DueDate) - Date.now() <= 7 * 864e5 },
  blocked: { name: 'Blocked', fn: (t: { Status: string }) => t.Status === 'BLOCK' },
  done: { name: 'Recently done', fn: (t: { Status: string; ClosedAt: string | null }) => t.Status === 'DONE' && !!t.ClosedAt && Date.now() - Date.parse(t.ClosedAt) < 14 * 864e5 },
} as const;
export type ViewKey = keyof typeof VIEWS;

/** Re-keys its child when the unread count goes up, so the bell rings once per new notification */
function useRing(n: number) {
  const prev = useRef(n), [ring, setRing] = useState(0);
  useEffect(() => { if (n > prev.current) setRing(r => r + 1); prev.current = n }, [n]);
  return ring;
}

const readJson = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback } };
const writeJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } };

/** Sidebar link; the active background is one shared element that glides between items. Collapsed: icon only, label in a tooltip. */
function NavItem({ href, active, collapsed, label, icon, count, alert, style }: {
  href: string; active: boolean; collapsed: boolean; label: string; icon: React.ReactNode; count?: number | string; alert?: boolean; style?: React.CSSProperties;
}) {
  return <Tip label={<>{label}{count ? <span className="tip-c">{count}</span> : null}</>} side="right" disabled={!collapsed}>
    <a className={'ni' + (active ? ' active' : '')} href={href} style={style} aria-current={active ? 'page' : undefined}>
      {active && <m.span layoutId="nav-active" className="ni-bg" transition={indicatorTransition} />}
      <span className="ni-ic">{icon}{collapsed && count && alert ? <i className="ni-dot" /> : null}</span>
      <span className="lbl">{label}</span>
      {count ? <span className={'c num' + (alert ? ' badge-alert' : '')}>{count}</span> : null}</a></Tip>;
}

/** Collapsible group of nav links (SmoothUI Collapsible on Base UI); always open while the sidebar is collapsed */
function Group({ id, title, open, onToggle, collapsed, children }: { id: string; title: string; open: boolean; onToggle(id: string, open: boolean): void; collapsed: boolean; children: React.ReactNode }) {
  return <CollapsibleRoot className="grp-nav" open={collapsed || open} onOpenChange={o => onToggle(id, o)}>
    <CollapsibleTrigger className="sec" disabled={collapsed}>{title}</CollapsibleTrigger>
    <CollapsiblePanel className="grp-panel"><nav className="nav" aria-label={title}>{children}</nav></CollapsiblePanel>
  </CollapsibleRoot>;
}

export function Sidebar({ route }: { route: string }) {
  const s = useStore();
  const { openNew, openPalette } = useDialogs();
  const failedTr = (useTransports().data ?? []).filter(x => x.Phase === 'FAILED');
  const unread = inboxItems(s, failedTr).filter(n => !n.read).length;
  const ring = useRing(unread);
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === 'light');
  const [collapsed, setCollapsed] = useState(() => readJson('devdesk-sidebar-collapsed', false));
  const [groups, setGroups] = useState<Record<string, boolean>>(() => readJson('devdesk-nav-groups', {}));
  const toggleGroup = (id: string, open: boolean) => setGroups(g => { const n = { ...g, [id]: open }; writeJson('devdesk-nav-groups', n); return n });
  const toggleCollapsed = () => setCollapsed(c => { writeJson('devdesk-sidebar-collapsed', !c); return !c });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); toggleCollapsed() } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const active = s.tickets.filter(t => isOpen(t) && t.Status !== 'BACKLOG').length;
  const isActive = (h: string) => route === h || route.startsWith(h + '/') && h !== 'list/active' || (h === 'list/active' && (route === 'list/backlog' || route === 'list/all'));
  const toggleTheme = () => {
    const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light'; setLight(r.dataset.theme === 'light');
    try { localStorage.setItem('devdesk-theme', r.dataset.theme) } catch { /* ignore */ }
    window.dispatchEvent(new Event('devdesk-theme'));
  };
  const nav = (h: string, label: string, icon: React.ReactNode, count?: number | string, alert?: boolean, style?: React.CSSProperties) =>
    <NavItem key={h} href={'#' + h} active={isActive(h)} collapsed={collapsed} label={label} icon={icon} count={count} alert={alert} style={style} />;
  const g = (id: string, title: string, children: React.ReactNode) =>
    <Group id={id} title={title} open={groups[id] ?? true} onToggle={toggleGroup} collapsed={collapsed}>{children}</Group>;
  const side = collapsed ? 'right' : 'bottom';
  return (
    <aside className="side" data-collapsed={collapsed || undefined}>
      <div className="ws">
        <span className="logo" role="img" aria-label="SLATE·SPACE"><LogoMark size={20} /></span><span className="name" aria-hidden="true">SLATE<span className="brand-dot">·</span>SPACE</span><span className="sp" />
        <Tip label="Search · Ctrl K" side={side}><button className="ib" aria-label="Search" onClick={openPalette}><Icon name="search" /></button></Tip>
        <Tip label="New ticket · C" side={side}><button className="ib solid" aria-label="New ticket" onClick={() => openNew()}><Icon name="plus" /></button></Tip>
      </div>
      <m.div className="scroll" layoutScroll>
        <nav className="nav" aria-label="Main">
          {nav('home', 'Home', <Icon name="home" />)}
          {nav('inbox', 'Inbox', <span key={ring} className={ring ? 'bell-ring' : undefined} style={{ display: 'grid' }}><Icon name="bell" /></span>, unread || '', true)}
          {nav('list/active', 'My tickets', <Icon name="my" />, active)}
          {nav('timesheet', 'Timesheet', <Icon name="clock" />)}
          {nav('calendar', 'Calendar', <Icon name="cal" />)}
          {nav('insights', 'Insights', <Icon name="chart" />)}
        </nav>
        {g('sap', 'SAP work', <>
          {nav('transports', 'Transports', <Icon name="truck" />, failedTr.length || '', true)}
          {nav('objects', 'Objects', <Icon name="cube" />)}
          {nav('kb', 'Knowledge', <Icon name="book" />)}</>)}
        {g('views', 'Views', (Object.keys(VIEWS) as ViewKey[]).map(k => nav('list/' + k, VIEWS[k].name,
          k === 'overdue' ? <span style={{ color: 'var(--danger)', display: 'grid' }}><Icon name="alert" /></span> : k === 'week' ? <Icon name="cal" /> : <StatusIcon status={k === 'blocked' ? 'BLOCK' : 'DONE'} />,
          s.tickets.filter(t => VIEWS[k].fn(t as never)).length || '')))}
        {g('projects', 'Projects', s.projects.map(p => nav('project/' + p.Project, p.SharedBy ? `${p.Name} · ${p.SharedBy.split(' ')[0]}` : p.Name,
          p.SharedBy ? <span className="ni-shared" title={'Shared by ' + p.SharedBy}><Icon name="users" size={13} /></span> : <span className="dot" style={{ background: p.Color }} />,
          s.tickets.filter(t => t.Project === p.Project && isOpen(t)).length || '')))}
      </m.div>
      <div className="side-foot">
        <Tip label={(s.user.fullName || s.user.id) + (api.kind === 'mock' ? ' · sample data' : api.kind === 'supabase' ? ' · cloud' : ' · SAP')} side="right" disabled={!collapsed}>
          <a className="who" href="#account" aria-label="Account"><Avatar name={s.user.fullName || s.user.id} /><span className="lbl">{s.user.fullName || s.user.id}</span></a></Tip>
        <span className="muted env-tag" title={api.kind === 'mock' ? 'Sample data in this browser' : api.kind === 'supabase' ? 'Your private cloud workspace' : 'Connected to SAP'}>{api.kind === 'mock' ? 'MOCK' : api.kind === 'supabase' ? 'CLOUD' : 'SAP'}</span>
        <Tip label={light ? 'Dark theme' : 'Light theme'} side={collapsed ? 'right' : 'top'}>
          <button className="ib" aria-label="Toggle theme" onClick={toggleTheme}><span key={light ? 'm' : 's'} className="swap-in"><Icon name={light ? 'moon' : 'sun'} /></span></button></Tip>
        {api.kind === 'supabase' && <Tip label="Sign out" side={collapsed ? 'right' : 'top'}><button className="ib" aria-label="Sign out" onClick={signOut}><Icon name="logout" /></button></Tip>}
        <Tip label={(collapsed ? 'Expand' : 'Collapse') + ' sidebar · Ctrl \\'} side={collapsed ? 'right' : 'top'}>
          <button className="ib collapse-btn" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={toggleCollapsed}>
            <Icon name={collapsed ? 'panel-open' : 'panel-close'} /></button></Tip>
      </div>
    </aside>
  );
}
