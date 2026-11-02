// The compact FullCalendar month inside the date picker; loaded the first time a picker opens (see DuePicker).
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { isoDate, today } from '../lib/format';

export default function MiniCal({ value, end, onPick }: { value: string | null; end?: string; onPick(d: string): void }) {
  return <FullCalendar plugins={[dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" initialDate={value ?? isoDate(today())}
    firstDay={1} fixedWeekCount={false} height="auto" headerToolbar={{ left: 'prev', center: 'title', right: 'next' }}
    titleFormat={{ month: 'long', year: 'numeric' }} dayHeaderFormat={{ weekday: 'narrow' }}
    validRange={end ? { end } : undefined}
    dayCellClassNames={a => (isoDate(a.date) === value ? ['is-selected'] : [])}
    dateClick={a => onPick(a.dateStr)} />;
}
