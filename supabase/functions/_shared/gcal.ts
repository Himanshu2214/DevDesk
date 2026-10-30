// Google Calendar API events → the Calendar page's meeting format. Plain TypeScript (unit-tested in the frontend).
import type { CalEvent } from './ics.ts';

export interface GEvent {
  id: string; status?: string; summary?: string; location?: string; hangoutLink?: string; htmlLink?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
  eventType?: string;
}

const LINK = /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s"<>\\)]+/i;

/** Skips cancelled events, ones you declined, and working-location / out-of-office markers */
export function fromGoogle(items: GEvent[]): CalEvent[] {
  return items.flatMap(e => {
    if (e.status === 'cancelled' || !e.start) return [];
    if (e.eventType === 'workingLocation' || e.eventType === 'outOfOffice' || e.eventType === 'focusTime') return [];
    if (e.attendees?.some(a => a.self && a.responseStatus === 'declined')) return [];
    const allDay = !!e.start.date;
    const start = allDay ? e.start.date! : new Date(e.start.dateTime!).toISOString();
    const end = allDay ? (e.end?.date ?? start) : new Date(e.end?.dateTime ?? e.start.dateTime!).toISOString();
    const video = e.hangoutLink || e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri || (e.location?.match(LINK) ?? [''])[0];
    return [{ id: 'g:' + e.id, title: e.summary?.trim() || '(no title)', start, end, allDay, location: e.location ?? '', link: video ?? '' }];
  });
}
