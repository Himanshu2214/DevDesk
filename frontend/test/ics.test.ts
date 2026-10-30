// Google Calendar feed reader (supabase/functions/_shared/ics.ts)
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { eventsBetween } from '../../supabase/functions/_shared/ics';

const cal = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-TIMEZONE:Asia/Kolkata', ...events, 'END:VCALENDAR'].join('\r\n');
const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
const titles = (list: { title: string }[]) => list.map(e => e.title);

describe('calendar feed', () => {
  it('reads timed events in UTC and in a time zone', () => {
    const list = eventsBetween(cal(
      ev('UID:a', 'SUMMARY:Stand-up', 'DTSTART;TZID=Asia/Kolkata:20261102T100000', 'DTEND;TZID=Asia/Kolkata:20261102T101500'),
      ev('UID:b', 'SUMMARY:Call with\\, Berlin', 'DTSTART:20261102T120000Z', 'DURATION:PT45M'),
    ), '2026-11-01', '2026-11-08');
    expect(list.map(e => [e.title, e.start, e.end])).toEqual([
      ['Stand-up', '2026-11-02T04:30:00.000Z', '2026-11-02T04:45:00.000Z'],
      ['Call with, Berlin', '2026-11-02T12:00:00.000Z', '2026-11-02T12:45:00.000Z'],
    ]);
  });

  it('reads all-day events and multi-day spans', () => {
    const list = eventsBetween(cal(ev('UID:c', 'SUMMARY:Diwali', 'DTSTART;VALUE=DATE:20261108', 'DTEND;VALUE=DATE:20261110')), '2026-11-01', '2026-11-30');
    expect(list[0]).toMatchObject({ allDay: true, start: '2026-11-08', end: '2026-11-10' });
  });

  it('repeats weekly on chosen days, skips EXDATEs and moves single occurrences', () => {
    const list = eventsBetween(cal(
      ev('UID:w', 'SUMMARY:Sync', 'DTSTART;TZID=Asia/Kolkata:20261005T150000', 'DTEND;TZID=Asia/Kolkata:20261005T153000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Asia/Kolkata:20261104T150000'),
      ev('UID:w', 'SUMMARY:Sync (moved)', 'RECURRENCE-ID;TZID=Asia/Kolkata:20261102T150000', 'DTSTART;TZID=Asia/Kolkata:20261103T170000', 'DTEND;TZID=Asia/Kolkata:20261103T173000'),
    ), '2026-11-01T00:00:00Z', '2026-11-12T00:00:00Z');
    expect(list.map(e => [e.title, e.start.slice(0, 16)])).toEqual([
      ['Sync (moved)', '2026-11-03T11:30'],              // Mon 2nd moved to Tue 3rd 17:00 IST
      ['Sync', '2026-11-09T09:30'], ['Sync', '2026-11-11T09:30'],   // Wed 4th skipped
    ]);
  });

  it('keeps the wall-clock time across a daylight-saving change', () => {
    const list = eventsBetween(cal(ev('UID:d', 'SUMMARY:NY call', 'DTSTART;TZID=America/New_York:20261026T090000', 'DTEND;TZID=America/New_York:20261026T093000', 'RRULE:FREQ=WEEKLY;COUNT=3')),
      '2026-10-20', '2026-11-30');
    expect(list.map(e => e.start.slice(11, 16))).toEqual(['13:00', '14:00', '14:00']);      // EDT → EST on 1 Nov
  });

  it('handles monthly rules, COUNT, UNTIL and cancelled events', () => {
    const list = eventsBetween(cal(
      ev('UID:m', 'SUMMARY:Release board', 'DTSTART:20260908T090000Z', 'DTEND:20260908T100000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'),
      ev('UID:n', 'SUMMARY:Daily', 'DTSTART:20261030T080000Z', 'RRULE:FREQ=DAILY;COUNT=3'),
      ev('UID:u', 'SUMMARY:Until', 'DTSTART:20261029T080000Z', 'RRULE:FREQ=DAILY;UNTIL=20261031T235959Z'),
      ev('UID:x', 'SUMMARY:Cancelled', 'STATUS:CANCELLED', 'DTSTART:20261102T080000Z'),
    ), '2026-10-29', '2026-12-31');
    expect(list.filter(e => e.title === 'Release board').map(e => e.start.slice(0, 10))).toEqual(['2026-11-10', '2026-12-08']);
    expect(list.filter(e => e.title === 'Daily')).toHaveLength(3);
    expect(list.filter(e => e.title === 'Until')).toHaveLength(3);
    expect(titles(list)).not.toContain('Cancelled');
  });

  it('finds the meeting link and unfolds long lines', () => {
    const list = eventsBetween(cal(ev('UID:l', 'SUMMARY:Design review', 'DTSTART:20261103T100000Z',
      'DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij\\nOr dial',
      'LOCATION:Room 4', ' B')), '2026-11-01', '2026-11-08');
    expect(list[0]).toMatchObject({ link: 'https://meet.google.com/abc-defg-hij', location: 'Room 4B' });
  });
});
