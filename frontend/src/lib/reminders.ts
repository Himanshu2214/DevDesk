// Phone reminders in the Android app (Capacitor Local Notifications): the phone itself schedules them – no server, no
// account. Re-planned whenever tickets or time entries change, so they always match the data:
//   - due: "Due today" at 09:00 on the due date, "Due tomorrow" at 17:00 the day before (next 7 days, open tickets)
//   - timer: "Timer still running" 3 hours after a timer was started
//   - log: "No time logged today" at 18:00 on a workday without any time entry
// Each kind can be switched off in Account → Reminders (stored on this phone). planReminders() is pure (unit-tested);
// scheduleReminders() hands its result to Android. Loaded only inside the app (dynamic import).
import type { Ticket, Worklog } from '../api';
import { DAY, isOpen, isoDate } from './format';

export interface ReminderPrefs { due: boolean; timer: boolean; log: boolean }
export interface Reminder { id: number; at: Date; title: string; body: string; route: string }

const PREFS = 'slate-reminders';
export const DEFAULT_PREFS: ReminderPrefs = { due: true, timer: true, log: true };
export function loadPrefs(): ReminderPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } } catch { return DEFAULT_PREFS }
}
export function savePrefs(p: ReminderPrefs) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)) } catch { /* private mode */ }
  dispatchEvent(new Event('slate-reminders'));
}

/** notification ids 7000–7999 belong to these reminders (so re-planning never touches anything else) */
export const ID_BASE = 7000;
const MAX = 60;
const atLocal = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);
const label = (t: Ticket) => `${t.TicketId} ${t.Title}`;
const many = (ts: Ticket[]) => ts.length === 1 ? label(ts[0]) : `${ts.length} tickets: ${ts.slice(0, 3).map(t => t.TicketId).join(', ')}${ts.length > 3 ? '…' : ''}`;

/** what should be scheduled now – only future moments, at most 60 */
export function planReminders(tickets: Ticket[], work: Worklog[], prefs: ReminderPrefs, now = new Date()): Reminder[] {
  const out: Reminder[] = [];
  let id = ID_BASE;
  const add = (at: Date, title: string, body: string, route: string) => { if (at.getTime() > now.getTime() && out.length < MAX) out.push({ id: id++, at, title, body, route }) };

  if (prefs.due) {
    const open = tickets.filter(t => isOpen(t) && t.DueDate);
    for (let i = 0; i < 7; i++) {
      const day = isoDate(new Date(now.getTime() + i * DAY));
      const due = open.filter(t => t.DueDate!.slice(0, 10) === day);
      if (!due.length) continue;
      const one = due.length === 1;
      add(atLocal(day, 9), one ? 'Due today' : `${due.length} tickets due today`, many(due), one ? `ticket/${due[0].TicketId}` : 'list/active');
      add(new Date(atLocal(day, 17).getTime() - DAY), one ? 'Due tomorrow' : `${due.length} tickets due tomorrow`, many(due), one ? `ticket/${due[0].TicketId}` : 'list/active');
    }
  }
  if (prefs.timer) {
    const running = tickets.find(t => t.TimerStartedAt);
    if (running) add(new Date(Date.parse(running.TimerStartedAt!) + 3 * 36e5), 'Timer still running', `3 hours on ${label(running)} – stop it if you are done.`, `ticket/${running.TicketId}`);
  }
  if (prefs.log) {
    const day = isoDate(now), weekday = now.getDay();
    const logged = work.some(w => w.WorkDate.slice(0, 10) === day && Number(w.Hours) > 0);
    if (weekday >= 1 && weekday <= 5 && !logged) add(atLocal(day, 18), 'No time logged today', 'Log what you worked on before you forget.', 'timesheet');
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Android: may we show notifications? `ask` shows the system question (Android 13+) */
export async function notificationsAllowed(ask: boolean): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const p = await LocalNotifications.checkPermissions();
  if (p.display === 'granted') return true;
  if (!ask || p.display === 'denied') return false;
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

let tapListener = false;
/** replaces the pending reminders with a fresh plan; a tap on one opens its ticket / list */
export async function scheduleReminders(tickets: Ticket[], work: Worklog[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if (!tapListener) {
    tapListener = true;
    void LocalNotifications.addListener('localNotificationActionPerformed', a => {
      const route = (a.notification.extra as { route?: string } | undefined)?.route;
      if (route) location.hash = route;
    });
  }
  if (!(await notificationsAllowed(false))) return;
  const pending = (await LocalNotifications.getPending()).notifications.filter(n => n.id >= ID_BASE && n.id < ID_BASE + 1000);
  if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(n => ({ id: n.id })) });
  const plan = planReminders(tickets, work, loadPrefs());
  if (!plan.length) return;
  await LocalNotifications.schedule({ notifications: plan.map(r => ({
    id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true },
    smallIcon: 'ic_stat_slate', iconColor: '#4C7DFF', extra: { route: r.route },
  })) });
}
