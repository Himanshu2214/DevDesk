import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate, isOpen, STATUS_ORDER } from '../lib/format';
import { Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Due, Empty, go, isTyping, Page, ProjectChip, TabIndicator, TechTag, useFieldMenus, useMenu, XBtn } from '../components/ui';
import { VIEWS, type ViewKey } from '../components/Sidebar';
import { useDialogs } from '../components/Dialogs';
import { activeFilterCount, applyFilters, EMPTY_PREFS, rememberOrder, sorter, useListPrefs } from '../lib/listPrefs';
import type { DueFilter, FilterField, GroupBy, SortBy } from '../lib/listPrefs';
import { PRIORITY_NAME } from '../lib/format';
import AnimatedTags from '../components/smoothui/animated-tags';
import { type ExportFormat, exportSheets } from '../lib/export';
import { ShareButton } from '../components/ShareProject';
import { SharedMark } from '../components/ShareTicket';

// the board (with dnd-kit) loads with the first board view, not with the app
const Board = lazy(() => import('./Board'));
const GROUP_ORDER: Status[] = ['PROG', 'TEST', 'BLOCK', 'TODO', 'BACKLOG', 'DONE'];
type Layout = 'list' | 'board';
/** until you pick one: the list on a phone (a board scrolls sideways there), the board on wider screens */
const PHONE_DEFAULT = (): Layout => (typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches ? 'list' : 'board');

/** route: list/<tab|view> or project/<KEY>?<tab> */
export function TicketList({ route }: { route: string }) {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const { openNew } = useDialogs();
  const [layout, setLayout] = useState<Layout>(() => { try { return (localStorage.getItem('devdesk-layout') as Layout) || PHONE_DEFAULT() } catch { return PHONE_DEFAULT() } });
  const [sel, setSel] = useState(0);
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
  const filterPill = (f: FilterField, label: string, icon: string) => {
    const n = prefs.filters[f].length;
    return <XBtn key={f} icon={icon} title={label} aria-label={label} open={!!n} className={'fpill' + (n ? ' active' : '')} onClick={e => menu(e.currentTarget,
      menus[f]({ [f]: '' } as never).map(i => ({ ...i, checked: prefs.filters[f].includes(i.value) })), v => toggleFilter(f, v), f === 'Project' || f === 'Tech')}
      label={<>{label}{n ? <span className="c num">{' · ' + n}</span> : null}<Icon name="down" size={12} /></>} />;
  };
  // export: every ticket of this view with the filters applied (also the older done ones the list leaves out), in the chosen sort
  const exportList = (format: ExportFormat) => {
    const rows = [...set].sort(sorter(prefs.sort)).map(t => [t.TicketId, t.Title, s.text('STATUS', t.Status), PRIORITY_NAME[t.Priority] ?? t.Priority, s.project(t.Project)?.Name ?? t.Project,
      t.Area, s.text('TECH', t.Tech), s.text('TYPE', t.TicketType), t.Requester, t.DueDate ?? '', t.EstimateHours, Math.round(t.LoggedHours * 100) / 100,
      t.CreatedAt?.slice(0, 10) ?? '', t.ClosedAt?.slice(0, 10) ?? '']);
    exportSheets([{ name: 'Tickets', rows, columns: [{ header: 'Ticket', width: 11 }, { header: 'Title', width: 48 }, { header: 'Status', width: 12 }, { header: 'Priority', width: 10 },
      { header: 'Project', width: 22 }, { header: 'Area', width: 8 }, { header: 'Tech', width: 12 }, { header: 'Type', width: 16 }, { header: 'Requester', width: 18 },
      { header: 'Due', width: 11 }, { header: 'Estimate (h)', width: 12 }, { header: 'Logged (h)', width: 11 }, { header: 'Created', width: 11 }, { header: 'Closed', width: 11 }] }],
      'slate-space-tickets', format);
    s.toast(`Exported ${rows.length} tickets`);
  };
  const DUE: [DueFilter, string][] = [['any', 'Any due date'], ['overdue', 'Overdue'], ['week', 'Due within 7 days'], ['none', 'No due date']];
  const GROUP: [GroupBy, string][] = [['status', 'Group by status'], ['project', 'Group by project'], ['priority', 'Group by priority']];
  const SORT: [SortBy, string][] = [['urgency', 'Sort: priority, then due'], ['due', 'Sort: due date'], ['priority', 'Sort: priority'], ['created', 'Sort: newest first'], ['updated', 'Sort: recently changed']];
  const filterBar = <>
    {filterPill('Priority', 'Priority', 'priority')}{filterPill('Project', 'Project', 'folder')}{filterPill('Tech', 'Tech', 'tag')}{filterPill('TicketType', 'Type', 'bug')}
    <XBtn icon="cal" title="Due date" aria-label="Due date" open={prefs.due !== 'any'} className={'fpill' + (prefs.due !== 'any' ? ' active' : '')}
      onClick={e => menu(e.currentTarget, DUE.map(([v, l]) => ({ label: l, value: v, checked: prefs.due === v })), v => setPrefs({ ...prefs, due: v as DueFilter }), false)}
      label={<>{prefs.due === 'any' ? 'Due' : DUE.find(d => d[0] === prefs.due)![1]}<Icon name="down" size={12} /></>} />
    {nFilters > 0 && <XBtn icon="x" open onClick={clearFilters} title="Clear all filters" label={'Clear · ' + nFilters} />}
    <XBtn icon="list" title="Grouping and sorting" aria-label="Display" onClick={e => menu(e.currentTarget, [
      ...(layout === 'list' ? GROUP.map(([v, l]) => ({ label: l, value: 'g:' + v, checked: prefs.group === v })) : []),
      ...SORT.map(([v, l]) => ({ label: l, value: 's:' + v, checked: prefs.sort === v }))],
      v => setPrefs(v.startsWith('g:') ? { ...prefs, group: v.slice(2) as GroupBy } : { ...prefs, sort: v.slice(2) as SortBy }), false)}
      label="Display" />
    <XBtn icon="download" title="Export the tickets shown" aria-label="Export" onClick={e => menu(e.currentTarget, [
      { label: 'Excel (.xlsx)', value: 'xlsx' }, { label: 'CSV (.csv)', value: 'csv' }], v => exportList(v as ExportFormat), false)} label="Export" />
  </>;
  // active filters as SmoothUI animated tags; clicking a tag removes that filter
  const FIELD_LABEL: Record<FilterField, string> = { Priority: 'Priority', Project: 'Project', Tech: 'Tech', TicketType: 'Type' };
  const valueText = (f: FilterField, v: string) => f === 'Priority' ? PRIORITY_NAME[v] ?? v : f === 'Project' ? s.project(v)?.Name ?? v : s.text(f === 'Tech' ? 'TECH' : 'TYPE', v);
  const tagKeys = [...(Object.keys(prefs.filters) as FilterField[]).flatMap(f => prefs.filters[f].map(v => `${f}:${v}`)), ...(prefs.due !== 'any' ? [`due:${prefs.due}`] : [])];
  const tagLabels = Object.fromEntries(tagKeys.map(k => {
    const [f, v] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    return [k, f === 'due' ? `Due: ${DUE.find(d => d[0] === v)?.[1] ?? v}` : `${FIELD_LABEL[f as FilterField]}: ${valueText(f as FilterField, v)}`];
  }));
  const removeTag = (next: string[]) => {
    const gone = tagKeys.find(k => !next.includes(k)); if (!gone) return;
    const [f, v] = [gone.slice(0, gone.indexOf(':')), gone.slice(gone.indexOf(':') + 1)];
    if (f === 'due') setPrefs({ ...prefs, due: 'any' }); else toggleFilter(f as FilterField, v);
  };
  const bar2 = <>
    {view ? <span className="muted">{set.length} tickets</span> : ([['active', 'Active', (t: Ticket) => isOpen(t) && t.Status !== 'BACKLOG'], ['backlog', 'Backlog', (t: Ticket) => t.Status === 'BACKLOG'], ['all', 'All', () => true]] as const)
      .map(([k, l, f]) => <a key={k} className={'pill' + (tab === k ? ' on' : '')} href={base + k}>{tab === k && <TabIndicator id="list-tab" />}{l}<span className="c num">{count(f)}</span></a>)}
    <span style={{ width: 8 }} />{filterBar}
    <span className="sp" />
    <div className="xseg"><XBtn icon="list" label="List" title="List" aria-label="List" on={layout === 'list'} open={layout === 'list'} indicator="layout-seg" onClick={() => setLayout('list')} />
      <XBtn icon="board" label="Board" title="Board" aria-label="Board" on={layout === 'board'} open={layout === 'board'} indicator="layout-seg" onClick={() => setLayout('board')} /></div>
    <AnimatedTags compact className="filter-tags" initialTags={[]} selectedTags={tagKeys} labels={tagLabels} onChange={removeTag} />
  </>;

  if (!s.ready) return <Page crumb={crumb}>{[...Array(8)].map((_, i) => <div key={i} className="sk-row"><span className="sk" /><span className="sk" />
    <span className="sk" style={{ borderRadius: '50%', width: 14, height: 14 }} /><span className="sk" style={{ width: (45 + (i * 13) % 40) + '%' }} /><span className="sk" /><span className="sk" /></div>)}</Page>;
  const emptyState = nFilters > 0
    ? <Empty icon="search" title="No tickets match the filters" action={<button className="btn" onClick={clearFilters}>Clear filters</button>} />
    : <Empty icon="check" title="No tickets here">Press <kbd>C</kbd> to create one.</Empty>;

  if (layout === 'list') {
    let n = -1;
    return (
      <Page crumb={crumb} bar2={bar2} bodyRef={bodyRef} right={p && <ShareButton project={p} />}>
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
                <span className="ttl">{t.Title}<SharedMark t={t} /><small>{t.Requester}</small></span>
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

  // views (overdue, blocked, recently done …): only the columns that hold tickets, so e.g. Done is not pushed off-screen by empty columns
  const used = STATUS_ORDER.filter(k => set.some(t => t.Status === k));
  const cols = view && used.length ? used : STATUS_ORDER.filter(k => (k !== 'DONE' || tab === 'all' || tab === 'done') && (k !== 'BACKLOG' || tab !== 'active'));
  return (
    <Page crumb={crumb} bar2={bar2} right={p && <ShareButton project={p} />}>
      <Suspense fallback={<div className="board">{cols.map(k => <div key={k} className="col"><div className="sk" style={{ height: 120, margin: 8 }} /></div>)}</div>}>
        <Board cols={cols} project={project} setStatus={setStatus} onPrio={prioMenu}
          column={k => set.filter(t => t.Status === k).sort(sorter(prefs.sort)).slice(0, k === 'DONE' ? 20 : 999)} />
      </Suspense>
    </Page>
  );
}

