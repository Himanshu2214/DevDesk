// Meetings for the Calendar page: reads the signed-in user's private calendar address (Account → Google Calendar),
// fetches the iCal feed server-side (browsers cannot, Google sends no CORS headers) and returns the events of the
// requested window. Body: { from, to } (ISO dates), or { test: url } to check an address before saving it.
// Verified sessions only (passed the 2-step code or the authenticator app).
import { admin, caller, cors, json } from '../_shared/login-code.ts';
import { eventsBetween } from '../_shared/ics.ts';

const MAX_BYTES = 8 * 1024 * 1024;

/** https only, no IP addresses or local / internal host names */
function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'));
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h === 'localhost' || /\.(local|internal|localhost)$/.test(h) || !h.includes('.')) return null;
    return u;
  } catch { return null }
}

async function fetchIcs(start: URL): Promise<string> {
  // follow redirects ourselves, so every hop passes the same address check
  let u = start, res: Response;
  for (let hop = 0; ; hop++) {
    res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { Accept: 'text/calendar, */*' } });
    if (res.status < 300 || res.status >= 400) break;
    const next = safeUrl(new URL(res.headers.get('location') ?? '', u).href);
    if (!next || hop >= 4) throw new Error('The calendar address redirects somewhere it cannot be read from.');
    u = next;
  }
  if (res.status === 404 || res.status === 401 || res.status === 403) throw new Error('The calendar address is not valid any more. Copy it again from Google Calendar.');
  if (!res.ok) throw new Error(`The calendar could not be read (HTTP ${res.status}). Try again later.`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error('The calendar is too large to read.');
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('That address does not return a calendar. Use the "Secret address in iCal format".');
  return body;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const db = admin();
  if (aal !== 'aal2') {
    const { data: v } = await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
    if (!v) return json(403, { error: 'Finish the 2-step sign-in first.' });
  }
  const body = await req.json().catch(() => ({})) as { from?: string; to?: string; test?: string };

  let raw = body.test;
  if (!raw) {
    const { data } = await db.from('user_settings').select('"CalendarUrl"').eq('user_id', user.id).maybeSingle();
    raw = (data as { CalendarUrl?: string } | null)?.CalendarUrl ?? '';
    if (!raw) return json(200, { connected: false, events: [] });
  }
  const url = safeUrl(raw);
  if (!url) return json(400, { error: 'Use the https calendar address from Google Calendar (Settings → your calendar → Secret address in iCal format).' });

  const now = Date.now();
  const from = body.from && !Number.isNaN(Date.parse(body.from)) ? body.from : new Date(now - 7 * 864e5).toISOString();
  const to = body.to && !Number.isNaN(Date.parse(body.to)) ? body.to : new Date(now + 60 * 864e5).toISOString();
  if (Date.parse(to) - Date.parse(from) > 400 * 864e5) return json(400, { error: 'Ask for at most about a year at a time.' });
  try {
    const events = eventsBetween(await fetchIcs(url), from, to);
    return json(200, { connected: true, events });
  } catch (e) {
    return json(502, { error: (e as Error).message || 'The calendar could not be read.' });
  }
});
