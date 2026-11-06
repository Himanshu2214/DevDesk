// Phone reminders (src/lib/reminders.ts): what gets scheduled from the tickets and time entries.
import { describe, expect, it } from 'vitest';
import { planReminders, DEFAULT_PREFS } from '../src/lib/reminders';
import type { Ticket, Worklog } from '../src/api';

const t = (id: string, over: Partial<Ticket> = {}) => ({ TicketUUID: id, TicketId: id, Title: 'Fix ' + id, Status: 'TODO', DueDate: null, TimerStartedAt: null, ...over }) as unknown as Ticket;
const w = (day: string, hours = 1) => ({ WorkDate: day, Hours: hours }) as unknown as Worklog;
const WED_8AM = new Date('2026-11-04T08:00:00');          // a Wednesday, before 09:00
const at = (r: { at: Date }) => `${r.at.getFullYear()}-${String(r.at.getMonth() + 1).padStart(2, '0')}-${String(r.at.getDate()).padStart(2, '0')} ${String(r.at.getHours()).padStart(2, '0')}:00`;

describe('phone reminders', () => {
  it('due today at 09:00 and due tomorrow at 17:00 the day before; done tickets are left out', () => {
    const plan = planReminders([t('TK-1', { DueDate: '2026-11-04' }), t('TK-2', { DueDate: '2026-11-06' }), t('TK-3', { DueDate: '2026-11-04', Status: 'DONE' })], [w('2026-11-04')], DEFAULT_PREFS, WED_8AM);
    expect(plan.map(r => `${at(r)} ${r.title}: ${r.body} → ${r.route}`)).toEqual([
      '2026-11-04 09:00 Due today: TK-1 Fix TK-1 → ticket/TK-1',
      '2026-11-05 17:00 Due tomorrow: TK-2 Fix TK-2 → ticket/TK-2',
      '2026-11-06 09:00 Due today: TK-2 Fix TK-2 → ticket/TK-2',
    ]);
  });

  it('several tickets on one day become one reminder that opens the list', () => {
    const plan = planReminders(['A', 'B', 'C', 'D'].map(x => t('TK-' + x, { DueDate: '2026-11-04' })), [w('2026-11-04')], { ...DEFAULT_PREFS }, WED_8AM);
    expect(plan[0]).toMatchObject({ title: '4 tickets due today', body: '4 tickets: TK-A, TK-B, TK-C…', route: 'list/active' });
  });

  it('a running timer gets a reminder 3 hours after it started', () => {
    const plan = planReminders([t('TK-9', { TimerStartedAt: '2026-11-04T07:30:00' })], [w('2026-11-04')], DEFAULT_PREFS, WED_8AM);
    expect(plan.map(r => `${at(r)} ${r.title}`)).toEqual(['2026-11-04 10:00 Timer still running']);
  });

  it('no time logged on a workday: a reminder at 18:00 – not on weekends, not once something is logged', () => {
    expect(planReminders([], [], DEFAULT_PREFS, WED_8AM).map(r => `${at(r)} ${r.title} → ${r.route}`)).toEqual(['2026-11-04 18:00 No time logged today → timesheet']);
    expect(planReminders([], [w('2026-11-04', 0.25)], DEFAULT_PREFS, WED_8AM)).toEqual([]);
    expect(planReminders([], [], DEFAULT_PREFS, new Date('2026-11-07T08:00:00'))).toEqual([]);   // Saturday
  });

  it('only future moments; each kind can be switched off', () => {
    const late = new Date('2026-11-04T19:00:00');
    expect(planReminders([t('TK-1', { DueDate: '2026-11-04' })], [], DEFAULT_PREFS, late)).toEqual([]);
    expect(planReminders([t('TK-1', { DueDate: '2026-11-04', TimerStartedAt: '2026-11-04T07:30:00' })], [], { due: false, timer: false, log: false }, WED_8AM)).toEqual([]);
  });

  it('uses its own id range and never more than 60', () => {
    const lots = Array.from({ length: 200 }, (_, i) => t('TK-' + i, { DueDate: `2026-11-0${4 + (i % 6)}` }));
    const plan = planReminders(lots, [], DEFAULT_PREFS, WED_8AM);
    expect(plan.length).toBeLessThanOrEqual(60);
    expect(plan.every(r => r.id >= 7000 && r.id < 8000)).toBe(true);
  });
});
