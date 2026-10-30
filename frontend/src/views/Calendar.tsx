// Calendar: tickets on their due dates (FullCalendar month / week). Drag an open ticket to another day to move its due date.
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventContentArg } from '@fullcalendar/core';
import { api } from '../api';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { StatusIcon } from '../components/Icons';
import { go, Page } from '../components/ui';

export function CalendarPage() {
  const s = useStore();
  const events = s.tickets.filter(t => t.DueDate).map(t => ({
    id: t.TicketUUID, title: t.Title, start: t.DueDate!, allDay: true, editable: t.Status !== 'DONE',
    classNames: ['ev', 'st-' + t.Status.toLowerCase()], extendedProps: { t },
  }));
  const moveDue = (info: EventDropArg) => {
    const t = info.event.extendedProps.t as Ticket, from = t.DueDate, to = info.event.startStr;
    const patch = (DueDate: string | null) => s.run(() => api.updateTicket(t, { DueDate }), { uuids: [t.TicketUUID], optimistic: x => ({ ...x, DueDate }) });
    s.run(() => api.updateTicket(t, { DueDate: to }), {
      uuids: [t.TicketUUID], optimistic: x => ({ ...x, DueDate: to }),
      ok: `${t.TicketId} now due ${fmtDate(to)}`, undo: () => { patch(from) },
    }).then(ok => { if (!ok) info.revert() });
  };
  const content = (a: EventContentArg) => {
    const t = a.event.extendedProps.t as Ticket;
    return <span className="ev-in" title={`${t.TicketId} ${t.Title} · ${s.text('STATUS', t.Status)}`}>
      <StatusIcon status={t.Status as Status} /><b className="num">{t.TicketId}</b><span className="ev-t">{t.Title}</span></span>;
  };
  return (
    <Page crumb={<b>Calendar</b>}>
      <div className="cal-page">
        <FullCalendar plugins={[dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" firstDay={1} height="100%"
          headerToolbar={{ left: 'title', center: '', right: 'today prev,next dayGridMonth,dayGridWeek' }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week' }} dayMaxEvents={4} events={events}
          eventContent={content} eventClick={i => { i.jsEvent.preventDefault(); go('ticket/' + (i.event.extendedProps.t as Ticket).TicketId) }}
          editable eventDurationEditable={false} eventDrop={moveDue} />
      </div>
    </Page>
  );
}
