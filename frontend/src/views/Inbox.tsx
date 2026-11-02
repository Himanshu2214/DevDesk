import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AccessLevel, AppNotification, Invitation, Status, Ticket, TicketEvent, Transport } from '../api';
import { useStore, useTransports } from '../store';
import { ago, DAY, isOverdue, PRIORITY_NAME, today } from '../lib/format';
import { Icon, PriorityIcon, Spinner, StatusIcon } from '../components/Icons';
import { ACCESS_LABEL } from '../components/ShareProject';
import { Due, Empty, Page, ProjectChip, TabIndicator, TechTag, useFieldMenus, useMenu } from '../components/ui';
import { missingTime } from './Home';
import { useDialogs } from '../components/Dialogs';

export interface InboxItem { key: string; ticket: string; at: string; icon: React.ReactNode; title: string; text: React.ReactNode; pinned?: boolean; read: boolean; event?: TicketEvent;
  invite?: Invitation; notif?: AppNotification }
export interface InboxExtras { invitations: Invitation[]; notifications: AppNotification[] }

/** invitations and notifications (standalone only) – shared by the Inbox, the sidebar badge and the bottom bar */
export function useInboxExtras(): InboxExtras {
  const inv = useQuery({ queryKey: ['invitations'], queryFn: () => api.myInvitations!(), enabled: !!api.myInvitations, refetchInterval: 60_000 });
  const nts = useQuery({ queryKey: ['notifications'], queryFn: () => api.listNotifications!(), enabled: !!api.listNotifications, refetchInterval: 60_000 });
  return { invitations: inv.data ?? [], notifications: nts.data ?? [] };
}
const INVITE_TITLE: Record<Invitation['kind'], (i: Invitation) => string> = {
  ticket: i => `${i.from_name} wants to share ${i.title.split(' ')[0]} with you`,
  project: i => `${i.from_name} invites you to the project ${i.title}`,
  org: i => `${i.from_name || 'Someone'} invites you to join ${i.title}`,
};

/** Invitations, shared tickets changed by others, overdue tickets and missing time are pinned on top; then
 *  notifications and status events (newest first) */
export function inboxItems(s: ReturnType<typeof useStore>, failedTransports: Transport[] = [], extras?: InboxExtras): InboxItem[] {
  const red = (n: string, c = 'var(--danger)') => <span style={{ color: c, display: 'grid' }}><Icon name={n} size={15} /></span>;
  const accent = (n: string) => <span style={{ color: 'var(--accent)', display: 'grid' }}><Icon name={n} size={15} /></span>;
  const pinned: InboxItem[] = [
    ...(extras?.invitations ?? []).map(i => ({ key: `inv-${i.kind}-${i.ref}`, ticket: '', at: i.since, icon: accent(i.kind === 'org' ? 'users' : 'link'), title: INVITE_TITLE[i.kind](i),
      text: i.kind === 'org' ? `Join as ${i.access}` : `${i.kind === 'ticket' ? i.title : 'Project'} · ${ACCESS_LABEL[i.access as AccessLevel] ?? i.access} · accept or decline`, pinned: true, read: false, invite: i })),
    // shared tickets someone else changed or commented on since you last opened them
    ...s.tickets.filter(t => t.ChangedByOthers).map(t => ({ key: 'ch' + t.TicketUUID, ticket: t.TicketUUID, at: t.LastChangedAt ?? '', icon: <span style={{ color: 'var(--accent)', display: 'grid' }}><Icon name="users" size={15} /></span>,
      title: `${t.TicketId} ${t.Title}`, pinned: true, read: false, text: t.SharedBy ? `Changed since you last looked · shared by ${t.SharedBy}` : 'Someone you shared it with changed or commented on it' })),
    ...s.tickets.filter(isOverdue).map(t => ({ key: 'od' + t.TicketUUID, ticket: t.TicketUUID, at: t.DueDate ?? '', icon: red('alert'), title: `${t.TicketId} ${t.Title}`, pinned: true, read: true,
      text: `Overdue by ${Math.ceil((today().getTime() - Date.parse(t.DueDate + 'T00:00:00')) / DAY)} days` })),
    ...failedTransports.map(x => ({ key: 'tr' + x.TransportUUID, ticket: x.TicketUUID ?? '', at: x.PrdImportedAt ?? x.QaImportedAt ?? '', icon: red('truck'), pinned: true, read: true,
      title: `${x.TrKorr} ${x.TrText}`, text: `Import into ${x.PrdImportedAt ? 'PRD' : 'QA'} ended with RC ${x.PrdImportedAt ? x.PrdRc : x.QaRc}` })),
    ...missingTime(s.tickets, s.recentWork).map(t => ({ key: 'mt' + t.TicketUUID, ticket: t.TicketUUID, at: '', icon: red('clock', 'var(--urgent)'), title: `${t.TicketId} ${t.Title}`, pinned: true, read: true,
      text: 'In progress, no time logged in 2 working days' })),
  ];
  const events = s.events.map(e => ({ key: e.EventUUID, ticket: e.TicketUUID, at: e.EventAt ?? '', icon: <StatusIcon status={e.StatusTo as Status} />, read: e.IsRead, event: e,
    title: `${e._Ticket?.TicketId ?? ''} ${e._Ticket?.Title ?? ''}`, text: <>Moved to {s.text('STATUS', e.StatusTo)} by {e.EventBy}</> }));
  const notes: InboxItem[] = (extras?.notifications ?? []).map(n => ({ key: 'nt' + n.NotifUUID, ticket: n.Link.startsWith('ticket/') ? s.tickets.find(t => t.TicketId === n.Link.slice(7))?.TicketUUID ?? '' : '',
    at: n.CreatedAt, icon: accent(n.Kind === 'declined' ? 'x' : n.Kind === 'accepted' || n.Kind === 'org-joined' ? 'check' : 'users'), title: n.Title, text: n.Body || ' ', read: !!n.ReadAt, notif: n }));
  return [...pinned, ...[...notes, ...events].sort((a, b) => b.at.localeCompare(a.at))];
}

export function Inbox() {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const { openLog } = useDialogs();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selKey, setSelKey] = useState<string | null>(null);
  const failed = (useTransports().data ?? []).filter(x => x.Phase === 'FAILED');
  const extras = useInboxExtras();
  const qc = useQueryClient();
  const [answering, setAnswering] = useState('');
  let items = inboxItems(s, failed, extras);
  if (filter === 'unread') items = items.filter(i => !i.read || i.pinned);
  const sel = items.find(i => i.key === selKey) ?? items[0];
  const t: Ticket | undefined = sel && s.tickets.find(x => x.TicketUUID === sel.ticket);

  const select = (i: InboxItem) => {
    setSelKey(i.key);
    if (i.event && !i.event.IsRead) s.run(() => api.updateChild('TicketEvent', i.event as never, { IsRead: true }));
    if (i.notif && !i.notif.ReadAt) api.markNotificationsRead!([i.notif.NotifUUID]).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }), () => {});
  };
  const markAll = () => s.run(async () => {
    for (const e of s.events.filter(x => !x.IsRead)) await api.updateChild('TicketEvent', e as never, { IsRead: true });
    if (api.markNotificationsRead) await api.markNotificationsRead(extras.notifications.filter(n => !n.ReadAt).map(n => n.NotifUUID));
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }, { ok: 'All marked as read' });
  const answer = async (i: Invitation, accept: boolean) => {
    setAnswering(i.kind + i.ref);
    const ok = await s.run(() => api.answerInvitation!(i.kind, i.ref, accept),
      { ok: accept ? (i.kind === 'org' ? `You joined ${i.title}` : 'Accepted – it is in your lists now') : 'Declined' });
    setAnswering('');
    if (ok) {
      setSelKey(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ['invitations'] }), qc.invalidateQueries({ queryKey: ['org'] })]);
      if (accept && i.kind !== 'org') s.reload();
    }
  };

  return (
    <Page crumb={<b>Inbox</b>} bar2={<>
      <button className={'pill' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>{filter === 'all' && <TabIndicator id="inbox-filter" />}All</button>
      <button className={'pill' + (filter === 'unread' ? ' on' : '')} onClick={() => setFilter('unread')}>{filter === 'unread' && <TabIndicator id="inbox-filter" />}Unread</button>
      <span className="sp" /><button className="pill" onClick={markAll}><Icon name="check" size={14} />Mark all read</button></>}>
      <div className="inbox">
        <div className="lst">{items.map(i =>
          <div key={i.key} className={'nt' + (i.key === sel?.key ? ' sel' : '') + (i.read ? '' : ' unread')} onClick={() => select(i)}>
            <span style={{ paddingTop: 2 }}>{i.icon}</span>
            <div style={{ minWidth: 0 }}><div className="a">{i.title}</div><div className="b">{i.text}</div></div>
            <span className="w">{i.pinned ? '' : ago(i.at)}</span></div>)}
          {!items.length && <Empty icon="bell" title="Inbox zero">New activity on your tickets and failed imports show up here.</Empty>}</div>
        <div className="pre">{sel?.invite ? <div className="inv-pre">
          <span className="approve-icon"><Icon name={sel.invite.kind === 'org' ? 'users' : 'link'} size={24} /></span>
          <h2>{sel.title}</h2>
          {sel.invite.kind === 'org'
            ? <p className="muted">Inside an organization, tickets and projects are shared without invitations, and the share dialogs suggest every member.
                You can be in one organization at a time.</p>
            : <><p className="inv-what">{sel.invite.title}</p>
              <p className="muted">{sel.invite.from_name} is outside your organization. If you accept, you {sel.invite.access === 'view' ? 'can view it' : sel.invite.access === 'comment' ? 'can view it, comment and log time' : 'can view and edit it'}.
                If you decline, nothing is shared and they are told.</p></>}
          <div className="acct-actions">
            <button className="btn primary" disabled={!!answering} onClick={() => answer(sel.invite!, true)}>{answering ? <Spinner /> : <Icon name="check" size={14} />}Accept</button>
            <button className="btn" disabled={!!answering} onClick={() => answer(sel.invite!, false)}><Icon name="x" size={14} />Decline</button>
          </div>
        </div> : sel?.notif && !t ? <div className="inv-pre">
          <h2>{sel.notif.Title}</h2>{sel.notif.Body && <p className="muted">{sel.notif.Body}</p>}
          <p className="muted">{ago(sel.notif.CreatedAt)}</p>
          {sel.notif.Link && sel.notif.Link !== 'inbox' && <a className="btn primary" href={'#' + sel.notif.Link}>Open</a>}
        </div> : t ? <>
          <div className="muted num">{t.TicketId}</div>
          <h1 className="tp-title" style={{ marginTop: 4 }}>{t.Title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0 18px' }}>
            <span className="chip"><StatusIcon status={t.Status} />{s.text('STATUS', t.Status)}</span>
            <span className="chip"><PriorityIcon priority={t.Priority} />{PRIORITY_NAME[t.Priority]}</span>
            <ProjectChip code={t.Project} /><TechTag code={t.Tech} /><span className="chip"><Icon name="cal" size={13} /><Due t={t} /></span></div>
          <div className="kv" style={{ maxWidth: 420 }}><span>Requester</span><span>{t.Requester || '–'}</span><span>Estimate / logged</span><span className="num">{t.EstimateHours} h / {Math.round(t.LoggedHours * 10) / 10} h</span></div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <a className="btn primary" href={'#ticket/' + t.TicketId}>Open ticket</a>
            <button className="btn" onClick={e => menu(e.currentTarget, menus.status(t), v => s.changeStatus(t, v as Status))}><StatusIcon status={t.Status} /> Change status</button>
            <button className="btn" onClick={() => openLog(t.TicketUUID)}><Icon name="clock" size={14} />Log time</button></div>
        </> : <Empty icon="inbox" title="Select a notification">Details and quick actions appear here.</Empty>}</div>
      </div>
    </Page>
  );
}
