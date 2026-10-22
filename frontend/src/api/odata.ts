// OData V4 client for service ZUI_DD_O4 (RAP, managed, no draft).
// Handles sap-client, CSRF token, ETags (If-Match), decimals as strings (IEEE754Compatible) and SAP error messages.
import type { Api, ChildNav, ChildSet, NewTicket, Project, Status, Ticket, TicketEvent, User, ValueItem, Worklog } from './types';
import { CHILD_KEY } from './types';

const BASE: string = import.meta.env.VITE_SERVICE_URL || '/sap/opu/odata4/sap/zui_dd_o4/srvd/sap/zui_dd/0001/';
const NS = 'com.sap.gateway.srvd.zui_dd.v0001';
const ACCEPT = 'application/json;IEEE754Compatible=true';
const TICKET_FIELDS = ['TicketUUID', 'TicketNo', 'TicketId', 'Title', 'Status', 'Priority', 'Project', 'ProjectName', 'Area', 'Tech', 'TicketType',
  'Environment', 'Assignee', 'Requester', 'Reference', 'DueDate', 'EstimateHours', 'LoggedHours', 'StatusChangedAt', 'ClosedAt', 'TimerStartedAt',
  'IsOverdue', 'CreatedBy', 'CreatedAt', 'LastChangedAt'];
const CHILDREN = '_Acceptance,_Test,_Checklist,_Worklog,_Note,_Event';

const sapClient = (): string => new URLSearchParams(location.search).get('sap-client') || import.meta.env.VITE_SAP_CLIENT || '';

/** Builds a URL; query values are encoded with %20 (SAP does not always read "+" as a space) */
function url(path: string, params: Record<string, string> = {}): string {
  const all = { ...params, ...(sapClient() ? { 'sap-client': sapClient() } : {}) };
  const q = Object.entries(all).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return BASE + path + (q ? '?' + q : '');
}
const key = (set: string, field: string, uuid: string) => `${set}(${field}=${uuid})`;

export class ODataError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let csrfToken: string | null = null;
async function fetchToken(): Promise<string> {
  const r = await fetch(url(''), { method: 'GET', headers: { 'X-CSRF-Token': 'Fetch', Accept: ACCEPT }, credentials: 'same-origin' });
  csrfToken = r.headers.get('x-csrf-token') || '';
  return csrfToken;
}

async function errorFrom(r: Response): Promise<ODataError> {
  let msg = `${r.status} ${r.statusText}`;
  try {
    const j = await r.json();
    const e = j.error;
    if (e) msg = [e.message, ...(e.details || []).map((d: { message: string }) => d.message)].filter(Boolean)
      .filter((m: string, i: number, a: string[]) => a.indexOf(m) === i).join('\n');
  } catch { /* not JSON */ }
  if (r.status === 412) msg = 'Someone (or another tab) changed this item in the meantime. It was reloaded – try again.';
  return new ODataError(msg, r.status);
}

async function request<T>(method: string, path: string, opts: { params?: Record<string, string>; body?: unknown; etag?: string } = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: ACCEPT };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken ?? await fetchToken();
    headers['Content-Type'] = ACCEPT;
    if (method !== 'POST' || path.includes(NS)) headers['If-Match'] = opts.etag || '*';
  }
  const r = await fetch(url(path, opts.params), { method, headers, credentials: 'same-origin', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (r.status === 403 && r.headers.get('x-csrf-token')?.toLowerCase() === 'required' && !retried) {
    csrfToken = null;
    return request<T>(method, path, opts, true);
  }
  if (!r.ok) throw await errorFrom(r);
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ---------- mapping between OData JSON and the UI types ---------- */
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const ts = (v: unknown) => (typeof v === 'string' && !v.startsWith('0001') && !v.startsWith('0000') ? v : null);
type Json = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

function child<T>(rows: Json[] | undefined, fix: (r: Json) => T): T[] | undefined {
  return rows ? rows.map(fix) : undefined;
}
function mapWorklog(r: Json): Worklog {
  return { ...r, Hours: num(r.Hours), CreatedAt: ts(r.CreatedAt), etag: r['@odata.etag'],
    _Ticket: r._Ticket ? { ...r._Ticket, EstimateHours: num(r._Ticket.EstimateHours) } : undefined } as Worklog;
}
function mapEvent(r: Json): TicketEvent { return { ...r, EventAt: ts(r.EventAt), etag: r['@odata.etag'] } as TicketEvent }
function mapTicket(r: Json): Ticket {
  return {
    ...r,
    Description: r.Description ?? '',
    EstimateHours: num(r.EstimateHours), LoggedHours: num(r.LoggedHours),
    StatusChangedAt: ts(r.StatusChangedAt), ClosedAt: ts(r.ClosedAt), TimerStartedAt: ts(r.TimerStartedAt),
    CreatedAt: ts(r.CreatedAt), LastChangedAt: ts(r.LastChangedAt), DueDate: r.DueDate || null,
    etag: r['@odata.etag'],
    _Acceptance: child(r._Acceptance, x => ({ ...x, etag: x['@odata.etag'] })),
    _Checklist: child(r._Checklist, x => ({ ...x, etag: x['@odata.etag'] })),
    _Test: child(r._Test, x => ({ ...x, TestedAt: ts(x.TestedAt), etag: x['@odata.etag'] })),
    _Worklog: child(r._Worklog, mapWorklog),
    _Note: child(r._Note, x => ({ ...x, CreatedAt: ts(x.CreatedAt), etag: x['@odata.etag'] })),
    _Event: child(r._Event, mapEvent),
  } as Ticket;
}
/** Decimals go out as strings (IEEE754Compatible=true) */
function toWire(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith('_') || k === 'etag') continue;
    out[k] = (k === 'EstimateHours' || k === 'Hours') && typeof v === 'number' ? String(v) : v;
  }
  return out;
}

export const odataApi: Api = {
  kind: 'sap',
  async user(): Promise<User> {
    try {
      const q = sapClient() ? `?sap-client=${sapClient()}` : '';
      const r = await fetch('/sap/bc/ui2/start_up' + q, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const j = await r.json();
      return { id: j.id, fullName: j.fullName || j.id };
    } catch {
      return { id: '', fullName: '' };
    }
  },
  async listProjects(): Promise<Project[]> {
    const j = await request<{ value: Project[] }>('GET', 'Project', { params: { $filter: 'IsActive eq true', $orderby: 'SortOrder' } });
    return j.value;
  },
  async listValues(): Promise<ValueItem[]> {
    const j = await request<{ value: ValueItem[] }>('GET', 'ValueList', { params: { $filter: 'IsActive eq true', $orderby: 'ListType,SortOrder' } });
    return j.value;
  },
  async listTickets() {
    const j = await request<{ value: Json[] }>('GET', 'Ticket', { params: { $select: TICKET_FIELDS.join(','), $orderby: 'TicketNo desc', $top: '2000' } });
    return j.value.map(mapTicket);
  },
  async changedSince(iso) {
    const j = await request<{ value: Json[] }>('GET', 'Ticket', { params: { $select: TICKET_FIELDS.join(','), $filter: `LastChangedAt gt ${iso}` } });
    return j.value.map(mapTicket);
  },
  async getTicket(uuid) {
    return mapTicket(await request<Json>('GET', key('Ticket', 'TicketUUID', uuid), { params: { $expand: CHILDREN } }));
  },
  async createTicket(t: NewTicket) {
    // deep insert: ticket + acceptance criteria + one test case per criterion
    const body = toWire({
      Title: t.Title, Description: t.Description, Priority: t.Priority, Project: t.Project, Area: t.Area, Tech: t.Tech,
      TicketType: t.TicketType, Environment: t.Environment, Requester: t.Requester, Reference: t.Reference,
      DueDate: t.DueDate || null, EstimateHours: t.EstimateHours,
    });
    body._Acceptance = t.acceptance.map((a, i) => ({ SortOrder: i + 1, Text: a }));
    body._Test = t.acceptance.map((a, i) => ({ SortOrder: i + 1, TestName: a, Expected: a }));
    const created = mapTicket(await request<Json>('POST', 'Ticket', { body }));
    if (t.status !== 'BACKLOG') await this.setStatus(created, t.status);
    return this.getTicket(created.TicketUUID);
  },
  async updateTicket(t, patch) {
    await request('PATCH', key('Ticket', 'TicketUUID', t.TicketUUID), { body: toWire(patch), etag: t.etag });
  },
  async deleteTicket(t) {
    await request('DELETE', key('Ticket', 'TicketUUID', t.TicketUUID), { etag: t.etag });
  },
  async setStatus(t, status: Status) {
    await request('POST', `${key('Ticket', 'TicketUUID', t.TicketUUID)}/${NS}.setStatus`, { body: { Status: status }, etag: t.etag });
  },
  async startTimer(t) {
    await request('POST', `${key('Ticket', 'TicketUUID', t.TicketUUID)}/${NS}.startTimer`, { body: {}, etag: t.etag });
  },
  async stopTimer(t) {
    await request('POST', `${key('Ticket', 'TicketUUID', t.TicketUUID)}/${NS}.stopTimer`, { body: {}, etag: t.etag });
  },
  async createChild(t, nav: ChildNav, data) {
    await request('POST', `${key('Ticket', 'TicketUUID', t.TicketUUID)}/${nav}`, { body: toWire(data) });
  },
  async updateChild(set: ChildSet, item, patch) {
    const k = CHILD_KEY[set];
    await request('PATCH', key(set, k, String(item[k])), { body: toWire(patch), etag: item.etag });
  },
  async deleteChild(set: ChildSet, item) {
    const k = CHILD_KEY[set];
    await request('DELETE', key(set, k, String(item[k])), { etag: item.etag });
  },
  async listEvents(top) {
    const j = await request<{ value: Json[] }>('GET', 'TicketEvent',
      { params: { $orderby: 'EventAt desc', $top: String(top), $expand: '_Ticket($select=TicketUUID,TicketId,Title,Status)' } });
    return j.value.map(mapEvent);
  },
  async listWorklog(from, to) {
    const j = await request<{ value: Json[] }>('GET', 'Worklog', {
      params: { $filter: `WorkDate ge ${from} and WorkDate le ${to}`, $top: '5000',
        $expand: '_Ticket($select=TicketUUID,TicketId,Title,Status,EstimateHours)' },
    });
    return j.value.map(mapWorklog);
  },
};
