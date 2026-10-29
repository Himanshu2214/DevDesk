// App-wide data on top of TanStack Query: cached queries, background refresh every 30 s while the tab is visible,
// and `run` for every change – optimistic update first, then the backend call, then refresh (rollback on error).
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Project, Status, Ticket, TicketEvent, User, ValueItem, Worklog } from './api';
import { DAY, isoDate, STATUS_NAME, today } from './lib/format';

const POLL_MS = 30_000;
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } },
});

export const keys = {
  tickets: ['tickets'] as const,
  ticket: (uuid: string) => ['ticket', uuid] as const,
  side: ['side'] as const,               // everything derived from work log / events
  recent: ['side', 'recent'] as const,
  events: ['side', 'events'] as const,
  week: (from: string, to: string) => ['side', 'week', from, to] as const,
};

interface Toast { id: number; text: React.ReactNode; error?: boolean }
interface RunOptions {
  uuids?: string[];
  ok?: React.ReactNode;
  removed?: string;
  /** applied to the cached tickets before the call, so the screen updates at once */
  optimistic?: (t: Ticket) => Ticket;
}
interface Store {
  ready: boolean;
  error: string | null;
  user: User;
  projects: Project[];
  values: ValueItem[];
  tickets: Ticket[];
  recentWork: Worklog[];
  events: TicketEvent[];
  lastSync: number;
  reload(): Promise<void>;
  run(fn: () => Promise<unknown>, opts?: RunOptions): Promise<boolean>;
  toast(text: React.ReactNode, error?: boolean): void;
  toasts: Toast[];
  text(list: string, code: string): string;
  color(list: string, code: string): string;
  project(code: string): Project | undefined;
  wip(status: Status): number;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

/** Full ticket with all children, refreshed in the background like the list */
export function useTicketDetail(uuid: string | undefined) {
  return useQuery({ queryKey: keys.ticket(uuid ?? ''), queryFn: () => api.getTicket(uuid!), enabled: !!uuid, refetchInterval: POLL_MS });
}
/** Work log of one week (Timesheet) */
export function useWeekWorklog(from: string, to: string) {
  return useQuery({ queryKey: keys.week(from, to), queryFn: () => api.listWorklog(from, to), refetchInterval: POLL_MS });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}><StoreInner>{children}</StoreInner></QueryClientProvider>;
}

function StoreInner({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const user = useQuery({ queryKey: ['user'], queryFn: () => api.user(), staleTime: Infinity });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects(), staleTime: 5 * 60_000 });
  const values = useQuery({ queryKey: ['values'], queryFn: () => api.listValues(), staleTime: 5 * 60_000 });
  const tickets = useQuery({ queryKey: keys.tickets, queryFn: () => api.listTickets(), refetchInterval: POLL_MS });
  const recent = useQuery({ queryKey: keys.recent, refetchInterval: POLL_MS,
    queryFn: () => api.listWorklog(isoDate(new Date(today().getTime() - 21 * DAY)), isoDate(today())) });
  const events = useQuery({ queryKey: keys.events, queryFn: () => api.listEvents(150), refetchInterval: POLL_MS });

  const toast = useCallback((text: React.ReactNode, isError = false) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, error: isError }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), isError ? 6000 : 2400);
  }, []);

  const run = useCallback<Store['run']>(async (fn, opts = {}) => {
    const uuids = opts.uuids ?? [];
    // optimistic: patch the cached list and details, remember the old state for rollback
    const prevList = qc.getQueryData<Ticket[]>(keys.tickets);
    const prevDetails = uuids.map(u => [u, qc.getQueryData<Ticket>(keys.ticket(u))] as const);
    if (opts.optimistic) {
      await qc.cancelQueries({ queryKey: keys.tickets });
      qc.setQueryData<Ticket[]>(keys.tickets, l => l?.map(t => (uuids.includes(t.TicketUUID) ? opts.optimistic!(t) : t)));
      uuids.forEach(u => qc.setQueryData<Ticket>(keys.ticket(u), t => (t ? opts.optimistic!(t) : t)));
    }
    let ok = true;
    try {
      await fn();
      if (opts.ok) toast(opts.ok);
    } catch (e) {
      ok = false;
      qc.setQueryData(keys.tickets, prevList);
      prevDetails.forEach(([u, d]) => qc.setQueryData<Ticket>(keys.ticket(u), d));
      toast((e as Error).message, true);
    }
    if (opts.removed) {
      qc.setQueryData<Ticket[]>(keys.tickets, l => l?.filter(t => t.TicketUUID !== opts.removed));
      qc.removeQueries({ queryKey: keys.ticket(opts.removed) });
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.tickets }),
      qc.invalidateQueries({ queryKey: keys.side }),
      ...uuids.map(u => qc.invalidateQueries({ queryKey: keys.ticket(u) })),
    ]);
    return ok;
  }, [qc, toast]);

  const vals = values.data ?? [];
  const projs = projects.data ?? [];
  const firstError = [user, projects, values, tickets].find(q => q.isError)?.error as Error | undefined;
  const value = useMemo<Store>(() => ({
    ready: !tickets.isLoading && !values.isLoading && !projects.isLoading,
    error: firstError && !tickets.data ? firstError.message : null,
    user: user.data ?? { id: '', fullName: '' },
    projects: projs, values: vals,
    tickets: tickets.data ?? [],
    recentWork: recent.data ?? [],
    events: events.data ?? [],
    lastSync: tickets.dataUpdatedAt || Date.now(),
    reload: () => qc.invalidateQueries(),
    run, toast, toasts,
    text: (list, code) => vals.find(v => v.ListType === list && v.Code === code)?.Text ?? (list === 'STATUS' ? STATUS_NAME[code as Status] : code),
    color: (list, code) => vals.find(v => v.ListType === list && v.Code === code)?.Color || 'var(--muted)',
    project: code => projs.find(p => p.Project === code),
    wip: status => vals.find(v => v.ListType === 'STATUS' && v.Code === status)?.WipLimit ?? 0,
  }), [tickets.isLoading, tickets.data, tickets.dataUpdatedAt, values.isLoading, projects.isLoading, firstError, user.data, projs, vals, recent.data, events.data, qc, run, toast, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Ticket fields after a status change, as the BO would set them (used for optimistic updates) */
export const withStatus = (status: Status) => (t: Ticket): Ticket =>
  ({ ...t, Status: status, StatusChangedAt: new Date().toISOString(), ClosedAt: status === 'DONE' ? new Date().toISOString() : null });
