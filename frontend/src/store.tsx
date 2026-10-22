// App-wide data: master data, ticket list, recent work log and events, plus the mutation helper `run`.
// Every change goes through `run`, which refreshes the affected tickets and shows success or the SAP error.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { Project, Status, Ticket, TicketEvent, User, ValueItem, Worklog } from './api';
import { DAY, isoDate, STATUS_NAME, today } from './lib/format';

interface Toast { id: number; text: React.ReactNode; error?: boolean }
interface Store {
  ready: boolean;
  error: string | null;
  user: User;
  projects: Project[];
  values: ValueItem[];
  tickets: Ticket[];
  details: Record<string, Ticket>;
  recentWork: Worklog[];          // last 21 days, for Home, Inbox and "missing time"
  events: TicketEvent[];
  lastSync: number;
  reload(): Promise<void>;
  loadTicket(uuid: string): Promise<Ticket | undefined>;
  run(fn: () => Promise<unknown>, opts?: { uuids?: string[]; ok?: React.ReactNode; removed?: string }): Promise<boolean>;
  toast(text: React.ReactNode, error?: boolean): void;
  toasts: Toast[];
  text(list: string, code: string): string;
  color(list: string, code: string): string;
  project(code: string): Project | undefined;
  wip(status: Status): number;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);
const POLL_MS = 30_000;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User>({ id: '', fullName: '' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [values, setValues] = useState<ValueItem[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [details, setDetails] = useState<Record<string, Ticket>>({});
  const [recentWork, setRecentWork] = useState<Worklog[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [lastSync, setLastSync] = useState(Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const detailIds = useRef<Set<string>>(new Set());

  const toast = useCallback((text: React.ReactNode, isError = false) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, error: isError }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), isError ? 6000 : 2400);
  }, []);

  const loadSide = useCallback(async () => {
    const [w, e] = await Promise.all([api.listWorklog(isoDate(new Date(today().getTime() - 21 * DAY)), isoDate(today())), api.listEvents(150)]);
    setRecentWork(w); setEvents(e);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [u, p, v, t] = await Promise.all([api.user(), api.listProjects(), api.listValues(), api.listTickets()]);
      setUser(u); setProjects(p); setValues(v); setTickets(t);
      await loadSide();
      setError(null); setLastSync(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally { setReady(true) }
  }, [loadSide]);

  const loadTicket = useCallback(async (uuid: string) => {
    try {
      const t = await api.getTicket(uuid);
      detailIds.current.add(uuid);
      setDetails(d => ({ ...d, [uuid]: t }));
      setTickets(list => list.some(x => x.TicketUUID === uuid) ? list.map(x => x.TicketUUID === uuid ? { ...x, ...t } : x) : [t, ...list]);
      return t;
    } catch (e) {
      toast((e as Error).message, true);
      return undefined;
    }
  }, [toast]);

  const run = useCallback<Store['run']>(async (fn, opts = {}) => {
    let ok = true;
    try {
      await fn();
      if (opts.ok) toast(opts.ok);
    } catch (e) {
      ok = false;
      toast((e as Error).message, true);
    }
    if (opts.removed) {
      setTickets(list => list.filter(x => x.TicketUUID !== opts.removed));
      setDetails(d => { const n = { ...d }; delete n[opts.removed!]; return n });
    }
    await Promise.all([...(opts.uuids ?? []).map(loadTicket), loadSide()]);
    setLastSync(Date.now());
    return ok;
  }, [toast, loadTicket, loadSide]);

  useEffect(() => { reload() }, [reload]);

  // Live updates: fetch tickets changed since the newest LastChangedAt (server time, so no clock skew)
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || !ready) return;
      try {
        const newest = tickets.reduce((m, t) => (t.LastChangedAt && t.LastChangedAt > m ? t.LastChangedAt : m), '1970-01-01T00:00:00Z');
        const changed = await api.changedSince(newest);
        if (changed.length) {
          setTickets(list => {
            const map = new Map(list.map(t => [t.TicketUUID, t]));
            changed.forEach(c => map.set(c.TicketUUID, { ...map.get(c.TicketUUID), ...c }));
            return [...map.values()];
          });
          changed.filter(c => detailIds.current.has(c.TicketUUID)).forEach(c => loadTicket(c.TicketUUID));
        }
        await loadSide();
        setLastSync(Date.now());
      } catch { /* offline – try again next time */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [ready, tickets, loadSide, loadTicket]);

  const value = useMemo<Store>(() => ({
    ready, error, user, projects, values, tickets, details, recentWork, events, lastSync, reload, loadTicket, run, toast, toasts,
    text: (list, code) => values.find(v => v.ListType === list && v.Code === code)?.Text ?? (list === 'STATUS' ? STATUS_NAME[code as Status] : code),
    color: (list, code) => values.find(v => v.ListType === list && v.Code === code)?.Color || 'var(--muted)',
    project: code => projects.find(p => p.Project === code),
    wip: status => values.find(v => v.ListType === 'STATUS' && v.Code === status)?.WipLimit ?? 0,
  }), [ready, error, user, projects, values, tickets, details, recentWork, events, lastSync, reload, loadTicket, run, toast, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
