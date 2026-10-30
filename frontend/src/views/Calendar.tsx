// Calendar: tickets on their due dates (FullCalendar month / week / day). Drag an open ticket to another day to move its
// due date. In standalone mode your Google Calendar meetings (Account → Google Calendar) are shown alongside, read-only.
import { useCallback, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import enGb from '@fullcalendar/core/locales/en-gb';
import type { EventContentArg, EventDropArg, EventSourceFuncArg, EventInput } from '@fullcalendar/core';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { sb } from '../lib/supabase';
import { Icon, StatusIcon } from '../components/Icons';
import { go, Page } from '../components/ui';

interface Meeting { id: string; title: string; start: string; end: string; allDay: boolean; location: string; link: string }

/** Meetings per visible range, kept 5 minutes so switching views does not refetch */
const cache = new Map<string, { at: number; events: Meeting[]; connected: boolean }>();
async function meetings(from: string, to: string, fresh = false) {
  const key = from + '|' + to, hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < 5 * 60_000) return hit;
  const { data, error } = await sb().functions.invoke('calendar-feed', { body: { from, to } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    throw new Error(ctx?.status === 404 ? 'Google Calendar is not set up yet (setup guide, step 15).' : (await ctx?.json().catch(() => null))?.error || 'Your calendar could not be loaded.');
  }
  const v = { at: Date.now(), events: (data?.events ?? []) as Meeting[], connected: !!data?.connected };
  cache.set(key, v);
  return v;
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function CalendarPage() {
  const s = useStore();
  const cal = useRef<FullCalendar>(null);
  const cloud = api.kind === 'supabase';
  const [connected, setConnected] = useState<boolean | null>(cloud ? null : false);
  const [loading, setLoading] = useState(false);
  const warned = useRef(false);

  const toast = useRef(s.toast); toast.current = s.toast;
  const tickets = useMemo<EventInput[]>(() => s.tickets.filter(t => t.DueDate).map(t => ({
    id: t.TicketUUID, title: t.Title, start: t.DueDate!, allDay: true, editable: t.Status !== 'DONE',
    classNames: ['ev', 'st-' + t.Status.toLowerCase()], extendedProps: { t },
  })), [s.tickets]);
  const meetingSource = useCallback((info: EventSourceFuncArg, ok: (e: EventInput[]) => void) => {
    if (!cloud) return ok([]);
    setLoading(true);
    meetings(info.startStr, info.endStr).then(r => {
      setConnected(r.connected);
      ok(r.events.map(m => ({ id: 'm:' + m.id, title: m.title, start: m.start, end: m.end, allDay: m.allDay, editable: false,
        classNames: ['ev', 'ev-meet'], extendedProps: { m } })));
    }).catch(e => {
      if (!warned.current) { warned.current = true; toast.current((e as Error).message, true) }
      ok([]);
    }).finally(() => setLoading(false));
  }, [cloud]);
  // stable sources: FullCalendar refetches a source whenever it is replaced
  const sources = useMemo(() => [{ id: 'tickets', events: tickets }, { id: 'meetings', events: meetingSource }], [tickets, meetingSource]);
  const refresh = () => { cache.clear(); warned.current = false; cal.current?.getApi().refetchEvents() };

  const moveDue = (info: EventDropArg) => {
    const t = info.event.extendedProps.t as Ticket, from = t.DueDate, to = info.event.startStr.slice(0, 10);
    const patch = (DueDate: string | null) => s.run(() => api.updateTicket(t, { DueDate }), { uuids: [t.TicketUUID], optimistic: x => ({ ...x, DueDate }) });
    s.run(() => api.updateTicket(t, { DueDate: to }), {
      uuids: [t.TicketUUID], optimistic: x => ({ ...x, DueDate: to }),
      ok: `${t.TicketId} now due ${fmtDate(to)}`, undo: () => { patch(from) },
    }).then(ok => { if (!ok) info.revert() });
  };
  const content = (a: EventContentArg) => {
    const m = a.event.extendedProps.m as Meeting | undefined;
    if (m) return <span className="ev-in" title={`${m.title}${m.allDay ? '' : ` · ${hhmm(m.start)}–${hhmm(m.end)}`}${m.location ? ' · ' + m.location : ''}${m.link ? '\nClick to join' : ''}`}>
      <Icon name={m.link ? 'chat' : 'cal'} size={12} />{!m.allDay && <b className="num">{hhmm(m.start)}</b>}<span className="ev-t">{m.title}</span></span>;
    const t = a.event.extendedProps.t as Ticket;
    return <span className="ev-in" title={`${t.TicketId} ${t.Title} · ${s.text('STATUS', t.Status)}`}>
      <StatusIcon status={t.Status as Status} /><b className="num">{t.TicketId}</b><span className="ev-t">{t.Title}</span></span>;
  };
  const right = cloud && <>
    {connected && <button className="btn" onClick={refresh} title="Reload meetings from Google Calendar"><Icon name="refresh" size={14} className={loading ? 'spin' : undefined} />Meetings</button>}
    {connected === false && <button className="btn primary cal-connect" onClick={() => go('account')}><Icon name="cal" size={14} />Connect Google Calendar</button>}
  </>;
  return (
    <Page crumb={<b>Calendar</b>} right={right}>
      <div className="cal-page">
        <FullCalendar ref={cal} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]} initialView="dayGridMonth" locale={enGb} firstDay={1} height="100%"
          headerToolbar={{ left: 'title', center: '', right: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }} dayMaxEvents={4} nowIndicator scrollTime="08:00:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }} eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventSources={sources}
          eventContent={content} editable eventDurationEditable={false} eventDrop={moveDue}
          eventClick={i => {
            i.jsEvent.preventDefault();
            const m = i.event.extendedProps.m as Meeting | undefined;
            if (m) { if (m.link) window.open(m.link, '_blank', 'noopener,noreferrer'); return }
            go('ticket/' + (i.event.extendedProps.t as Ticket).TicketId);
          }} />
      </div>
    </Page>
  );
}
