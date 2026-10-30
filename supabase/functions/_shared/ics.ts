// Reads an iCalendar (.ics) feed – e.g. Google Calendar's "secret address in iCal format" – into the events of a
// date window. Handles all-day and timed events, time zones (TZID, UTC, floating), repeating events
// (DAILY / WEEKLY / MONTHLY / YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE, moved single
// occurrences (RECURRENCE-ID) and cancelled events. Plain TypeScript (no Deno APIs), so it is unit-tested in the frontend.

export interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; location: string; link: string }

interface Prop { value: string; params: Record<string, string> }
type Raw = Record<string, Prop[]>;
interface Local { y: number; mo: number; d: number; h: number; mi: number; s: number }

/* ---------- lines and properties ---------- */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
function parseLine(line: string): [string, Prop] | null {
  const colon = (() => { let q = false; for (let i = 0; i < line.length; i++) { if (line[i] === '"') q = !q; else if (line[i] === ':' && !q) return i } return -1 })();
  if (colon < 0) return null;
  const [name, ...ps] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of ps) { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '') }
  return [name.toUpperCase(), { value: line.slice(colon + 1), params }];
}
const text = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/* ---------- time zones ---------- */
const WINDOWS_TZ: Record<string, string> = {
  'India Standard Time': 'Asia/Kolkata', 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC', 'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'Arabian Standard Time': 'Asia/Dubai', 'Singapore Standard Time': 'Asia/Singapore', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney',
};
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zoneOk(tz: string): string {
  const z = WINDOWS_TZ[tz] ?? tz.replace(/^\/.*?\/(?=\w+\/\w+)/, '');                   // "/mozilla.org/…/Europe/Berlin" style ids
  try { if (!fmtCache.has(z)) fmtCache.set(z, new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })); return z }
  catch { return 'UTC' }
}
/** offset of the zone from UTC at that instant, in ms */
function offset(tz: string, utcMs: number): number {
  if (tz === 'UTC') return 0;
  const parts = Object.fromEntries(fmtCache.get(tz)!.formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(utcMs / 1000) * 1000;
}
/** wall-clock time in a zone → UTC ms (correct across daylight-saving changes) */
function toUtc(l: Local, tz: string): number {
  const guess = Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi, l.s);
  const first = guess - offset(tz, guess);
  return guess - offset(tz, first);
}
function toLocal(utcMs: number, tz: string): Local {
  const d = new Date(utcMs + offset(tz, utcMs));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

/* ---------- dates ---------- */
interface When { allDay: boolean; local: Local; tz: string }
function parseWhen(p: Prop, calTz: string): When {
  const v = p.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) throw new Error('Bad date ' + v);
  const local = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
  if (!m[4] || p.params.VALUE === 'DATE') return { allDay: true, local, tz: 'UTC' };
  return { allDay: false, local, tz: m[7] ? 'UTC' : zoneOk(p.params.TZID ?? calTz) };
}
const ymd = (l: Local) => `${l.y}-${String(l.mo).padStart(2, '0')}-${String(l.d).padStart(2, '0')}`;
const addDays = (l: Local, n: number): Local => { const t = new Date(Date.UTC(l.y, l.mo - 1, l.d + n)); return { ...l, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() } };
const weekday = (l: Local) => new Date(Date.UTC(l.y, l.mo - 1, l.d)).getUTCDay();          // 0 = Sunday
const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function duration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

/* ---------- repeating events: occurrence dates in local wall-clock time ---------- */
function occurrences(start: Local, rule: string, until: number, toUtcMs: (l: Local) => number): Local[] {
  const r = Object.fromEntries(rule.split(';').map(x => x.split('=')).map(([k, v]) => [k.toUpperCase(), v ?? '']));
  const freq = r.FREQ, interval = Math.max(1, +(r.INTERVAL || 1)), count = r.COUNT ? +r.COUNT : Infinity;
  const ruleEnd = r.UNTIL ? (() => { const w = parseWhen({ value: r.UNTIL, params: {} }, 'UTC'); return w.allDay ? Date.UTC(w.local.y, w.local.mo - 1, w.local.d, 23, 59, 59) : toUtc(w.local, 'UTC') })() : Infinity;
  const stop = Math.min(until, ruleEnd);
  const byDay = (r.BYDAY || '').split(',').filter(Boolean).map(x => { const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x)!; return { n: m?.[1] ? +m[1] : 0, wd: DAYS.indexOf(m?.[2] ?? '') } }).filter(x => x.wd >= 0);
  const byMonthDay = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  const out: Local[] = [];
  let seen = 0;
  const push = (l: Local) => {
    const t = toUtcMs(l);
    if (t < toUtcMs(start) || t > stop || seen >= count) return t > stop || seen >= count;
    seen++; out.push(l); return false;
  };
  for (let period = 0; period < 5000; period++) {
    let candidates: Local[] = [];
    if (freq === 'DAILY') candidates = [addDays(start, period * interval)];
    else if (freq === 'WEEKLY') {
      const monday = addDays(start, -((weekday(start) + 6) % 7) + period * interval * 7);
      const wds = byDay.length ? byDay.map(b => b.wd) : [weekday(start)];
      candidates = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(monday, i)).filter(l => wds.includes(weekday(l)));
    } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
      const step = freq === 'MONTHLY' ? interval : interval * 12;
      const mIdx = start.mo - 1 + period * step, y = start.y + Math.floor(mIdx / 12), mo = (mIdx % 12) + 1, dim = daysIn(y, mo);
      if (byDay.length) {
        for (const b of byDay) {
          const all = Array.from({ length: dim }, (_, i) => ({ ...start, y, mo, d: i + 1 })).filter(l => weekday(l) === b.wd);
          if (b.n > 0 && all[b.n - 1]) candidates.push(all[b.n - 1]); else if (b.n < 0 && all.at(b.n)) candidates.push(all.at(b.n)!); else if (!b.n) candidates.push(...all);
        }
      } else {
        for (const md of byMonthDay.length ? byMonthDay : [start.d]) { const d = md < 0 ? dim + md + 1 : md; if (d >= 1 && d <= dim) candidates.push({ ...start, y, mo, d }) }
      }
      candidates.sort((a, b) => a.d - b.d);
    } else return [start];
    for (const c of candidates) if (push(c)) return out;
    if (candidates.length && toUtcMs(candidates[candidates.length - 1]) > stop) return out;
  }
  return out;
}

const LINK = /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s"<>\\)]+/i;

/** Events overlapping [from, to) – from/to as ISO date or date-time */
export function eventsBetween(ics: string, fromIso: string, toIso: string, max = 1500): CalEvent[] {
  const from = Date.parse(fromIso), to = Date.parse(toIso);
  const lines = unfold(ics);
  const calTz = zoneOk(lines.find(l => l.startsWith('X-WR-TIMEZONE:'))?.slice(14).trim() || 'UTC');
  const vevents: Raw[] = [];
  let cur: Raw | null = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; depth = 0; continue }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue }                         // VALARM inside an event
    if (line.startsWith('END:') && depth) { depth--; continue }
    if (line === 'END:VEVENT') { vevents.push(cur); cur = null; continue }
    if (depth) continue;
    const p = parseLine(line); if (p) (cur[p[0]] ??= []).push(p[1]);
  }

  // moved / changed single occurrences replace the generated one
  const overrides = new Map<string, Raw>();
  for (const e of vevents) if (e['RECURRENCE-ID']) {
    const w = parseWhen(e['RECURRENCE-ID'][0], calTz);
    overrides.set(e.UID?.[0]?.value + '|' + (w.allDay ? ymd(w.local) : toUtc(w.local, w.tz)), e);
  }

  const out: CalEvent[] = [];
  const emit = (e: Raw, start: When, startMs: number, id: string) => {
    if ((e.STATUS?.[0]?.value ?? '').toUpperCase() === 'CANCELLED') return;
    const endProp = e.DTEND?.[0] ?? e.DUE?.[0];
    let endMs: number;
    if (start.allDay) {
      const s0 = Date.UTC(start.local.y, start.local.mo - 1, start.local.d);
      const firstStart = parseWhen(e.DTSTART[0], calTz), firstEnd = endProp ? parseWhen(endProp, calTz) : null;
      const days = firstEnd ? Math.max(1, Math.round((Date.UTC(firstEnd.local.y, firstEnd.local.mo - 1, firstEnd.local.d) - Date.UTC(firstStart.local.y, firstStart.local.mo - 1, firstStart.local.d)) / 864e5)) : 1;
      endMs = s0 + days * 864e5;
      if (endMs <= from || s0 >= to) return;
      out.push({ id, title: text(e.SUMMARY?.[0]?.value) || '(no title)', start: ymd(start.local), end: new Date(endMs).toISOString().slice(0, 10), allDay: true,
        location: text(e.LOCATION?.[0]?.value), link: linkOf(e) });
      return;
    }
    const firstStart = parseWhen(e.DTSTART[0], calTz);
    const len = endProp ? toUtc(parseWhen(endProp, calTz).local, parseWhen(endProp, calTz).tz) - toUtc(firstStart.local, firstStart.tz)
      : e.DURATION ? duration(e.DURATION[0].value) : 0;
    endMs = startMs + Math.max(0, len);
    if (endMs <= from && endMs !== startMs || startMs >= to || (endMs === startMs && startMs < from)) return;
    out.push({ id, title: text(e.SUMMARY?.[0]?.value) || '(no title)', start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), allDay: false,
      location: text(e.LOCATION?.[0]?.value), link: linkOf(e) });
  };
  const linkOf = (e: Raw) => (e.URL?.[0]?.value.match(LINK) ?? e.LOCATION?.[0]?.value.match(LINK) ?? text(e.DESCRIPTION?.[0]?.value).match(LINK) ?? [''])[0];

  for (const e of vevents) {
    if (!e.DTSTART || e['RECURRENCE-ID']) continue;
    const start = parseWhen(e.DTSTART[0], calTz), uid = e.UID?.[0]?.value ?? Math.random().toString(36);
    const msOf = (l: Local) => (start.allDay ? Date.UTC(l.y, l.mo - 1, l.d) : toUtc(l, start.tz));
    if (!e.RRULE) {
      const ov = overrides.get(uid + '|' + (start.allDay ? ymd(start.local) : msOf(start.local)));
      if (!ov) emit(e, start, msOf(start.local), uid);
      continue;
    }
    const ex = new Set((e.EXDATE ?? []).flatMap(p => p.value.split(',').map(v => { const w = parseWhen({ value: v, params: p.params }, calTz); return w.allDay ? ymd(w.local) : String(toUtc(w.local, w.tz)) })));
    for (const occ of occurrences(start.local, e.RRULE[0].value, to + 864e5, msOf)) {
      const ms = msOf(occ), key = start.allDay ? ymd(occ) : String(ms);
      if (ex.has(key) || ex.has(ymd(occ))) continue;
      const ov = overrides.get(uid + '|' + key);
      if (ov) { const w = parseWhen(ov.DTSTART[0], calTz); emit(ov, w, w.allDay ? Date.UTC(w.local.y, w.local.mo - 1, w.local.d) : toUtc(w.local, w.tz), uid + '@' + key); continue }
      emit(e, { ...start, local: occ }, ms, uid + '@' + key);
    }
  }
  // overrides that moved into the window from an occurrence outside the generated range
  const ids = new Set(out.map(x => x.id));
  for (const [key, ov] of overrides) {
    const id = key.replace('|', '@');
    if (ids.has(id) || !ov.DTSTART) continue;
    const w = parseWhen(ov.DTSTART[0], calTz), ms = w.allDay ? Date.UTC(w.local.y, w.local.mo - 1, w.local.d) : toUtc(w.local, w.tz);
    if (ms >= from && ms < to) emit(ov, w, ms, id);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, max);
}
export { toLocal };
