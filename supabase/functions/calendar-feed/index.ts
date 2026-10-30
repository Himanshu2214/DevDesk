// Meetings for the Calendar page, from two possible sources:
//  1. "Connect Google Calendar" (OAuth, read-only): this function sends the user to Google, receives the callback,
//     keeps the refresh token encrypted (table calendar_tokens) and reads events from the Google Calendar API.
//  2. A pasted private iCal address (Outlook, Apple, or Google without OAuth), read server-side (no CORS on feeds).
// POST (signed in, verified session) – body { action }:
//   'connect' → { url } to send the browser to Google · 'disconnect' · 'status' → { google, ics }
//   default   → { connected, events } for { from, to };  { test: url } checks an iCal address before saving it.
// GET ?code&state – Google's redirect after consent (no user token; the state value ties it to the user).
// Deploy with --no-verify-jwt (the Google redirect carries no token); every path checks access itself.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (the Web OAuth client), CODE_PEPPER (token encryption), APP_URL.
import { admin, caller, cors, json } from '../_shared/login-code.ts';
import { type CalEvent, eventsBetween } from '../_shared/ics.ts';
import { fromGoogle, type GEvent } from '../_shared/gcal.ts';

type Db = ReturnType<typeof admin>;
const MAX_BYTES = 8 * 1024 * 1024;
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly';
const STATE_TTL_MS = 15 * 60_000;
const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-feed`;
const appUrl = () => (Deno.env.get('APP_URL') ?? '').replace(/\/?$/, '/');
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/* ---------- refresh token at rest: AES-GCM with a key derived from CODE_PEPPER ---------- */
async function key() {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('slate-space-calendar:' + (Deno.env.get('CODE_PEPPER') ?? '')));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(text)));
  return b64(iv) + '.' + b64(ct);
}
async function open(sealed: string) {
  const [iv, ct] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct)));
}

/* ---------- Google ---------- */
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '', client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '', ...params }),
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) as Record<string, string> };
}
class Gone extends Error {}
async function googleEvents(db: Db, userId: string, sealed: string, from: string, to: string): Promise<CalEvent[]> {
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: await open(sealed) });
  if (!t.ok) {
    if (t.body.error === 'invalid_grant') { await db.from('calendar_tokens').delete().eq('user_id', userId); throw new Gone('Google Calendar access was removed. Connect it again in Account.') }
    throw new Error('Google Calendar did not answer. Try again in a moment.');
  }
  const items: GEvent[] = [];
  let page = '';
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), maxResults: '2500',
      fields: 'nextPageToken,items(id,status,summary,location,hangoutLink,start,end,eventType,conferenceData/entryPoints(entryPointType,uri),attendees(self,responseStatus))' });
    if (page) q.set('pageToken', page);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${t.body.access_token}` }, signal: AbortSignal.timeout(12_000) });
    if (res.status === 403) throw new Error('Google Calendar API is not enabled for this app yet (setup guide, step 16).');
    if (!res.ok) throw new Error(`Google Calendar could not be read (HTTP ${res.status}).`);
    const j = await res.json() as { items?: GEvent[]; nextPageToken?: string };
    items.push(...(j.items ?? []));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return fromGoogle(items);
}

/** Google's redirect back after the consent screen */
async function callback(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams, db = admin();
  const back = (result: string) => new Response(null, { status: 302, headers: { Location: `${appUrl()}?calendar=${result}#account` } });
  const state = p.get('state') ?? '';
  const { data: st } = await db.from('oauth_states').delete().eq('state', state).select('user_id, created_at').maybeSingle();
  if (!st || Date.now() - Date.parse(st.created_at) > STATE_TTL_MS) return back('expired');
  if (p.get('error') || !p.get('code')) return back('denied');
  const t = await tokenRequest({ grant_type: 'authorization_code', code: p.get('code')!, redirect_uri: redirectUri() });
  if (!t.ok || !t.body.refresh_token) return back('failed');
  if (!(t.body.scope ?? '').includes('calendar.readonly')) return back('noscope');      // the calendar box was unticked
  let email = '';
  try { email = JSON.parse(atob(t.body.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? '' } catch { /* optional */ }
  const { error } = await db.from('calendar_tokens').upsert({ user_id: st.user_id, google_email: email, refresh_token: await seal(t.body.refresh_token), connected_at: new Date().toISOString() });
  return back(error ? 'failed' : 'connected');
}

/* ---------- pasted iCal address ---------- */
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
  if (res.status === 404 || res.status === 401 || res.status === 403) throw new Error('The calendar address is not valid any more. Copy it again.');
  if (!res.ok) throw new Error(`The calendar could not be read (HTTP ${res.status}). Try again later.`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error('The calendar is too large to read.');
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('That address does not return a calendar. Use the secret iCal address.');
  return body;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return callback(req);
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const db = admin();
  if (aal !== 'aal2') {
    const { data: v } = await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
    if (!v) return json(403, { error: 'Finish the 2-step sign-in first.' });
  }
  const body = await req.json().catch(() => ({})) as { action?: string; from?: string; to?: string; test?: string };
  const [{ data: tok }, { data: set }] = await Promise.all([
    db.from('calendar_tokens').select('google_email, refresh_token').eq('user_id', user.id).maybeSingle(),
    db.from('user_settings').select('"CalendarUrl"').eq('user_id', user.id).maybeSingle(),
  ]);
  const ics = (set as { CalendarUrl?: string } | null)?.CalendarUrl ?? '';

  if (body.action === 'status') return json(200, { google: tok?.google_email ?? null, googleReady: !!Deno.env.get('GOOGLE_CLIENT_ID'), ics: !!ics });
  if (body.action === 'connect') {
    if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) return json(501, { error: 'Connecting Google Calendar is not set up yet (setup guide, step 16).' });
    const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    await db.from('oauth_states').delete().lt('created_at', new Date(Date.now() - STATE_TTL_MS).toISOString());
    const { error } = await db.from('oauth_states').insert({ state, user_id: user.id });
    if (error) return json(500, { error: 'Could not start the Google connection. Try again.' });
    const q = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, login_hint: user.email ?? '' });
    return json(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }
  if (body.action === 'disconnect') {
    if (tok) {
      try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: await open(tok.refresh_token) }) }) } catch { /* already gone */ }
      await db.from('calendar_tokens').delete().eq('user_id', user.id);
    }
    return json(200, { disconnected: true });
  }

  const now = Date.now();
  const from = body.from && !Number.isNaN(Date.parse(body.from)) ? body.from : new Date(now - 7 * 864e5).toISOString();
  const to = body.to && !Number.isNaN(Date.parse(body.to)) ? body.to : new Date(now + 60 * 864e5).toISOString();
  if (Date.parse(to) - Date.parse(from) > 400 * 864e5) return json(400, { error: 'Ask for at most about a year at a time.' });

  // checking a pasted address before it is saved
  if (body.test) {
    const url = safeUrl(body.test);
    if (!url) return json(400, { error: 'Use the https calendar address (Outlook: published ICS link; Google: Secret address in iCal format).' });
    try { return json(200, { connected: true, events: eventsBetween(await fetchIcs(url), from, to) }) }
    catch (e) { return json(502, { error: (e as Error).message }) }
  }

  if (!tok && !ics) return json(200, { connected: false, events: [] });
  const events: CalEvent[] = [], errors: string[] = [];
  let connected = false;
  if (tok) {
    try { events.push(...await googleEvents(db, user.id, tok.refresh_token, from, to)); connected = true }
    catch (e) { errors.push((e as Error).message); if (!(e instanceof Gone)) connected = true }
  }
  if (ics) {
    const url = safeUrl(ics);
    try { if (url) { events.push(...eventsBetween(await fetchIcs(url), from, to)); connected = true } }
    catch (e) { errors.push((e as Error).message); connected = true }
  }
  if (!events.length && errors.length) return json(502, { error: errors[0] });
  return json(200, { connected, events: events.sort((a, b) => a.start.localeCompare(b.start)), warning: errors[0] });
});
