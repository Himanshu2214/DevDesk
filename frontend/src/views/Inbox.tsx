import { useState } from 'react';
import { api } from '../api';
import type { Status, Ticket, TicketEvent, Transport } from '../api';
import { useStore, useTransports } from '../store';
import { ago, DAY, isOverdue, PRIORITY_NAME, today } from '../lib/format';
import { Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Due, Empty, Page, ProjectChip, TabIndicator, TechTag, useFieldMenus, useMenu } from '../components/ui';
import { missingTime } from './Home';
import { useDialogs } from '../components/Dialogs';

export interface InboxItem { key: string; ticket: string; at: string; icon: React.ReactNode; title: string; text: React.ReactNode; pinned?: boolean; read: boolean; event?: TicketEvent }

/** Overdue tickets and missing time are pinned on top; then status events (newest first) */
export function inboxItems(s: ReturnType<typeof useStore>, failedTransports: Transport[] = []): InboxItem[] {
  const red = (n: string, c = 'var(--danger)') => <span style={{ color: c, display: 'grid' }}><Icon name={n} size={15} /></span>;
  const pinned: InboxItem[] = [
    ...s.tickets.filter(isOverdue).map(t => ({ key: 'od' + t.TicketUUID, ticket: t.TicketUUID, at: t.DueDate ?? '', icon: red('alert'), title: `${t.TicketId} ${t.Title}`, pinned: true, read: true,
      text: `Overdue by ${Math.ceil((today().getTime() - Date.parse(t.DueDate + 'T00:00:00')) / DAY)} days` })),
    ...failedTransports.map(x => ({ key: 'tr' + x.TransportUUID, ticket: x.TicketUUID ?? '', at: x.PrdImportedAt ?? x.QaImportedAt ?? '', icon: red('truck'), pinned: true, read: true,
      title: `${x.TrKorr} ${x.TrText}`, text: `Import into ${x.PrdImportedAt ? 'PRD' : 'QA'} ended with RC ${x.PrdImportedAt ? x.PrdRc : x.QaRc}` })),
    ...missingTime(s.tickets, s.recentWork).map(t => ({ key: 'mt' + t.TicketUUID, ticket: t.TicketUUID, at: '', icon: red('clock', 'var(--urgent)'), title: `${t.TicketId} ${t.Title}`, pinned: true, read: true,
      text: 'In progress, no time logged in 2 working days' })),
  ];
  const events = s.events.map(e => ({ key: e.EventUUID, ticket: e.TicketUUID, at: e.EventAt ?? '', icon: <StatusIcon status={e.StatusTo as Status} />, read: e.IsRead, event: e,
    title: `${e._Ticket?.TicketId ?? ''} ${e._Ticket?.Title ?? ''}`, text: <>Moved to {s.text('STATUS', e.StatusTo)} by {e.EventBy}</> }));
  return [...pinned, ...events];
}

export function Inbox() {
  const s = useStore();
  const menu = useMenu();
  const menus = useFieldMenus();
  const { openLog } = useDialogs();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selKey, setSelKey] = useState<string | null>(null);
  const failed = (useTransports().data ?? []).filter(x => x.Phase === 'FAILED');
  let items = inboxItems(s, failed);
  if (filter === 'unread') items = items.filter(i => !i.read || i.pinned);
  const sel = items.find(i => i.key === selKey) ?? items[0];
  const t: Ticket | undefined = sel && s.tickets.find(x => x.TicketUUID === sel.ticket);

  const select = (i: InboxItem) => {
    setSelKey(i.key);
    if (i.event && !i.event.IsRead) s.run(() => api.updateChild('TicketEvent', i.event as never, { IsRead: true }));
  };
  const markAll = () => s.run(async () => {
    for (const e of s.events.filter(x => !x.IsRead)) await api.updateChild('TicketEvent', e as never, { IsRead: true });
  }, { ok: 'All marked as read' });

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
        <div className="pre">{t ? <>
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
