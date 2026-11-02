// Command palette (cmdk: fuzzy search, keyboard navigation) – Ctrl+K. Loaded the first time it opens (see Dialogs).
import { useState } from 'react';
import { Command } from 'cmdk';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useArticles, useObjects, useStore, useTransports } from '../store';
import { recentTickets } from '../lib/recent';
import { STATUS_NAME, STATUS_ORDER } from '../lib/format';
import { Icon, StatusIcon } from './Icons';
import { go } from './ui';
import { Modal, useDialogs } from './Dialogs';

export default function Palette({ close }: { close(): void }) {
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
