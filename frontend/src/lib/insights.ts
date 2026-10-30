// Metrics for the Insights page, calculated from tickets, their status events and the work log.
import type { Ticket, TicketEvent, Worklog } from '../api';
import { DAY, isoDate } from './format';

const WORKING = new Set(['PROG', 'TEST', 'BLOCK', 'DONE']);
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() };

/** First time each ticket left the backlog / to-do (work begun), from the status events */
export function startedAt(events: TicketEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    if (!WORKING.has(e.StatusTo)) continue;
    const at = ms(e.EventAt);
    if (!Number.isNaN(at) && at < (m.get(e.TicketUUID) ?? Infinity)) m.set(e.TicketUUID, at);
  }
  return m;
}
const closedAt = (t: Ticket) => (t.Status === 'DONE' ? ms(t.ClosedAt ?? t.StatusChangedAt) : NaN);

/** Tickets closed in the window, and those still open – the set the progress chart and the breakdown look at */
export const inWindow = (tickets: Ticket[], from: number) => tickets.filter(t => { const c = closedAt(t); return Number.isNaN(c) || c >= from });

export interface Progress { dates: number[]; scope: number[]; started: number[]; done: number[] }
/** Scope / started / completed per day over the last `days` days (like a project progress chart) */
export function progress(tickets: Ticket[], started: Map<string, number>, days: number, now = Date.now()): Progress {
  const end = startOfDay(now), from = end - (days - 1) * DAY, set = inWindow(tickets, from);
  const out: Progress = { dates: [], scope: [], started: [], done: [] };
  for (let d = from; d <= end; d += DAY) {
    const until = d === end ? now : d + DAY - 1;
    let sc = 0, st = 0, dn = 0;
    for (const t of set) {
      if (ms(t.CreatedAt) > until) continue;
      sc++;
      const c = closedAt(t), s = started.get(t.TicketUUID) ?? (Number.isNaN(c) ? NaN : c);
      if (s <= until) st++;
      if (c <= until) dn++;
    }
    out.dates.push(d); out.scope.push(sc); out.started.push(st); out.done.push(dn);
  }
  return out;
}

/** Completion pace over the last 14 days, continued `ahead` days (never above the scope) */
export function projection(p: Progress, ahead = 21): number[] {
  const n = p.done.length, pace = (p.done[n - 1] - p.done[Math.max(0, n - 15)]) / Math.min(14, n - 1 || 1);
  return [...Array(ahead)].map((_, i) => Math.min(p.scope[n - 1], Math.round((p.done[n - 1] + pace * (i + 1)) * 10) / 10));
}

/** Days from work begun (or created) to done, for tickets closed since `from` */
export function cycleDays(tickets: Ticket[], started: Map<string, number>, from: number): number[] {
  return tickets.flatMap(t => {
    const c = closedAt(t);
    if (Number.isNaN(c) || c < from) return [];
    const s = started.get(t.TicketUUID) ?? ms(t.CreatedAt);
    return Number.isNaN(s) ? [] : [Math.max(0, (c - s) / DAY)];
  });
}
/** Share of tickets closed since `from` that were done on or before their due date (tickets without due date count as on time) */
export function onTimeShare(tickets: Ticket[], from: number): number | null {
  const closed = tickets.filter(t => { const c = closedAt(t); return !Number.isNaN(c) && c >= from });
  if (!closed.length) return null;
  return closed.filter(t => !t.DueDate || isoDate(new Date(closedAt(t))) <= t.DueDate).length / closed.length;
}

/** Percentile with linear interpolation (p = 0.5 median, 0.85 …) */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y), i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/** Hours per calendar week (Monday start) for the last `weeks` weeks, oldest first */
export function weeklyHours(worklog: Worklog[], weeks: number, now = Date.now()): { monday: number; hours: number }[] {
  const t = new Date(startOfDay(now)), mon = t.getTime() - ((t.getDay() + 6) % 7) * DAY;
  const out = [...Array(weeks)].map((_, i) => ({ monday: mon - (weeks - 1 - i) * 7 * DAY, hours: 0 }));
  for (const w of worklog) {
    const d = Date.parse(w.WorkDate + 'T00:00:00'), i = out.findIndex(x => d >= x.monday && d < x.monday + 7 * DAY);
    if (i >= 0) out[i].hours += w.Hours;
  }
  return out.map(x => ({ ...x, hours: Math.round(x.hours * 100) / 100 }));
}

export type BreakBy = 'Project' | 'Area' | 'Tech';
/** Tickets per project / area / tech with the share already done, largest group first */
export function breakdown(set: Ticket[], by: BreakBy): { key: string; total: number; done: number }[] {
  const m = new Map<string, { total: number; done: number }>();
  for (const t of set) {
    const k = t[by] || '–', g = m.get(k) ?? { total: 0, done: 0 };
    g.total++; if (t.Status === 'DONE') g.done++;
    m.set(k, g);
  }
  return [...m.entries()].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
