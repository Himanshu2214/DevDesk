import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate, isOpen, STATUS_ORDER, urgency } from '../lib/format';
import { Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Avatar, Due, go, isTyping, Page, ProjectChip, TechTag, useFieldMenus, useMenu } from '../components/ui';
import { VIEWS, type ViewKey } from '../components/Sidebar';
import { useDialogs } from '../components/Dialogs';

const GROUP_ORDER: Status[] = ['PROG', 'TEST', 'BLOCK', 'TODO', 'BACKLOG', 'DONE'];
type Layout = 'list' | 'board';

/** route: list/<tab|view> or project/<KEY>?<tab> */
export function TicketList({ route }: { route: string }) {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const { openNew } = useDialogs();
  const [layout, setLayout] = useState<Layout>(() => { try { return (localStorage.getItem('devdesk-layout') as Layout) || 'board' } catch { return 'board' } });
  const [sel, setSel] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<Status | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [kind, rest] = [route.split('/')[0], route.split('/').slice(1).join('/')];
  const project = kind === 'project' ? rest.split('?')[0] : null;
  const tab = (kind === 'project' ? rest.split('?')[1] : rest) || 'active';
  const view = (VIEWS as Record<string, (typeof VIEWS)[ViewKey]>)[tab];

  const pool = project ? s.tickets.filter(t => t.Project === project) : s.tickets;
  const set = useMemo(() => view ? pool.filter(t => view.fn(t as never))
    : tab === 'backlog' ? pool.filter(t => t.Status === 'BACKLOG')
    : tab === 'all' ? pool : pool.filter(t => isOpen(t) && t.Status !== 'BACKLOG'), [pool, view, tab]);
  const groups = useMemo(() => GROUP_ORDER.map(k => {
    let g = set.filter(t => t.Status === k);
    g = k === 'DONE' ? g.sort((a, b) => (b.ClosedAt ?? '').localeCompare(a.ClosedAt ?? '')).slice(0, 25) : g.sort(urgency);
    return [k, g] as [Status, Ticket[]];
  }).filter(([, g]) => g.length), [set]);
  const flat = groups.flatMap(([, g]) => g);

  useEffect(() => { setSel(0) }, [route]);
  useEffect(() => { try { localStorage.setItem('devdesk-layout', layout) } catch { /* ignore */ } }, [layout]);

  const setStatus = (t: Ticket, st: Status) => s.run(() => api.setStatus(t, st), { uuids: [t.TicketUUID], ok: <><StatusIcon status={st} /> {t.TicketId} moved to {s.text('STATUS', st)}</> });
  const statusMenu = (e: React.MouseEvent, t: Ticket) => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, menus.status(t), v => setStatus(t, v as Status)) };
  const prioMenu = (e: React.MouseEvent, t: Ticket) => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, menus.Priority(t), v => s.run(() => api.updateTicket(t, { Priority: v }), { uuids: [t.TicketUUID] })) };

  // keyboard: J/K move, Enter open, S status (list layout)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (layout !== 'list' || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'j' || e.key === 'ArrowDown') { setSel(x => Math.min(flat.length - 1, x + 1)); e.preventDefault() }
      if (key === 'k' || e.key === 'ArrowUp') { setSel(x => Math.max(0, x - 1)); e.preventDefault() }
      if (e.key === 'Enter' && flat[sel]) go('ticket/' + flat[sel].TicketId);
      if (key === 's' && flat[sel]) { const el = document.querySelector('.row.sel [data-st]'); if (el) menu(el, menus.status(flat[sel]), v => setStatus(flat[sel], v as Status)) }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  useEffect(() => { document.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' }) }, [sel]);

  const p = project ? s.project(project) : null;
  const crumb = p ? <><span className="dot" style={{ width: 9, height: 9, borderRadius: 2, background: p.Color }} /><b>{p.Name}</b></>
    : view ? <b>{view.name}</b> : <b>My tickets</b>;
  const base = project ? `#project/${project}?` : '#list/';
  const count = (f: (t: Ticket) => boolean) => pool.filter(f).length;
  const bar2 = <>
    {view ? <span className="muted">{set.length} tickets</span> : ([['active', 'Active', (t: Ticket) => isOpen(t) && t.Status !== 'BACKLOG'], ['backlog', 'Backlog', (t: Ticket) => t.Status === 'BACKLOG'], ['all', 'All', () => true]] as const)
      .map(([k, l, f]) => <a key={k} className={'pill' + (tab === k ? ' on' : '')} href={base + k}>{l}<span className="c num">{count(f)}</span></a>)}
    <span className="sp" />
    <span className="muted" style={{ fontSize: 12, marginRight: 8 }}>{layout === 'list' ? <><kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open · <kbd>S</kbd> status</> : 'Drag cards between columns'}</span>
    <div className="seg"><button className={layout === 'list' ? 'on' : ''} title="List" onClick={() => setLayout('list')}><Icon name="list" size={14} /></button>
      <button className={layout === 'board' ? 'on' : ''} title="Board" onClick={() => setLayout('board')}><Icon name="board" size={14} /></button></div>
  </>;

  if (!s.ready) return <Page crumb={crumb}><div className="empty">Loading…</div></Page>;

  if (layout === 'list') {
    let n = -1;
    return (
      <Page crumb={crumb} bar2={bar2} bodyRef={bodyRef}>
        {groups.map(([k, g]) => {
          const wip = s.wip(k), over = wip > 0 && g.length > wip;
          return <div key={k}>
            <div className="grp"><StatusIcon status={k} />{s.text('STATUS', k)}<span className="c">{g.length}</span>
              {over && <span className="warn"><Icon name="alert" size={13} />over WIP limit of {wip}</span>}<span className="sp" />
              <button className="ib" title="New ticket" onClick={() => openNew({ status: k, ...(project ? { Project: project } : {}) })}><Icon name="plus" /></button></div>
            {g.map(t => { n++; const i = n; return (
              <a key={t.TicketUUID} className={'row' + (i === sel ? ' sel' : '')} href={'#ticket/' + t.TicketId} onMouseEnter={() => setSel(i)}>
                <span onClick={e => prioMenu(e, t)} title="Priority"><PriorityIcon priority={t.Priority} /></span>
                <span className="id num">{t.TicketId}</span>
                <span data-st onClick={e => statusMenu(e, t)} title={s.text('STATUS', t.Status)}><StatusIcon status={t.Status} /></span>
                <span className="ttl">{t.Title}<small>{t.Requester}</small></span>
                <span style={{ display: 'flex', gap: 6 }}><TechTag code={t.Tech} /><ProjectChip code={t.Project} /></span>
                <span className="x muted num" style={{ fontSize: 12 }}>{t.LoggedHours ? `${Math.round(t.LoggedHours * 10) / 10}/${t.EstimateHours}h` : ''}</span>
                <span style={{ textAlign: 'right' }}><Due t={t} short /></span>
                <span className="dt">{fmtDate(t.CreatedAt)}</span>
              </a>) })}
          </div>;
        })}
        {!groups.length && <div className="empty">No tickets here. Press <kbd>C</kbd> to create one.</div>}
      </Page>
    );
  }

  const cols = STATUS_ORDER.filter(k => (k !== 'DONE' || tab === 'all' || tab === 'done') && (k !== 'BACKLOG' || tab !== 'active'));
  return (
    <Page crumb={crumb} bar2={bar2}>
      <div className="board">{cols.map(k => {
        const g = set.filter(t => t.Status === k).sort(urgency).slice(0, k === 'DONE' ? 20 : 999);
        const wip = s.wip(k), over = wip > 0 && g.length > wip;
        return (
          <div key={k} className={'col' + (dropOn === k ? ' drop' : '')} style={{ ['--c' as string]: `var(--st-${({ BACKLOG: 'backlog', TODO: 'todo', PROG: 'prog', TEST: 'test', BLOCK: 'block', DONE: 'done' })[k]})` }}
            onDragOver={e => { if (dragId) { e.preventDefault(); setDropOn(k) } }} onDragLeave={() => setDropOn(null)}
            onDrop={e => { e.preventDefault(); setDropOn(null); const t = s.tickets.find(x => x.TicketUUID === dragId); setDragId(null); if (t && t.Status !== k) setStatus(t, k) }}>
            <div className="col-h"><StatusIcon status={k} />{s.text('STATUS', k)}<span className="c">{g.length}</span><span className="sp" />
              {wip > 0 && <span className={'wip' + (over ? ' over' : '')} title="Work-in-progress limit">{g.length}/{wip}</span>}
              <button className="ib" onClick={() => openNew({ status: k, ...(project ? { Project: project } : {}) })}><Icon name="plus" /></button></div>
            {g.map(t => (
              <a key={t.TicketUUID} className={'card' + (dragId === t.TicketUUID ? ' dragging' : '')} href={'#ticket/' + t.TicketId} draggable
                onDragStart={e => { setDragId(t.TicketUUID); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDragId(null); setDropOn(null) }}>
                <div className="t" style={{ marginTop: 0 }}><span>{t.Title}</span></div>
                <div className="tags"><TechTag code={t.Tech} /><span className="tag">{t.Area}</span>
                  {t.TicketType === 'BUG' && <span className="tag" style={{ background: 'rgba(235,87,87,.16)', color: 'var(--danger)' }}>Bug</span>}</div>
                <div className="r3"><span className="muted num" style={{ fontSize: 12 }}>{t.TicketId}</span>
                  <span onClick={e => prioMenu(e, t)}><PriorityIcon priority={t.Priority} /></span><Due t={t} short /><span className="sp" />
                  <span className="muted num" style={{ fontSize: 12 }}>{Math.round(t.LoggedHours * 10) / 10}/{t.EstimateHours}h</span><Avatar name={t.Assignee} size={18} /></div>
              </a>))}
          </div>);
      })}</div>
    </Page>
  );
}
