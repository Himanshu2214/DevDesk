import { describe, expect, it } from 'vitest';
import type { Ticket, TicketEvent, Worklog } from '../src/api/types';
import { breakdown, cycleDays, onTimeShare, percentile, progress, projection, startedAt, weeklyHours } from '../src/lib/insights';

const NOW = Date.parse('2026-10-28T12:00:00');                     // Wednesday
const day = (d: string) => d + 'T10:00:00';
const tk = (id: string, p: Partial<Ticket>) => ({ TicketUUID: id, Status: 'TODO', Project: 'GST', Area: 'SD', Tech: 'ABAP', DueDate: null, ClosedAt: null, StatusChangedAt: null, CreatedAt: day('2026-10-01'), ...p }) as Ticket;
const ev = (id: string, to: string, at: string) => ({ TicketUUID: id, StatusTo: to, EventAt: day(at) }) as TicketEvent;

const tickets = [
  tk('a', { Status: 'DONE', ClosedAt: day('2026-10-20'), DueDate: '2026-10-25' }),          // started 10-15, done on time
  tk('b', { Status: 'DONE', ClosedAt: day('2026-10-27'), DueDate: '2026-10-26', Project: 'FIN' }),   // late
  tk('c', { Status: 'PROG', CreatedAt: day('2026-10-26') }),
  tk('d', { Status: 'DONE', ClosedAt: day('2026-08-01') }),                                // closed before the window
];
const started = startedAt([ev('a', 'PROG', '2026-10-15'), ev('a', 'DONE', '2026-10-20'), ev('b', 'TODO', '2026-10-02'), ev('b', 'PROG', '2026-10-21'), ev('c', 'PROG', '2026-10-27')]);

describe('insights metrics', () => {
  it('takes the first move into work as the start', () => expect(new Date(started.get('b')!).toISOString().slice(0, 10)).toBe('2026-10-21'));

  it('counts scope, started and done per day, ignoring tickets closed before the window', () => {
    const p = progress(tickets, started, 14, NOW);
    expect(p.dates).toHaveLength(14);
    expect([p.scope.at(-1), p.started.at(-1), p.done.at(-1)]).toEqual([3, 3, 2]);
    expect(p.scope[0]).toBe(2);                                       // c was created later
  });
  it('projects the recent pace without passing the scope', () => {
    const proj = projection(progress(tickets, started, 14, NOW), 10);
    expect(proj.at(-1)).toBe(3);
  });
  it('measures cycle time and on-time share for closed tickets', () => {
    const from = NOW - 30 * 864e5;
    expect(cycleDays(tickets, started, from).map(Math.round)).toEqual([5, 6]);
    expect(onTimeShare(tickets, from)).toBe(0.5);
    expect(onTimeShare([], from)).toBeNull();
  });
  it('interpolates percentiles', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
  it('sums hours per Monday-based week', () => {
    const wl = [{ WorkDate: '2026-10-26', Hours: 2 }, { WorkDate: '2026-10-28', Hours: 1.5 }, { WorkDate: '2026-10-25', Hours: 3 }] as Worklog[];
    expect(weeklyHours(wl, 2, NOW).map(w => w.hours)).toEqual([3, 3.5]);
  });
  it('groups by project with the share done', () => {
    expect(breakdown(tickets.slice(0, 3), 'Project')).toEqual([{ key: 'GST', total: 2, done: 1 }, { key: 'FIN', total: 1, done: 1 }]);
  });
});
