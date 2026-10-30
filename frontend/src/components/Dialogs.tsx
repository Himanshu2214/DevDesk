// New ticket, log time and the command palette – opened from anywhere via useDialogs().
import { createContext, useContext, useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { AnimatePresence, m } from 'motion/react';
import { api } from '../api';
import type { NewTicket, Status, Ticket } from '../api';
import { useArticles, useObjects, useStore, useTransports } from '../store';
import { recentTickets } from '../lib/recent';
import { isoDate, isOpen, PRIORITY_NAME, STATUS_NAME, STATUS_ORDER } from '../lib/format';
import { Dot, Icon, PriorityIcon, Spinner, StatusIcon } from './Icons';
import { go, MenuSelect, menuOpen, useFieldMenus, useMenu } from './ui';
import { DatePicker, DuePicker } from './DuePicker';
import { dialogMotion, scrimMotion } from '../lib/motion';

interface Dialogs { openNew(pre?: Partial<NewTicket>): void; openLog(ticketUUID?: string): void; openPalette(): void; openStop(t: Ticket): void }
const Ctx = createContext<Dialogs>({ openNew() {}, openLog() {}, openPalette() {}, openStop() {} });
export const useDialogs = () => useContext(Ctx);

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [newPre, setNewPre] = useState<Partial<NewTicket> | null>(null);
  const [log, setLog] = useState<string | null | undefined>(undefined);
  const [palette, setPalette] = useState(false);
  const [stop, setStop] = useState<Ticket | null>(null);
  const value: Dialogs = { openNew: (pre = {}) => setNewPre(pre), openLog: id => setLog(id ?? null), openPalette: () => setPalette(true), openStop: t => setStop(t) };
  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {newPre && <NewTicketDialog key="new" pre={newPre} close={() => setNewPre(null)} />}
        {log !== undefined && <LogTimeDialog key="log" ticketUUID={log} close={() => setLog(undefined)} />}
        {palette && <Palette key="palette" close={() => setPalette(false)} />}
        {stop && <StopTimerDialog key="stop" ticket={stop} close={() => setStop(null)} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** Centered dialog with backdrop; fades/scales in and out (the parent wraps it in AnimatePresence) */
export function Modal({ close, width, label, children }: { close(): void; width?: number; label?: string; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !menuOpen()) close() };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [close]);
  return <m.div className="modal on" {...scrimMotion} onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
    <m.div className="dlg" role="dialog" aria-modal="true" aria-label={label} {...dialogMotion} style={width ? { width: `min(${width}px,94vw)` } : undefined}>{children}</m.div></m.div>;
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
    <Modal close={close} label="New ticket">
      <div className="top"><span className="chip">SLATE·SPACE</span><span>›</span><span>New ticket</span><span className="sp" />
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
        <DuePicker value={d.DueDate} onChange={v => set({ DueDate: v })} className="pill" />
        <input type="number" min={0} step={0.5} title="Estimate (h)" style={{ width: 70 }} value={d.EstimateHours} onChange={e => set({ EstimateHours: Number(e.target.value) })} />
        <input placeholder="Reference (optional)" style={{ flex: 1, minWidth: 160 }} value={d.Reference} onChange={e => set({ Reference: e.target.value })} />
      </div>
      <div className="ft"><span className="muted" style={{ fontSize: 12 }}><kbd>Ctrl</kbd> <kbd>Enter</kbd> to create</span><span className="sp" />
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={!d.Title.trim() || busy} aria-busy={busy} onClick={create}>{busy && <Spinner />}{busy ? 'Creating…' : 'Create ticket'}</button></div>
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
  const activities = s.values.filter(v => v.ListType === 'ACTIVITY').map(v => ({ value: v.Code, label: v.Text, icon: <Dot color={v.Color || 'var(--muted)'} /> }));
  const [comment, setComment] = useState('');
  async function save() {
    const t = s.tickets.find(x => x.TicketUUID === id); const h = Number(hours);
    if (!t || !(h > 0)) return;
    const ok = await s.run(() => api.createChild(t, '_Worklog', { WorkDate: date, Hours: h, Activity: activity, CommentText: comment }),
      { uuids: [t.TicketUUID], ok: `Logged ${h} h on ${t.TicketId}` });
    if (ok) close();
  }
  return (
    <Modal close={close} width={520} label="Log time">
      <div className="top"><span>Log time</span><span className="sp" /><button className="ib" onClick={close}><Icon name="x" /></button></div>
      <div className="form" style={{ padding: '14px 16px' }}>
        <div className="full"><label>Ticket</label><MenuSelect label="Ticket" value={id} onChange={setId} options={options.map(t => ({ value: t.TicketUUID, label: `${t.TicketId} · ${t.Title}`, icon: <StatusIcon status={t.Status} /> }))} /></div>
        <div><label>Date</label><DatePicker label="Work date" value={date} max={isoDate(new Date())} onChange={setDate} className="sel-btn" /></div>
        <div><label>Hours</label><input type="number" min={0.25} max={24} step={0.25} autoFocus value={hours} onChange={e => setHours(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} /></div>
        <div className="full"><label>Activity</label><MenuSelect label="Activity" value={activity} onChange={setActivity} options={activities} /></div>
        <div className="full"><label>Comment</label><input placeholder="Optional" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} /></div>
      </div>
      <div className="ft"><span className="sp" /><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Log time</button></div>
    </Modal>
  );
}

/* ---------- Stop timer: check or correct the hours before they are logged ---------- */
export const TIMER_WARN_H = 8;
const quarter = (h: number) => Math.max(0.25, Math.min(24, Math.round(h * 4) / 4));
function StopTimerDialog({ ticket, close }: { ticket: Ticket; close(): void }) {
  const s = useStore();
  const elapsed = ticket.TimerStartedAt ? (Date.now() - Date.parse(ticket.TimerStartedAt)) / 36e5 : 0;
  const long = elapsed > TIMER_WARN_H;
  const [hours, setHours] = useState(String(long ? 1 : quarter(elapsed)));
  const [activity, setActivity] = useState(ticket.Status === 'TEST' ? 'TEST' : ticket.Status === 'TODO' ? 'ANA' : 'CODE');
  const activities = s.values.filter(v => v.ListType === 'ACTIVITY').map(v => ({ value: v.Code, label: v.Text, icon: <Dot color={v.Color || 'var(--muted)'} /> }));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const fmt = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days ${Math.round(h % 24)} h` : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`);

  /** stopTimer logs the measured time; the entry is then corrected (or deleted) to what the user confirmed */
  async function finish(keep: boolean) {
    const h = Number(hours);
    if (keep && !(h > 0 && h <= 24)) return;
    setBusy(true);
    const ok = await s.run(async () => {
      await api.stopTimer(ticket);
      const fresh = await api.getTicket(ticket.TicketUUID);
      const entry = [...(fresh._Worklog ?? [])].filter(w => w.EntrySource === 'TIMER').sort((a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''))[0];
      if (!entry) return;
      if (!keep) await api.deleteChild('Worklog', entry as never);
      else if (entry.Hours !== h || entry.Activity !== activity || comment) await api.updateChild('Worklog', entry as never, { Hours: h, Activity: activity, CommentText: comment || entry.CommentText });
    }, { uuids: [ticket.TicketUUID], ok: keep ? `Logged ${h} h on ${ticket.TicketId}` : 'Timer stopped, time discarded' });
    setBusy(false);
    if (ok) close();
  }
  return (
    <Modal close={close} width={500} label="Stop timer">
      <div className="top"><span>Stop timer · {ticket.TicketId}</span><span className="sp" /><button className="ib" aria-label="Close" onClick={close}><Icon name="x" /></button></div>
      <div style={{ padding: '14px 16px 0' }}>
        <div className="t2" style={{ fontWeight: 500 }}>{ticket.Title}</div>
        <div className={long ? 'warnbox' : 'muted'} style={{ marginTop: 8 }}>
          {long ? <>The timer has been running for <b>{fmt(elapsed)}</b> – it was probably not stopped. Enter the time you actually worked.</> : <>Running for {fmt(elapsed)}.</>}</div>
      </div>
      <div className="form" style={{ padding: '12px 16px' }}>
        <div><label>Hours to log</label><input type="number" min={0.25} max={24} step={0.25} autoFocus value={hours} onChange={e => setHours(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') finish(true) }} /></div>
        <div><label>Activity</label><MenuSelect label="Activity" value={activity} onChange={setActivity} options={activities} /></div>
        <div className="full"><label>Comment</label><input placeholder="Optional" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') finish(true) }} /></div>
      </div>
      <div className="ft"><button className="btn" disabled={busy} onClick={() => finish(false)}>Discard time</button><span className="sp" />
        <button className="btn" onClick={close}>Keep running</button><button className="btn primary" disabled={busy} aria-busy={busy} onClick={() => finish(true)}>{busy && <Spinner />}Log {Number(hours) || 0} h</button></div>
    </Modal>
  );
}

/* ---------- Command palette (cmdk: fuzzy search, keyboard navigation) ---------- */
function Palette({ close }: { close(): void }) {
  const s = useStore();
  const { openNew, openLog, openStop } = useDialogs();
  const [search, setSearch] = useState('');
  const objects = useObjects(), articles = useArticles(), transports = useTransports();
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
    <Modal close={close} width={640} label="Command palette">
      <Command className="pal" label="Command palette" loop>
        <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Search tickets, or type a command…" />
        <Command.List className="res">
          <Command.Empty>No results</Command.Empty>
          {current && <Command.Group heading={current.TicketId}>
            {STATUS_ORDER.filter(k => k !== current.Status).map(k => (
              <Command.Item key={k} value={`set status ${STATUS_NAME[k]}`} onSelect={() => pick(() => s.changeStatus(current, k))}>
                <StatusIcon status={k} /><span>Set status → {STATUS_NAME[k]}</span></Command.Item>))}
            {action(current.TimerStartedAt ? 'Stop timer and log time' : 'Start timer', current.TimerStartedAt ? 'stop' : 'play',
              () => current.TimerStartedAt ? openStop(current) : s.run(() => api.startTimer(current), { uuids: [current.TicketUUID], ok: `Timer started on ${current.TicketId}` }))}
            {action('Log time on this ticket', 'clock', () => openLog(current.TicketUUID))}
          </Command.Group>}
          {!search && recent.length > 0 && <Command.Group heading="Recent">{recent.map(t => ticketItem(t, 'recent'))}</Command.Group>}
          {search && <Command.Group heading="Tickets">{s.tickets.map(t => ticketItem(t, 'ticket'))}</Command.Group>}
          {search && <Command.Group heading="Objects">{(objects.data ?? []).map(o =>
            <Command.Item key={o.ObjectUUID} value={`object ${o.ObjectType} ${o.ObjectName} ${o.Description} ${o.PackageName}`} onSelect={() => pick(() => go('objects/' + o.ObjectUUID))}>
              <Icon name="cube" size={14} style={{ color: 'var(--muted)' }} /><span className="pal-t mono">{o.ObjectName}</span><span className="pal-k">{o.ObjectType}</span></Command.Item>)}</Command.Group>}
          {search && <Command.Group heading="Knowledge">{(articles.data ?? []).map(a =>
            <Command.Item key={a.ArticleUUID} value={`article ${a.ArticleId} ${a.Title} ${a.Tags}`} onSelect={() => pick(() => go('kb/' + a.ArticleUUID))}>
              <Icon name="book" size={14} style={{ color: 'var(--muted)' }} /><span className="muted num">{a.ArticleId}</span><span className="pal-t">{a.Title}</span></Command.Item>)}</Command.Group>}
          {search && <Command.Group heading="Transports">{(transports.data ?? []).map(x =>
            <Command.Item key={x.TransportUUID} value={`transport ${x.TrKorr} ${x.TrText}`} onSelect={() => pick(() => go('transports/' + x.TrKorr))}>
              <Icon name="truck" size={14} style={{ color: 'var(--muted)' }} /><span className="mono">{x.TrKorr}</span><span className="pal-t">{x.TrText}</span><span className="pal-k">{x.Phase}</span></Command.Item>)}</Command.Group>}
          <Command.Group heading="Actions">
            {action('New ticket', 'plus', () => openNew(), 'C')}
            {action('Log time…', 'clock', () => openLog())}
            {action('New transport', 'truck', () => go('transports/new'))}
            {action('Register object', 'cube', () => go('objects/new'))}
            {action('Reload data', 'refresh', () => s.reload())}
          </Command.Group>
          <Command.Group heading="Go to">
            {action('Home', 'home', () => go('home'))}
            {action('Inbox', 'inbox', () => go('inbox'))}
            {action('My tickets', 'my', () => go('list/active'))}
            {action('Overdue', 'alert', () => go('list/overdue'))}
            {action('Timesheet', 'clock', () => go('timesheet'))}
            {action('Calendar', 'cal', () => go('calendar'))}
            {action('Transports', 'truck', () => go('transports'))}
            {action('Objects', 'cube', () => go('objects'))}
            {action('Knowledge', 'book', () => go('kb'))}
          </Command.Group>
        </Command.List>
      </Command>
    </Modal>
  );
}
