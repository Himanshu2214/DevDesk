// Ticket tab "Changes" (standalone): every change to the ticket's fields with who made it, old → new, a filter by person
// and Undo (database: ticket_changes, ticket_change_list(), undo_ticket_change()).
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Status, Ticket, TicketChange } from '../api';
import { useStore } from '../store';
import { ago, fmtDate, PRIORITY_NAME } from '../lib/format';
import { Icon, Spinner, StatusIcon } from './Icons';
import { Avatar } from './ui';

const LABEL: Record<string, string> = {
  Title: 'title', Description: 'description', Status: 'status', Priority: 'priority', Project: 'project', Area: 'area', Tech: 'tech',
  TicketType: 'type', Environment: 'environment', Assignee: 'assignee', Requester: 'requester', Reference: 'reference',
  DueDate: 'due date', PlannedStart: 'planned start', EstimateHours: 'estimate',
};
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function TicketChanges({ t, canUndo }: { t: Ticket; canUndo: boolean }) {
  const s = useStore();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['changes', t.TicketUUID, t.etag], queryFn: () => api.ticketChanges!(t.TicketUUID) });
  const [who, setWho] = useState(''), [busy, setBusy] = useState(''), [open, setOpen] = useState<string | null>(null);
  const people = useMemo(() => [...new Set((q.data ?? []).map(c => c.By))], [q.data]);
  const list = (q.data ?? []).filter(c => !who || c.By === who);

  const show = (c: TicketChange, v: unknown): React.ReactNode => {
    if (v === null || v === undefined || v === '') return <span className="muted">empty</span>;
    const x = String(v);
    switch (c.Field) {
      case 'Status': return <><StatusIcon status={x as Status} />{s.text('STATUS', x)}</>;
      case 'Priority': return PRIORITY_NAME[x] ?? x;
      case 'Tech': case 'TicketType': return s.text(c.Field === 'Tech' ? 'TECH' : 'TYPE', x);
      case 'DueDate': case 'PlannedStart': return `${fmtDate(x)} ${x.slice(0, 4)}`;
      case 'EstimateHours': return `${x} h`;
      default: return x.length > 60 ? x.slice(0, 60) + '…' : x;
    }
  };
  const undo = async (c: TicketChange) => {
    setBusy(c.ChangeUUID);
    const ok = await s.run(() => api.undoTicketChange!(c.ChangeUUID), { uuids: [t.TicketUUID], ok: `Undone: ${LABEL[c.Field] ?? c.Field} is back to the earlier value` });
    setBusy('');
    if (ok) qc.invalidateQueries({ queryKey: ['changes', t.TicketUUID] });
  };

  if (q.isLoading) return <div className="tp-sec" style={{ marginTop: 6 }}><div className="sk" style={{ height: 120 }} /></div>;
  if (q.error) return <div className="tp-sec" style={{ marginTop: 6 }}><p className="muted">{(q.error as Error).message}</p></div>;
  return <div className="tp-sec chg" style={{ marginTop: 6 }}>
    <h4>Changes<span className="c">{list.length}</span><span className="sp" />
      {people.length > 1 && <select className="chg-who" value={who} onChange={e => setWho(e.target.value)} aria-label="Show changes by">
        <option value="">Everyone</option>{people.map(p => <option key={p} value={p}>{p}</option>)}</select>}</h4>
    {list.length === 0 ? <p className="muted">No changes recorded yet. Changes made from now on show up here, with who made them.</p>
      : <ul className="chg-list">{list.map(c => <li key={c.ChangeUUID}>
        <Avatar name={c.By} size={20} />
        <div className="chg-body">
          <div><b>{c.Mine ? 'You' : c.By}</b> {c.Field === 'Description'
            ? <>edited the description <button className="link" onClick={() => setOpen(open === c.ChangeUUID ? null : c.ChangeUUID)}>{open === c.ChangeUUID ? 'hide' : 'show'}</button></>
            : <>changed the {LABEL[c.Field] ?? c.Field} from <span className="chg-old">{show(c, c.OldValue)}</span> to <span className="chg-new">{show(c, c.NewValue)}</span></>}
            <span className="when"> · {ago(c.ChangedAt)}</span></div>
          {c.Field === 'Description' && open === c.ChangeUUID && <div className="chg-desc">
            <p><span className="muted">Before:</span> {plain(String(c.OldValue ?? '')) || <i className="muted">empty</i>}</p>
            <p><span className="muted">After:</span> {plain(String(c.NewValue ?? '')) || <i className="muted">empty</i>}</p></div>}
        </div>
        {canUndo && <button className="btn chg-undo" disabled={!!busy} onClick={() => undo(c)} title="Put the earlier value back">
          {busy === c.ChangeUUID ? <Spinner /> : <Icon name="refresh" size={13} />}Undo</button>}
      </li>)}</ul>}
  </div>;
}
