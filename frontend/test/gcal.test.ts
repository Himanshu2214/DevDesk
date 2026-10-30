// Google Calendar API events → meetings (supabase/functions/_shared/gcal.ts)
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fromGoogle } from '../../supabase/functions/_shared/gcal';

describe('Google Calendar events', () => {
  it('maps timed and all-day events with their meeting link', () => {
    expect(fromGoogle([
      { id: '1', summary: 'Sprint review', start: { dateTime: '2026-11-02T10:00:00+05:30' }, end: { dateTime: '2026-11-02T11:00:00+05:30' }, hangoutLink: 'https://meet.google.com/abc-defg-hij' },
      { id: '2', summary: 'Diwali', start: { date: '2026-11-08' }, end: { date: '2026-11-09' } },
      { id: '3', start: { dateTime: '2026-11-03T09:00:00Z' }, end: { dateTime: '2026-11-03T09:30:00Z' },
        conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://zoom.us/j/123' }] } },
    ])).toEqual([
      { id: 'g:1', title: 'Sprint review', start: '2026-11-02T04:30:00.000Z', end: '2026-11-02T05:30:00.000Z', allDay: false, location: '', link: 'https://meet.google.com/abc-defg-hij' },
      { id: 'g:2', title: 'Diwali', start: '2026-11-08', end: '2026-11-09', allDay: true, location: '', link: '' },
      { id: 'g:3', title: '(no title)', start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T09:30:00.000Z', allDay: false, location: '', link: 'https://zoom.us/j/123' },
    ]);
  });
  it('leaves out cancelled and declined meetings and working-location markers', () => {
    expect(fromGoogle([
      { id: 'a', status: 'cancelled', start: { dateTime: '2026-11-02T10:00:00Z' } },
      { id: 'b', summary: 'Declined', start: { dateTime: '2026-11-02T10:00:00Z' }, attendees: [{ self: true, responseStatus: 'declined' }] },
      { id: 'c', summary: 'Office', eventType: 'workingLocation', start: { date: '2026-11-02' } },
      { id: 'd', summary: 'Kept', start: { dateTime: '2026-11-02T10:00:00Z' }, attendees: [{ self: true, responseStatus: 'accepted' }] },
    ]).map(e => e.title)).toEqual(['Kept']);
  });
});
