import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate, isOpen, STATUS_ORDER } from '../lib/format';
import { Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Avatar, Due, go, isTyping, Page, ProjectChip, TechTag, useFieldMenus, useMenu } from '../components/ui';
import { VIEWS, type ViewKey } from '../components/Sidebar';
import { useDialogs } from '../components/Dialogs';
import { activeFilterCount, applyFilters, EMPTY_PREFS, rememberOrder, sorter, useListPrefs } from '../lib/listPrefs';
import type { DueFilter, FilterField, GroupBy, SortBy } from '../lib/listPrefs';
import { PRIORITY_NAME } from '../lib/format';

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
  const justDragged = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const bodyRef = useRef<HTMLDivElement>(null);

  const [kind, rest] = [route.split('/')[0], route.split('/').slice(1).join('/')];
  const project = kind === 'project' ? rest.split('?')[0] : null;
  const tab = (kind === 'project' ? rest.split('?')[1] : rest) || 'active';
  const view = (VIEWS as Record<string, (typeof VIEWS)[ViewKey]>)[tab];

  const [prefs, setPrefs] = useListPrefs(project ? 'project' : view ? tab : 'list');
  const nFilters = activeFilterCount(prefs);
  const pool = project ? s.tickets.filter(t => t.Project === project) : s.tickets;
  const unfiltered = useMemo(() => view ? pool.filter(t => view.fn(t as never))
    : tab === 'backlog' ? pool.filter(t => t.Status === 'BACKLOG')
    : tab === 'all' ? pool : pool.filter(t => isOpen(t) && t.Status !== 'BACKLOG'), [pool, view, tab]);
  const set = useMemo(() => applyFilters(unfiltered, prefs), [unfiltered, prefs]);
  // list groups: by status (workflow order), project or priority
  const groups = useMemo(() => {
    const cmp = sorter(prefs.sort);
    if (prefs.group === 'project') return s.projects.map(p => [p.Project, set.filter(t => t.Project === p.Project).sort(cmp)] as [string, Ticket[]]).filter(([, g]) => g.length);
    if (prefs.group === 'priority') return ['1', '2', '3', '4'].map(p => [p, set.filter(t => t.Priority === p).sort(cmp)] as [string, Ticket[]]).filter(([, g]) => g.length);
    return GROUP_ORDER.map(k => {
      let g = set.filter(t => t.Status === k);
      g = k === 'DONE' ? g.sort((a, b) => (b.ClosedAt ?? '').localeCompare(a.ClosedAt ?? '')).slice(0, 25) : g.sort(cmp);
      return [k, g] as [string, Ticket[]];
    }).filter(([, g]) => g.length);
  }, [set, prefs.group, prefs.sort, s.projects]);
  const flat = groups.flatMap(([, g]) => g);
  useEffect(() => { rememberOrder(flat.map(t => t.TicketId)) }, [flat]);

  useEffect(() => { setSel(0) }, [route]);
  useEffect(() => { try { localStorage.setItem('devdesk-layout', layout) } catch { /* ignore */ } }, [layout]);

  const setStatus = (t: Ticket, st: Status) => s.changeStatus(t, st);
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
  const clearFilters = () => setPrefs({ ...EMPTY_PREFS, group: prefs.group, sort: prefs.sort });
  const toggleFilter = (f: FilterField, v: string) => {
    const cur = prefs.filters[f];
    setPrefs({ ...prefs, filters: { ...prefs.filters, [f]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] } });
  };
  const filterPill = (f: FilterField, label: string) => {
    const n = prefs.filters[f].length;
    return <button key={f} className={'pill fpill' + (n ? ' active' : '')} onClick={e => menu(e.currentTarget,
      menus[f]({ [f]: '' } as never).map(i => ({ ...i, checked: prefs.filters[f].includes(i.value) })), v => toggleFilter(f, v), f === 'Project' || f === 'Tech')}>
      {label}{n ? <span className="c num">{' · ' + n}</span> : null}<Icon name="down" size={12} /></button>;
  };
  const DUE: [DueFilter, string][] = [['any', 'Any due date'], ['overdue', 'Overdue'], ['week', 'Due within 7 days'], ['none', 'No due date']];
  const GROUP: [GroupBy, string][] = [['status', 'Group by status'], ['project', 'Group by project'], ['priority', 'Group by priority']];
  const SORT: [SortBy, string][] = [['urgency', 'Sort: priority, then due'], ['due', 'Sort: due date'], ['priority', 'Sort: priority'], ['created', 'Sort: newest first'], ['updated', 'Sort: recently changed']];
  const filterBar = <>
    {filterPill('Priority', 'Priority')}{filterPill('Project', 'Project')}{filterPill('Tech', 'Tech')}{filterPill('TicketType', 'Type')}
    <button className={'pill fpill' + (prefs.due !== 'any' ? ' active' : '')} onClick={e => menu(e.currentTarget, DUE.map(([v, l]) => ({ label: l, value: v, checked: prefs.due === v })), v => setPrefs({ ...prefs, due: v as DueFilter }), false)}>
      {prefs.due === 'any' ? 'Due' : DUE.find(d => d[0] === prefs.due)![1]}<Icon name="down" size={12} /></button>
    {nFilters > 0 && <button className="pill" onClick={clearFilters} title="Clear all filters">{'Clear · ' + nFilters}</button>}
    <button className="pill" title="Grouping and sorting" onClick={e => menu(e.currentTarget, [
      ...(layout === 'list' ? GROUP.map(([v, l]) => ({ label: l, value: 'g:' + v, checked: prefs.group === v })) : []),
      ...SORT.map(([v, l]) => ({ label: l, value: 's:' + v, checked: prefs.sort === v }))],
      v => setPrefs(v.startsWith('g:') ? { ...prefs, group: v.slice(2) as GroupBy } : { ...prefs, sort: v.slice(2) as SortBy }), false)}>
      <Icon name="list" size={13} />Display</button>
  </>;
  const bar2 = <>
    {view ? <span className="muted">{set.length} tickets</span> : ([['active', 'Active', (t: Ticket) => isOpen(t) && t.Status !== 'BACKLOG'], ['backlog', 'Backlog', (t: Ticket) => t.Status === 'BACKLOG'], ['all', 'All', () => true]] as const)
      .map(([k, l, f]) => <a key={k} className={'pill' + (tab === k ? ' on' : '')} href={base + k}>{l}<span className="c num">{count(f)}</span></a>)}
    <span style={{ width: 8 }} />{filterBar}
    <span className="sp" />
    <div className="seg"><button className={layout === 'list' ? 'on' : ''} title="List" onClick={() => setLayout('list')}><Icon name="list" size={14} /></button>
      <button className={layout === 'board' ? 'on' : ''} title="Board" onClick={() => setLayout('board')}><Icon name="board" size={14} /></button></div>
  </>;

  if (!s.ready) return <Page crumb={crumb}>{[...Array(8)].map((_, i) => <div key={i} className="sk-row"><span className="sk" /><span className="sk" />
    <span className="sk" style={{ borderRadius: '50%', width: 14, height: 14 }} /><span className="sk" style={{ width: (45 + (i * 13) % 40) + '%' }} /><span className="sk" /><span className="sk" /></div>)}</Page>;
  const emptyState = nFilters > 0
    ? <div className="empty">No tickets match the filters.<br /><button className="btn" onClick={clearFilters}>Clear filters</button></div>
    : <div className="empty">No tickets here. Press <kbd>C</kbd> to create one.</div>;

  if (layout === 'list') {
    let n = -1;
    return (
      <Page crumb={crumb} bar2={bar2} bodyRef={bodyRef}>
        {groups.map(([k, g]) => {
          const wip = prefs.group === 'status' ? s.wip(k as Status) : 0, over = wip > 0 && g.length > wip;
          return <div key={k}>
            <div className="grp">{prefs.group === 'status' ? <><StatusIcon status={k as Status} />{s.text('STATUS', k)}</>
              : prefs.group === 'project' ? <><span className="dot" style={{ width: 9, height: 9, borderRadius: 2, background: s.project(k)?.Color }} />{s.project(k)?.Name ?? k}</>
              : <><PriorityIcon priority={k} />{PRIORITY_NAME[k]}</>}<span className="c">{g.length}</span>
              {over && <span className="warn"><Icon name="alert" size={13} />over WIP limit of {wip}</span>}<span className="sp" />
              <button className="ib" title="New ticket" onClick={() => openNew({ ...(prefs.group === 'status' ? { status: k as Status } : prefs.group === 'project' ? { Project: k } : { Priority: k }), ...(project ? { Project: project } : {}) })}><Icon name="plus" /></button></div>
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
        {!groups.length && emptyState}
      </Page>
    );
  }

  const cols = STATUS_ORDER.filter(k => (k !== 'DONE' || tab === 'all' || tab === 'done') && (k !== 'BACKLOG' || tab !== 'active'));
  const dragged = s.tickets.find(t => t.TicketUUID === dragId);
  return (
    <Page crumb={crumb} bar2={bar2}>
      <DndContext sensors={sensors} collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
        onDragCancel={() => setDragId(null)}
        onDragEnd={(e: DragEndEvent) => {
          setDragId(null);
          justDragged.current = Date.now();
          const t = s.tickets.find(x => x.TicketUUID === e.active.id), to = e.over?.id as Status | undefined;
          if (t && to && t.Status !== to) setStatus(t, to);
        }}>
        <div className="board">{cols.map(k => {
          const g = set.filter(t => t.Status === k).sort(sorter(prefs.sort)).slice(0, k === 'DONE' ? 20 : 999);
          const wip = s.wip(k), over = wip > 0 && g.length > wip;
          return (
            <Column key={k} status={k}>
              <div className="col-h"><StatusIcon status={k} />{s.text('STATUS', k)}<span className="c">{g.length}</span><span className="sp" />
                {wip > 0 && <span className={'wip' + (over ? ' over' : '')} title="Work-in-progress limit">{g.length}/{wip}</span>}
                <button className="ib" onClick={() => openNew({ status: k, ...(project ? { Project: project } : {}) })}><Icon name="plus" /></button></div>
              {g.map(t => <DraggableCard key={t.TicketUUID} t={t} hidden={dragId === t.TicketUUID} justDragged={justDragged} onPrio={prioMenu} />)}
            </Column>);
        })}</div>
        <DragOverlay dropAnimation={null}>{dragged && <div className="card overlay"><CardBody t={dragged} /></div>}</DragOverlay>
      </DndContext>
    </Page>
  );
}

const STATUS_VAR: Record<Status, string> = { BACKLOG: 'backlog', TODO: 'todo', PROG: 'prog', TEST: 'test', BLOCK: 'block', DONE: 'done' };
function Column({ status, children }: { status: Status; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={'col' + (isOver ? ' drop' : '')} style={{ ['--c' as string]: `var(--st-${STATUS_VAR[status]})` }}>{children}</div>;
}

function CardBody({ t, onPrio }: { t: Ticket; onPrio?: (e: React.MouseEvent, t: Ticket) => void }) {
  return <>
    <div className="t" style={{ marginTop: 0 }}><span>{t.Title}</span></div>
    <div className="tags"><TechTag code={t.Tech} /><span className="tag">{t.Area}</span>
      {t.TicketType === 'BUG' && <span className="tag" style={{ background: 'rgba(235,87,87,.16)', color: 'var(--danger)' }}>Bug</span>}</div>
    <div className="r3"><span className="muted num" style={{ fontSize: 12 }}>{t.TicketId}</span>
      <span onClick={e => onPrio?.(e, t)} onPointerDown={e => e.stopPropagation()}><PriorityIcon priority={t.Priority} /></span><Due t={t} short /><span className="sp" />
      <span className="muted num" style={{ fontSize: 12 }}>{Math.round(t.LoggedHours * 10) / 10}/{t.EstimateHours}h</span><Avatar name={t.Assignee} size={18} /></div>
  </>;
}

/** Card link; a drag starts after 6 px, so a normal click still opens the ticket */
function DraggableCard({ t, hidden, justDragged, onPrio }: { t: Ticket; hidden: boolean; justDragged: React.MutableRefObject<number>; onPrio: (e: React.MouseEvent, t: Ticket) => void }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: t.TicketUUID });
  return (
    <a ref={setNodeRef} {...attributes} {...listeners} className={'card' + (hidden ? ' dragging' : '')} href={'#ticket/' + t.TicketId}
      onClick={e => { if (Date.now() - justDragged.current < 300) e.preventDefault() }}>
      <CardBody t={t} onPrio={onPrio} />
    </a>);
}
