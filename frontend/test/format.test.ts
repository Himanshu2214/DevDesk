import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../src/api/types';
import { daysUntil, isOverdue, isoDate, lastWorkdays, r1, urgency, weekStart } from '../src/lib/format';

const ticket = (p: Partial<Ticket>) => ({ Status: 'TODO', Priority: '3', DueDate: null, ...p }) as Ticket;

describe('date helpers', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T10:00:00')) });   // a Wednesday
  afterEach(() => { vi.useRealTimers() });

  it('formats local dates as YYYY-MM-DD', () => expect(isoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05'));
  it('counts days until a due date', () => {
    expect(daysUntil('2026-10-28')).toBe(0);
    expect(daysUntil('2026-10-31')).toBe(3);
    expect(daysUntil('2026-10-20')).toBe(-8);
    expect(daysUntil(null)).toBeNull();
  });
  it('starts the week on Monday', () => {
    expect(isoDate(weekStart())).toBe('2026-10-26');
    expect(isoDate(weekStart(-1))).toBe('2026-10-19');
  });
  it('skips the weekend for the last working days', () => {
    vi.setSystemTime(new Date('2026-10-26T09:00:00'));                                          // Monday
    expect(lastWorkdays(2)).toEqual(['2026-10-23', '2026-10-22']);
  });
  it('treats open tickets past their due date as overdue, done tickets never', () => {
    expect(isOverdue(ticket({ DueDate: '2026-10-27' }))).toBe(true);
    expect(isOverdue(ticket({ DueDate: '2026-10-28' }))).toBe(false);
    expect(isOverdue(ticket({ DueDate: '2026-10-01', Status: 'DONE' }))).toBe(false);
  });
});

describe('numbers and ordering', () => {
  it('rounds to one decimal', () => { expect(r1(1.25)).toBe(1.3); expect(r1(2)).toBe(2) });
  it('sorts by priority, then by due date, undated last', () => {
    const list = [ticket({ Priority: '2', DueDate: null }), ticket({ Priority: '2', DueDate: '2026-11-01' }), ticket({ Priority: '1', DueDate: '2026-12-01' })];
    expect(list.sort(urgency).map(t => `${t.Priority}/${t.DueDate}`)).toEqual(['1/2026-12-01', '2/2026-11-01', '2/null']);
  });
});
