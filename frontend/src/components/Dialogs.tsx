// New ticket, log time and the command palette – opened from anywhere via useDialogs().
import { createContext, useContext, useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { api } from '../api';
import type { NewTicket, Status, Ticket } from '../api';
import { useStore, withStatus } from '../store';
import { recentTickets } from '../lib/recent';
import { isoDate, isOpen, PRIORITY_NAME, STATUS_NAME, STATUS_ORDER } from '../lib/format';
import { Dot, Icon, PriorityIcon, StatusIcon } from './Icons';
import { go, useFieldMenus, useMenu } from './ui';

interface Dialogs { openNew(pre?: Partial<NewTicket>): void; openLog(ticketUUID?: string): void; openPalette(): void }
const Ctx = createContext<Dialogs>({ openNew() {}, openLog() {}, openPalette() {} });
export const useDialogs = () => useContext(Ctx);

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [newPre, setNewPre] = useState<Partial<NewTicket> | null>(null);
  const [log, setLog] = useState<string | null | undefined>(undefined);
  const [palette, setPalette] = useState(false);
  const value: Dialogs = { openNew: (pre = {}) => setNewPre(pre), openLog: id => setLog(id ?? null), openPalette: () => setPalette(true) };
  return (
    <Ctx.Provider value={value}>
      {children}
      {newPre && <NewTicketDialog pre={newPre} close={() => setNewPre(null)} />}
      {log !== undefined && <LogTimeDialog ticketUUID={log} close={() => setLog(undefined)} />}
      {palette && <Palette close={() => setPalette(false)} />}
    </Ctx.Provider>
  );
}

function Modal({ close, width, children }: { close(): void; width?: number; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.menu.on')) close() };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [close]);
  return <div className="modal on" onMouseDown={e => { if (e.target === e.currentTarget) close() }}><div className="dlg" style={width ? { width: `min(${width}px,94vw)` } : undefined}>{children}</div></div>;
}

/* ---------- New ticket ---------- */
function NewTicketDialog({ pre, close }: { pre: Partial<NewTicket>; close(): void }) {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const [d, setD] = useState<NewTicket>({
    Title: '', Description: '', Priority: '3', Project: s.projects[0]?.Project ?? '', Area: 'SD', Tech: 'ABAP', TicketType: 'CR', Environment: 'DEV',
    Requester: '', Reference: '', DueDate: isoDate(new Date(Date.now() + 7 * 864e5)), EstimateHours: 4, acceptance: [], status: 'TODO', ...pre,
  });
  const [acc, setAcc] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewTicket>) => setD(x => ({ ...x, ...p }));
  const pill = (field: 'status' | 'Priority' | 'Project' | 'Area' | 'Tech' | 'TicketType' | 'Environment', label: React.ReactNode) =>
    <button className="pill" onClick={e => menu(e.currentTarget, field === 'status' ? menus.status({ Status: d.status }) : menus[field](d as never), v => set({ [field]: v } as Partial<NewTicket>))}>{label}</button>;
  const requesters = [...new Set(s.tickets.map(t => t.Requester).filter(Boolean))];

  async function create() {
    if (!d.Title.trim() || busy) return;
    setBusy(true);
    let created: Ticket | undefined;
    const ok = await s.run(async () => { created = await api.createTicket({ ...d, acceptance: acc.split('\n').map(x => x.trim()).filter(Boolean) }) }, { ok: 'Ticket created' });
    setBusy(false);
    if (ok && created) { close(); go('ticket/' + created.TicketId) }
  }
  const p = s.project(d.Project);
  return (
    <Modal close={close}>
      <div className="top"><span className="chip">DevDesk</span><span>›</span><span>New ticket</span><span className="sp" />
        <button className="ib" onClick={close} title="Close (Esc)"><Icon name="x" /></button></div>
      <input className="nt-title" autoFocus placeholder="Ticket title" value={d.Title} onChange={e => set({ Title: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) create() }} />
      <textarea className="nt-desc" style={{ minHeight: 64 }} placeholder="Description – what is needed and where" value={d.Description} onChange={e => set({ Description: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) create() }} />
      <textarea className="nt-desc" style={{ minHeight: 56 }} placeholder="Acceptance criteria – one per line (each becomes a test case)" value={acc} onChange={e => setAcc(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) create() }} />
      <div className="pills">
        {pill('status', <><StatusIcon status={d.status} />{STATUS_NAME[d.status]}</>)}
        {pill('Priority', <><PriorityIcon priority={d.Priority} />{PRIORITY_NAME[d.Priority]}</>)}
        {pill('Project', <><Dot color={p?.Color ?? 'var(--muted)'} />{p?.Name ?? 'Project'}</>)}
        {pill('Area', <><Icon name="folder" size={13} />{d.Area}</>)}
        {pill('Tech', <><Dot color={s.color('TECH', d.Tech)} />{s.text('TECH', d.Tech)}</>)}
        {pill('TicketType', <><Icon name="tag" size={13} />{s.text('TYPE', d.TicketType)}</>)}
        {pill('Environment', <><Icon name="env" size={13} />{d.Environment}</>)}
        <input placeholder="Requester" list="reqList" value={d.Requester} onChange={e => set({ Requester: e.target.value })} />
        <datalist id="reqList">{requesters.map(r => <option key={r} value={r} />)}</datalist>
        <input type="date" title="Due date" value={d.DueDate} onChange={e => set({ DueDate: e.target.value })} />
        <input type="number" min={0} step={0.5} title="Estimate (h)" style={{ width: 70 }} value={d.EstimateHours} onChange={e => set({ EstimateHours: Number(e.target.value) })} />
        <input placeholder="Reference (optional)" style={{ flex: 1, minWidth: 160 }} value={d.Reference} onChange={e => set({ Reference: e.target.value })} />
      </div>
      <div className="ft"><span className="muted" style={{ fontSize: 12 }}><kbd>Ctrl</kbd> <kbd>Enter</kbd> to create</span><span className="sp" />
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={!d.Title.trim() || busy} onClick={create}>{busy ? 'Creating…' : 'Create ticket'}</button></div>
    </Modal>
  );
}

/* ---------- Log time ---------- */
function LogTimeDialog({ ticketUUID, close }: { ticketUUID: string | null; close(): void }) {
  const s = useStore();
  const options = s.tickets.filter(t => isOpen(t) || t.TicketUUID === ticketUUID).sort((a, b) => b.TicketNo.localeCompare(a.TicketNo));
  const [id, setId] = useState(ticketUUID ?? options[0]?.TicketUUID ?? '');
  const [date, setDate] = useState(isoDate(new Date()));
  const [hours, setHours] = useState('1');
  const [activity, setActivity] = useState('CODE');
  const [comment, setComment] = useState('');
  async function save() {
    const t = s.tickets.find(x => x.TicketUUID === id); const h = Number(hours);
    if (!t || !(h > 0)) return;
    const ok = await s.run(() => api.createChild(t, '_Worklog', { WorkDate: date, Hours: h, Activity: activity, CommentText: comment }),
      { uuids: [t.TicketUUID], ok: `Logged ${h} h on ${t.TicketId}` });
    if (ok) close();
  }
  return (
    <Modal close={close} width={520}>
      <div className="top"><span>Log time</span><span className="sp" /><button className="ib" onClick={close}><Icon name="x" /></button></div>
      <div className="form" style={{ padding: '14px 16px' }}>
        <div className="full"><label>Ticket</label><select value={id} onChange={e => setId(e.target.value)}>{options.map(t => <option key={t.TicketUUID} value={t.TicketUUID}>{t.TicketId} · {t.Title}</option>)}</select></div>
        <div><label>Date</label><input type="date" value={date} max={isoDate(new Date())} onChange={e => setDate(e.target.value)} /></div>
        <div><label>Hours</label><input type="number" min={0.25} max={24} step={0.25} autoFocus value={hours} onChange={e => setHours(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} /></div>
        <div className="full"><label>Activity</label><select value={activity} onChange={e => setActivity(e.target.value)}>{s.values.filter(v => v.ListType === 'ACTIVITY').map(v => <option key={v.Code} value={v.Code}>{v.Text}</option>)}</select></div>
        <div className="full"><label>Comment</label><input placeholder="Optional" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} /></div>
      </div>
      <div className="ft"><span className="sp" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Log time</button></div>
    </Modal>
  );
}

/* ---------- Command palette (cmdk: fuzzy search, keyboard navigation) ---------- */
function Palette({ close }: { close(): void }) {
  const s = useStore();
  const { openNew, openLog } = useDialogs();
  const [search, setSearch] = useState('');
  const route = location.hash.slice(1);
  const current = route.startsWith('ticket/') ? s.tickets.find(t => t.TicketId === decodeURIComponent(route.slice(7))) : undefined;
  const recent = recentTickets().map(id => s.tickets.find(t => t.TicketId === id)).filter((t): t is Ticket => !!t);
  const pick = (fn: () => void) => { close(); fn() };
  const ticketItem = (t: Ticket, group: string) => (
    <Command.Item key={group + t.TicketUUID} value={`${group} ${t.TicketId} ${t.Title} ${t.Requester} ${s.project(t.Project)?.Name ?? ''}`} onSelect={() => pick(() => go('ticket/' + t.TicketId))}>
      <StatusIcon status={t.Status as Status} /><span className="muted num">{t.TicketId}</span><span className="pal-t">{t.Title}</span><span className="pal-k">{s.text('STATUS', t.Status)}</span>
    </Command.Item>);
  const action = (label: string, icon: string, fn: () => void, hint = '') => (
    <Command.Item key={label} value={label} onSelect={() => pick(fn)}><Icon name={icon} size={14} style={{ color: 'var(--muted)' }} /><span>{label}</span><span className="pal-k">{hint}</span></Command.Item>);
  return (
    <Modal close={close} width={640}>
      <Command className="pal" label="Command palette" loop>
        <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Search tickets, or type a command…" />
        <Command.List className="res">
          <Command.Empty>No results</Command.Empty>
          {current && <Command.Group heading={current.TicketId}>
            {STATUS_ORDER.filter(k => k !== current.Status).map(k => (
              <Command.Item key={k} value={`set status ${STATUS_NAME[k]}`} onSelect={() => pick(() => s.run(() => api.setStatus(current, k), { uuids: [current.TicketUUID], optimistic: withStatus(k), ok: `Moved to ${STATUS_NAME[k]}` }))}>
                <StatusIcon status={k} /><span>Set status → {STATUS_NAME[k]}</span></Command.Item>))}
            {action(current.TimerStartedAt ? 'Stop timer and log time' : 'Start timer', current.TimerStartedAt ? 'stop' : 'play',
              () => s.run(() => current.TimerStartedAt ? api.stopTimer(current) : api.startTimer(current), { uuids: [current.TicketUUID] }))}
            {action('Log time on this ticket', 'clock', () => openLog(current.TicketUUID))}
          </Command.Group>}
          {!search && recent.length > 0 && <Command.Group heading="Recent">{recent.map(t => ticketItem(t, 'recent'))}</Command.Group>}
          {search && <Command.Group heading="Tickets">{s.tickets.map(t => ticketItem(t, 'ticket'))}</Command.Group>}
          <Command.Group heading="Actions">
            {action('New ticket', 'plus', () => openNew(), 'C')}
            {action('Log time…', 'clock', () => openLog())}
            {action('Reload data', 'refresh', () => s.reload())}
          </Command.Group>
          <Command.Group heading="Go to">
            {action('Home', 'home', () => go('home'))}
            {action('Inbox', 'inbox', () => go('inbox'))}
            {action('My tickets', 'my', () => go('list/active'))}
            {action('Overdue', 'alert', () => go('list/overdue'))}
            {action('Timesheet', 'clock', () => go('timesheet'))}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  );
}
