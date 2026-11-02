// Calendar connection (standalone mode): talks to the calendar-feed edge function.
import { functionError, sb } from './supabase';

export interface CalendarStatus { google: string | null; googleReady: boolean; ics: boolean }

/** calls calendar-feed and turns its errors into readable messages */
export async function calendarCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('calendar-feed', { body });
  if (error) {
    const { status, message } = await functionError(error);
    throw new Error(status === 404 ? 'The calendar connection is not set up yet (setup guide, steps 15–16).' : message || 'The calendar could not be reached.');
  }
  return data as T;
}

/** sends the browser to Google's consent screen; Google returns to the app (Account) afterwards */
export async function connectGoogleCalendar() {
  const { url } = await calendarCall<{ url: string }>({ action: 'connect' });
  location.assign(url);
}

/** result of the Google round trip, read once from the address (?calendar=…) and removed from it */
export function takeCalendarResult(): string | null {
  const p = new URLSearchParams(location.search), r = p.get('calendar');
  if (!r) return null;
  p.delete('calendar');
  history.replaceState(null, '', location.pathname + (p.size ? '?' + p : '') + location.hash);
  return r;
}
export const CALENDAR_RESULT: Record<string, [string, boolean]> = {
  connected: ['Google Calendar connected – your meetings now show in Calendar', false],
  denied: ['Google Calendar was not connected: permission was not given.', true],
  noscope: ['Google Calendar was not connected: tick the calendar permission on the Google screen.', true],
  expired: ['The Google connection took too long. Try again.', true],
  failed: ['Google Calendar could not be connected. Try again.', true],
  secret: ['Google refused the client secret – set GOOGLE_CLIENT_SECRET to the Google client secret again (setup guide, step 16).', true],
};
