// Date and number helpers shared by the screens.
import type { Status, Ticket } from '../api';

export const DAY = 864e5;
export const STATUS_ORDER: Status[] = ['BACKLOG', 'TODO', 'PROG', 'TEST', 'BLOCK', 'DONE'];
export const STATUS_NAME: Record<Status, string> = { BACKLOG: 'Backlog', TODO: 'To do', PROG: 'In progress', TEST: 'Testing', BLOCK: 'Blocked', DONE: 'Done' };
export const PRIORITY_NAME: Record<string, string> = { '1': 'Urgent', '2': 'High', '3': 'Medium', '4': 'Low' };

export const r1 = (x: number) => Math.round(x * 10) / 10;
export const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d };
export const parseDate = (s: string | null) => (s ? new Date(s + 'T00:00:00') : null);
export const fmtDate = (s: string | Date | null) => {
  if (!s) return '–';
  const d = typeof s === 'string' ? (s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s)) : s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
export const ago = (iso: string | null) => {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1e3;
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
};
/** Monday of the week, `offset` weeks from now */
export const weekStart = (offset = 0) => { const t = today(); return new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY + offset * 7 * DAY) };
export const isWorkday = (d: Date) => d.getDay() > 0 && d.getDay() < 6;
export const daysUntil = (dateIso: string | null) => { const d = parseDate(dateIso); return d ? Math.ceil((d.getTime() - today().getTime()) / DAY) : null };
export const isOpen = (t: Ticket) => t.Status !== 'DONE';
export const isOverdue = (t: Ticket) => isOpen(t) && (daysUntil(t.DueDate) ?? 0) < 0;
export const urgency = (a: Ticket, b: Ticket) => a.Priority.localeCompare(b.Priority) || (a.DueDate ?? '9').localeCompare(b.DueDate ?? '9');
/** Two most recent working days before today (for "missing time") */
export const lastWorkdays = (n: number) => {
  const out: string[] = []; let d = today().getTime();
  while (out.length < n) { d -= DAY; if (isWorkday(new Date(d))) out.push(isoDate(new Date(d))) }
  return out;
};
