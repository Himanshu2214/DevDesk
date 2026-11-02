// Share a single ticket (standalone): the owner adds people by their SLATE·SPACE email; someone it was shared with sees
// who shared it and can remove it from their list. Same look as sharing a project (ShareProject).
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { api } from '../api';
import type { ProjectMember, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from './Icons';
import { Avatar, go } from './ui';
import { Modal } from './Dialogs';
import Input from './smoothui/input';
import { ConfirmButton } from './ConfirmButton';

/** Small "shared" icon after a ticket's title in lists and on the board */
export function SharedMark({ t }: { t: Ticket }) {
  if (!t.SharedBy && !t.Shares) return null;
  const tip = t.SharedBy ? `Shared by ${t.SharedBy}` : `Shared with ${t.Shares} ${t.Shares === 1 ? 'person' : 'people'}`;
  return <span className="shared-mark" title={tip} aria-label={tip}><Icon name="users" size={12} /></span>;
}

/** Ticket page header: "Share" (your ticket), "Shared · 2", or "Shared by Asha" */
export function ShareTicketButton({ t }: { t: Ticket }) {
  const [open, setOpen] = useState(false);
  if (!api.shareTicket) return null;
  const label = t.SharedBy ? `Shared by ${t.SharedBy.split(' ')[0]}` : t.Shares ? `Shared · ${t.Shares}` : 'Share';
  return <>
    <button className="btn share-btn" onClick={() => setOpen(true)} title={t.SharedBy ? undefined : 'Share this ticket with someone'}>
      <Icon name="users" size={14} /><span className="hide-narrow">{label}</span></button>
    <AnimatePresence>{open && <ShareTicketDialog key="share" t={t} close={() => setOpen(false)} />}</AnimatePresence>
  </>;
}

function ShareTicketDialog({ t, close }: { t: Ticket; close(): void }) {
  const s = useStore();
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false);
  const mine = !t.SharedBy;
  const load = () => api.ticketMembers!(t.TicketUUID).then(setMembers).catch(e => { setMembers([]); s.toast((e as Error).message, true) });
  useEffect(() => { if (mine) load() }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    let name = '';
    const ok = await s.run(async () => { name = await api.shareTicket!(t.TicketUUID, email.trim()) }, { uuids: [t.TicketUUID] });
    setBusy(false);
    if (ok) { s.toast(`${t.TicketId} shared with ${name || email.trim()}`); setEmail(''); load() }
  };
  const remove = async (m: ProjectMember) => {
    if (await s.run(() => api.unshareTicket!(t.TicketUUID, m.member_id), { uuids: [t.TicketUUID], ok: `${m.name || m.email} removed` })) load();
  };
  const leave = async () => {
    if (await s.run(() => api.leaveTicket!(t.TicketUUID), { ok: `${t.TicketId} removed from your list` })) { close(); s.reload(); go('list/active') }
  };

  return (
    <Modal close={close} width={520} label={`Share ${t.TicketId}`}>
      <div className="top"><Icon name="users" size={15} /><span>{mine ? 'Share' : 'Shared ticket'} · {t.TicketId}</span><span className="sp" />
        <button className="ib" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
      {mine ? <div className="share-body">
        <p className="muted share-note">They see and edit only this ticket – with its time, comments, tests, files and transports. Only you can delete it
          or move it to another project. To share many tickets at once, share their project instead.</p>
        <form className="share-add" onSubmit={add}>
          <Input className="ss-input" type="email" placeholder="Their SLATE·SPACE email" autoFocus value={email} onChange={e => setEmail(e.target.value)} aria-label="Email of the person to share with" />
          <button className="btn primary" disabled={!email.trim() || busy} aria-busy={busy}>{busy ? <Spinner /> : <Icon name="plus" size={14} />}Share</button>
        </form>
        <ul className="share-list">
          {members === null ? <li><div className="sk" style={{ height: 32, width: '100%' }} /></li>
            : members.length === 0 ? <li className="muted">Not shared yet. They need a SLATE·SPACE account first.</li>
            : members.map(m => <li key={m.member_id}><Avatar name={m.name || m.email} size={26} />
              <span className="share-who"><b>{m.name || m.email}</b><small>{m.email} · since {fmtDate(m.since)}</small></span>
              <ConfirmButton className="btn" label={`Remove ${m.name || m.email}`} onConfirm={() => remove(m)}><Icon name="x" size={13} />Remove</ConfirmButton></li>)}
        </ul>
      </div> : <div className="share-body">
        {t.SharedVia === 'ticket' ? <>
          <p className="share-note"><b>{t.SharedBy}</b> shared this ticket with you. You can see and edit it; everything else of theirs stays private.</p>
          <div className="acct-actions"><ConfirmButton className="btn danger-btn" label={`Remove ${t.TicketId} from my list`} onConfirm={leave}
            description="You will no longer see this ticket. They can share it with you again."><Icon name="logout" size={14} />Remove from my list</ConfirmButton></div>
        </> : <p className="share-note">This ticket is in a project <b>{t.SharedBy}</b> shared with you. To stop seeing it, leave the project from its page.</p>}
      </div>}
    </Modal>
  );
}
