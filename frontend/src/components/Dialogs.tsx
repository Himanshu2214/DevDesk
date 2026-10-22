// New ticket, log time and the command palette – opened from anywhere via useDialogs().
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import type { NewTicket, Status, Ticket } from '../api';
import { useStore } from '../store';
import { isoDate, isOpen, PRIORITY_NAME, STATUS_NAME } from '../lib/format';
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
    if (ok && created) { close(); await s.loadTicket(created.TicketUUID); go('ticket/' + created.TicketId) }
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

/* ---------- Command palette ---------- */
function Palette({ close }: { close(): void }) {
  const s = useStore();
  const { openNew, openLog } = useDialogs();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const cmds: [string, () => void][] = [['New ticket', () => openNew()], ['Log time…', () => openLog()], ['Go to Home', () => go('home')], ['Go to Inbox', () => go('inbox')],
    ['Go to My tickets', () => go('list/active')], ['Go to Timesheet', () => go('timesheet')], ['Reload data', () => s.reload()]];
  const ql = q.trim().toLowerCase();
  const items: { key: string; group: string; node: React.ReactNode; hint: string; run(): void }[] = [
    ...(ql ? s.tickets.filter(t => `${t.TicketId} ${t.Title} ${t.Requester}`.toLowerCase().includes(ql)).slice(0, 8).map(t => ({
      key: t.TicketUUID, group: 'Tickets', hint: s.text('STATUS', t.Status), run: () => go('ticket/' + t.TicketId),
      node: <><StatusIcon status={t.Status as Status} /><span className="muted num">{t.TicketId}</span><span>{t.Title}</span></> })) : []),
    ...cmds.filter(([l]) => !ql || l.toLowerCase().includes(ql)).map(([l, fn]) => ({ key: l, group: 'Commands', hint: '', run: fn,
      node: <><Icon name="move" size={14} style={{ color: 'var(--muted)' }} /><span>{l}</span></> })),
  ];
  const pick = (i: number) => { const it = items[i]; if (it) { close(); it.run() } };
  let lastGroup = '';
  return (
    <Modal close={close} width={640}>
      <div className="pal">
        <input autoFocus placeholder="Search tickets or type a command" value={q} onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { setSel(x => Math.min(x + 1, items.length - 1)); e.preventDefault() }
            if (e.key === 'ArrowUp') { setSel(x => Math.max(x - 1, 0)); e.preventDefault() }
            if (e.key === 'Enter') pick(sel);
          }} />
        <div className="res">{items.map((it, i) => {
          const head = it.group !== lastGroup ? <div className="g" key={'g' + it.group}>{(lastGroup = it.group)}</div> : null;
          return <div key={it.key}>{head}<div className={'mi' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, height: 36, padding: '0 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {it.node}<span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{it.hint}</span></div></div>;
        })}{!items.length && <div className="empty">No results</div>}</div>
      </div>
    </Modal>
  );
}
