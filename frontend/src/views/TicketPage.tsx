import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ChildNav, ChildSet, Status, TestCase, Ticket } from '../api';
import { useStore } from '../store';
import { ago, fmtDate, PRIORITY_NAME, r1 } from '../lib/format';
import { Dot, Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Avatar, Due, go, isTyping, Page, ProjectChip, TechTag, useFieldMenus, useMenu } from '../components/ui';
import { useDialogs } from '../components/Dialogs';

type Tab = 'overview' | 'tests' | 'sap' | 'activity';
const NEXT_RESULT: Record<string, TestCase['TestResult']> = { OPEN: 'PASS', PASS: 'FAIL', FAIL: 'OPEN' };
const CHECK_LABEL: Record<string, string> = { UNIT: 'Unit test', INTEG: 'Integration', AUTH: 'Authorization', ERROR: 'Error handling', PERF: 'Performance', TRANSPORT: 'Transport readiness', OTHER: 'Other' };

export function TicketPage({ ticketId }: { ticketId: string }) {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const { openLog } = useDialogs();
  const [tab, setTab] = useState<Tab>('overview');
  const [comment, setComment] = useState('');
  const head = s.tickets.find(t => t.TicketId === ticketId);
  const t: Ticket | undefined = head ? { ...head, ...s.details[head.TicketUUID] } : undefined;

  useEffect(() => { if (head) s.loadTicket(head.TicketUUID) }, [head?.TicketUUID]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTab('overview') }, [ticketId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!t || isTyping(e) || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') { const el = document.querySelector('.props [data-f="status"]'); if (el) menu(el, menus.status(t), v => setStatus(v as Status)); e.preventDefault() }
      if (key === 'p') { const el = document.querySelector('.props [data-f="Priority"]'); if (el) menu(el, menus.Priority(t), v => patch({ Priority: v })); e.preventDefault() }
      if (e.key === 'Escape') history.back();
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });

  if (!s.ready) return <Page crumb={<b>{ticketId}</b>}><div className="empty">Loading…</div></Page>;
  if (!t) return <Page crumb={<b>{ticketId}</b>}><div className="empty">Ticket {ticketId} not found. <a href="#list/all">All tickets</a></div></Page>;

  const uuids = [t.TicketUUID];
  const patch = (p: Partial<Ticket>) => s.run(() => api.updateTicket(t, p), { uuids });
  const setStatus = (st: Status) => s.run(() => api.setStatus(t, st), { uuids, ok: <><StatusIcon status={st} /> Moved to {s.text('STATUS', st)}</> });
  const add = (nav: ChildNav, data: Record<string, unknown>) => s.run(() => api.createChild(t, nav, data), { uuids });
  const upd = (set: ChildSet, item: Record<string, unknown>, p: Record<string, unknown>) => s.run(() => api.updateChild(set, item, p), { uuids });
  const del = (set: ChildSet, item: Record<string, unknown>) => s.run(() => api.deleteChild(set, item), { uuids });
  const field = (f: 'Priority' | 'Project' | 'Area' | 'Tech' | 'TicketType' | 'Environment') => (e: React.MouseEvent) => menu(e.currentTarget, menus[f](t), v => patch({ [f]: v }));

  const running = s.tickets.find(x => x.TimerStartedAt);
  const timerOn = running?.TicketUUID === t.TicketUUID;
  async function toggleTimer() {
    if (timerOn) return s.run(() => api.stopTimer(t!), { uuids, ok: 'Time logged' });
    await s.run(async () => { if (running) await api.stopTimer(running); await api.startTimer(t!) },
      { uuids: running ? [running.TicketUUID, t!.TicketUUID] : uuids, ok: `Timer started on ${t!.TicketId}` });
  }
  async function remove() {
    if (!confirm(`Delete ${t!.TicketId} with all its comments and time entries?`)) return;
    const ok = await s.run(() => api.deleteTicket(t!), { removed: t!.TicketUUID, ok: `${t!.TicketId} deleted` });
    if (ok) go('list/active');
  }

  const acc = [...(t._Acceptance ?? [])].sort((a, b) => a.SortOrder - b.SortOrder);
  const tests = [...(t._Test ?? [])].sort((a, b) => a.SortOrder - b.SortOrder);
  const chk = [...(t._Checklist ?? [])].sort((a, b) => a.SortOrder - b.SortOrder);
  const passed = tests.filter(x => x.TestResult === 'PASS').length, done = chk.filter(c => c.IsDone).length;
  const activity = [
    ...(t._Event ?? []).map(e => ({ at: e.EventAt ?? '', node: <><StatusIcon status={e.StatusTo as Status} /><span><b>{e.EventBy}</b> moved from {s.text('STATUS', e.StatusFrom)} to <b>{s.text('STATUS', e.StatusTo)}</b><span className="when"> · {ago(e.EventAt)}</span></span></> })),
    ...(t._Worklog ?? []).map(w => ({ at: w.WorkDate + 'T17:00:00', node: <><Icon name="clock" size={14} /><span><b>{w.CreatedBy}</b> logged {w.Hours} h · {s.text('ACTIVITY', w.Activity)}{w.CommentText ? ` – ${w.CommentText}` : ''}<span className="when"> · {fmtDate(w.WorkDate)}</span></span>
      <button className="ib" style={{ marginLeft: 'auto', width: 22, height: 22 }} title="Delete entry" onClick={() => del('Worklog', w as never)}><Icon name="x" size={12} /></button></> })),
    ...(t._Note ?? []).map(n => ({ at: n.CreatedAt ?? '', note: n })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (t.CreatedAt) activity.unshift({ at: t.CreatedAt, node: <><Icon name="plus" size={14} /><span><b>{t.CreatedBy}</b> created the ticket<span className="when"> · {ago(t.CreatedAt)}</span></span></> });

  const prop = (label: string, child: React.ReactNode) => <div className="prop"><span>{label}</span>{child}</div>;
  const p = s.project(t.Project);
  return (
    <Page crumb={<><a href="#list/active">My tickets</a><span className="sepr">›</span><b>{t.TicketId}</b><span className="muted" style={{ fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.Title}</span></>}
      right={<button className="ib" title="Delete ticket" onClick={remove}><Icon name="trash" /></button>}>
      <div className="tp">
        <div className="tp-main">
          <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><ProjectChip code={t.Project} /><TechTag code={t.Tech} /><span className="tag">{s.text('TYPE', t.TicketType)}</span></div>
          <h1 className="tp-title" contentEditable suppressContentEditableWarning spellCheck={false} key={'t' + t.etag}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() } }}
            onBlur={e => { const v = e.currentTarget.innerText.trim(); if (v && v !== t.Title) patch({ Title: v }) }}>{t.Title}</h1>
          <div className="tp-desc" contentEditable suppressContentEditableWarning data-ph="Add description…" key={'d' + t.etag}
            onBlur={e => { const v = e.currentTarget.innerText.trim(); if (v !== (t.Description ?? '')) patch({ Description: v }) }}>{t.Description}</div>

          <div className="tp-tabs">
            {([['overview', 'Overview'], ['tests', <>Tests &amp; checklist <span className="muted num">{passed}/{tests.length} · {done}/{chk.length}</span></>],
              ['activity', <>Activity <span className="muted num">{(t._Note ?? []).length}</span></>], ['sap', <>SAP objects &amp; transports <span className="muted">phase 2</span></>]] as [Tab, React.ReactNode][])
              .map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>

          {tab === 'overview' && <>
            <div className="tp-sec" style={{ marginTop: 6 }}><h4>Acceptance criteria<span className="c">{acc.length}</span></h4>
              <div className="sub">{acc.map(a => <div className="it" key={a.AccUUID}><Icon name="check" size={14} style={{ color: 'var(--muted)' }} /><span className="lbl">{a.Text}</span><span className="sp" />
                <button className="ib" style={{ width: 22, height: 22 }} title="Remove" onClick={() => del('Acceptance', a as never)}><Icon name="x" size={12} /></button></div>)}
                <AddLine placeholder="Add acceptance criterion and press Enter (also adds a test case)" onAdd={async v => {
                  await add('_Acceptance', { SortOrder: acc.length + 1, Text: v });
                  await add('_Test', { SortOrder: tests.length + 1, TestName: v, Expected: v });
                }} /></div></div>
            <div className="tp-sec"><h4>Reference</h4>
              <input className="pv" style={{ width: '100%', border: '1px solid var(--border)', height: 34 }} defaultValue={t.Reference} key={'r' + t.etag} placeholder="Mail subject, document link, meeting…"
                onBlur={e => { if (e.target.value !== t.Reference) patch({ Reference: e.target.value }) }} /></div>
          </>}

          {tab === 'tests' && <>
            <div className="tp-sec" style={{ marginTop: 6 }}><h4>Test cases<span className="c">{passed}/{tests.length} passed</span><span className="sp" /><span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>click a result to change it</span></h4>
              <div className="sub">{tests.map(x => <div className="tst" key={x.TestUUID}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{x.TestName}</div><div className="muted" style={{ fontSize: 12 }}>{x.TestSteps || 'No steps yet'} · expected: {x.Expected || '–'}{x.TestedBy ? ` · ${x.TestedBy} ${fmtDate(x.TestedAt)}` : ''}</div></div>
                <button className={'res ' + x.TestResult.toLowerCase()} onClick={() => upd('TestCase', x as never, { TestResult: NEXT_RESULT[x.TestResult] })}>{({ PASS: 'Passed', FAIL: 'Failed', OPEN: 'Open' })[x.TestResult]}</button></div>)}
                <AddLine placeholder="Add test case and press Enter" onAdd={v => add('_Test', { SortOrder: tests.length + 1, TestName: v })} /></div></div>
            <div className="tp-sec"><h4>Release checklist<span className="c">{done}/{chk.length}</span></h4>
              <div className="sub">{chk.map(c => <div key={c.ItemUUID} className={'it' + (c.IsDone ? ' done' : '')} style={{ cursor: 'pointer' }} onClick={() => upd('ChecklistItem', c as never, { IsDone: !c.IsDone })}>
                <StatusIcon status={c.IsDone ? 'DONE' : 'TODO'} /><span className="chkcat">{CHECK_LABEL[c.Category] ?? c.Category}</span><span className="lbl">{c.Text}</span></div>)}
                <AddLine placeholder="Add checklist item and press Enter" onAdd={v => add('_Checklist', { SortOrder: chk.length + 1, Category: 'OTHER', Text: v })} /></div></div>
          </>}

          {tab === 'activity' && <>
            <ul className="acts" style={{ marginTop: 6 }}>{activity.map((a, i) => 'note' in a && a.note
              ? <li className="note" key={i}><div className="h"><Avatar name={a.note.CreatedBy} size={18} /><b style={{ color: 'var(--text-2)' }}>{a.note.CreatedBy}</b><span>{ago(a.note.CreatedAt)}</span><span className="sp" style={{ flex: 1 }} />
                  <button className="ib" style={{ width: 22, height: 22 }} title="Delete comment" onClick={() => del('Note', a.note as never)}><Icon name="x" size={12} /></button></div>{a.note.Text}</li>
              : <li key={i} style={{ display: 'flex', alignItems: 'center' }}>{'node' in a && a.node}</li>)}</ul>
            <div className="comment"><textarea placeholder="Leave a comment…" value={comment} onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && comment.trim()) { add('_Note', { Text: comment.trim() }); setComment('') } }} />
              <div className="f"><button className="btn" disabled={!comment.trim()} onClick={() => { add('_Note', { Text: comment.trim() }); setComment('') }}>Comment</button></div></div>
          </>}

          {tab === 'sap' && <div className="tp-sec" style={{ marginTop: 6 }}><div className="sub"><div className="add" style={{ height: 'auto', padding: '14px 12px', display: 'block', lineHeight: 1.6 }}>
            Linked technical objects, transports with DEV → QA → PRD status and the impact map come in phase 2 (see the mockup).
            Until then, note transport numbers in a comment.</div></div></div>}
        </div>

        <aside className="props">
          {prop('Status', <button className="pv" data-f="status" onClick={e => menu(e.currentTarget, menus.status(t), v => setStatus(v as Status))}><StatusIcon status={t.Status} />{s.text('STATUS', t.Status)}</button>)}
          {prop('Priority', <button className="pv" data-f="Priority" onClick={field('Priority')}><PriorityIcon priority={t.Priority} />{PRIORITY_NAME[t.Priority]}</button>)}
          {prop('Assignee', <label className="pv"><Avatar name={t.Assignee} size={18} /><input defaultValue={t.Assignee} key={'a' + t.etag} onBlur={e => { const v = e.target.value.trim().toUpperCase(); if (v !== t.Assignee) patch({ Assignee: v }) }} /></label>)}
          {prop('Due date', <label className="pv"><Icon name="cal" size={14} style={{ color: 'var(--muted)' }} /><input type="date" defaultValue={t.DueDate ?? ''} key={'due' + t.etag} onChange={e => e.target.value && patch({ DueDate: e.target.value })} /></label>)}
          {prop('', <span style={{ paddingLeft: 8 }}><Due t={t} /></span>)}
          <div className="h">Classification</div>
          {prop('Project', <button className="pv" onClick={field('Project')}><Dot color={p?.Color ?? 'var(--muted)'} />{p?.Name ?? t.Project}</button>)}
          {prop('Area', <button className="pv" onClick={field('Area')}><Icon name="folder" size={14} style={{ color: 'var(--muted)' }} />{t.Area}</button>)}
          {prop('Tech', <button className="pv" onClick={field('Tech')}><Dot color={s.color('TECH', t.Tech)} />{s.text('TECH', t.Tech)}</button>)}
          {prop('Type', <button className="pv" onClick={field('TicketType')}><Icon name="tag" size={14} style={{ color: 'var(--muted)' }} />{s.text('TYPE', t.TicketType)}</button>)}
          {prop('Environment', <button className="pv" onClick={field('Environment')}><Icon name="env" size={14} style={{ color: 'var(--muted)' }} />{t.Environment}</button>)}
          {prop('Requester', <label className="pv"><Icon name="user" size={14} style={{ color: 'var(--muted)' }} /><input defaultValue={t.Requester} key={'q' + t.etag} onBlur={e => { if (e.target.value !== t.Requester) patch({ Requester: e.target.value }) }} /></label>)}
          <div className="h">Time</div>
          {prop('Estimate', <label className="pv"><input type="number" min={0} step={0.5} style={{ width: 56 }} defaultValue={t.EstimateHours} key={'e' + t.etag}
            onBlur={e => { const v = Number(e.target.value); if (v !== t.EstimateHours) patch({ EstimateHours: v }) }} /><span className="muted">h</span></label>)}
          {prop('Actual', <span className="pv num" style={{ cursor: 'default' }}>{r1(t.LoggedHours)} h<span className="muted" style={{ fontWeight: 400 }}>{t.EstimateHours ? ` · ${Math.round(t.LoggedHours / t.EstimateHours * 100)}%` : ''}</span></span>)}
          <div className="meter"><i style={{ width: `${Math.min(100, t.EstimateHours ? t.LoggedHours / t.EstimateHours * 100 : 0)}%`, ...(t.LoggedHours > t.EstimateHours ? { background: 'var(--urgent)' } : {}) }} /></div>
          <div style={{ display: 'flex', gap: 6, padding: '10px 8px 0' }}>
            <button className="btn" style={{ flex: 1 }} onClick={toggleTimer}><Icon name={timerOn ? 'stop' : 'play'} size={13} />{timerOn ? 'Stop & log' : 'Start timer'}</button>
            <button className="btn" onClick={() => openLog(t.TicketUUID)}>Log…</button></div>
          <div className="h">Details</div>
          {prop('Created', <span className="pv" style={{ cursor: 'default' }}>{fmtDate(t.CreatedAt)} · {t.CreatedBy}</span>)}
          {prop('In status', <span className="pv num" style={{ cursor: 'default' }}>{t.StatusChangedAt ? ago(t.StatusChangedAt).replace(' ago', '') : '–'}</span>)}
        </aside>
      </div>
    </Page>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd(v: string): unknown }) {
  const [v, setV] = useState('');
  return <div className="add"><Icon name="plus" size={14} /><input placeholder={placeholder} value={v} onChange={e => setV(e.target.value)}
    onKeyDown={async e => { if (e.key === 'Enter' && v.trim()) { const x = v.trim(); setV(''); await onAdd(x) } }} /></div>;
}
