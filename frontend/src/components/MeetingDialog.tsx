// New meeting (standalone mode, Google Calendar connected): created in the real Google Calendar through calendar-feed,
// with an optional Google Meet link; invitations go out to the guests.
import { useState } from 'react';
import { useStore } from '../store';
import { calendarCall } from '../lib/calendar';
import { isoDate } from '../lib/format';
import { Icon, Spinner } from './Icons';
import { Modal } from './Dialogs';
import { DatePicker } from './DuePicker';

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** local date + "HH:MM" → ISO instant */
const at = (day: string, time: string) => new Date(`${day}T${time}:00`).toISOString();

export function MeetingDialog({ start, end, allDay, close, onCreated }: { start: Date; end: Date; allDay: boolean; close(): void; onCreated(link: string): void }) {
  const s = useStore();
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(isoDate(start));
  const [from, setFrom] = useState(allDay ? '10:00' : hm(start));
  const [to, setTo] = useState(allDay ? '10:30' : hm(end));
  const [whole, setWhole] = useState(false);
  const [guests, setGuests] = useState('');
  const [meet, setMeet] = useState(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const emails = guests.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  const bad = emails.filter(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const valid = title.trim() && !bad.length && (whole || to > from);

  async function create() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await calendarCall<{ htmlLink: string }>({ action: 'create', meeting: {
        title: title.trim(), description: notes, attendees: emails, meet: !whole && meet, allDay: whole, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        start: whole ? day : at(day, from), end: whole ? isoDate(new Date(new Date(day + 'T00:00:00').getTime() + 864e5)) : at(day, to) } });
      s.toast(emails.length ? `Meeting created – invitations sent to ${emails.length} ${emails.length === 1 ? 'guest' : 'guests'}` : 'Meeting created in Google Calendar');
      onCreated(r.htmlLink); close();
    } catch (e) { s.toast((e as Error).message, true); setBusy(false) }
  }
  return (
    <Modal close={close} width={560} label="New meeting">
      <div className="top"><Icon name="cal" size={15} /><span>New meeting · Google Calendar</span><span className="sp" />
        <button className="ib" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
      <input className="nt-title" autoFocus placeholder="Meeting title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) create() }} />
      <div className="form mt-form">
        <div><label>Date</label><DatePicker label="Meeting date" value={day} onChange={setDay} className="sel-btn" /></div>
        {!whole && <><div><label>From</label><input type="time" step={900} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label>To</label><input type="time" step={900} value={to} onChange={e => setTo(e.target.value)} /></div></>}
        <div className="full mt-checks">
          <label className="auth-check"><input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)} /><span className="auth-box" aria-hidden="true"><Icon name="check" size={12} /></span>All day</label>
          {!whole && <label className="auth-check"><input type="checkbox" checked={meet} onChange={e => setMeet(e.target.checked)} /><span className="auth-box" aria-hidden="true"><Icon name="check" size={12} /></span>Add Google Meet link</label>}
        </div>
        <div className="full"><label>Guests</label><input placeholder="name@company.com, other@company.com" value={guests} onChange={e => setGuests(e.target.value)} />
          {bad.length > 0 && <small className="mt-bad">Not an email: {bad.join(', ')}</small>}</div>
        <div className="full"><label>Notes</label><textarea rows={3} placeholder="Agenda, ticket numbers, links…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div className="ft"><span className="muted" style={{ fontSize: 12 }}>{emails.length ? 'Guests get an invitation from Google Calendar' : 'Only you will see it until you add guests'}</span><span className="sp" />
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={!valid || busy} aria-busy={busy} onClick={create}>{busy && <Spinner />}{busy ? 'Creating…' : 'Create meeting'}</button></div>
    </Modal>
  );
}
