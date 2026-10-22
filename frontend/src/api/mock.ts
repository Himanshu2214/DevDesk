// In-browser stand-in for ZUI_DD_O4, used by `npm run dev` until the SAP service is active.
// Behaves like the RAP BO: defaults on create, setStatus writes events, timer rounds to 0.25 h,
// checklist from value list CHECKCAT, TK- numbers. Data is kept in localStorage.
import type { Api, ChildNav, ChildSet, NewTicket, Project, Status, Ticket, TicketEvent, ValueItem, Worklog } from './types';
import { CHILD_KEY } from './types';

const STORE = 'devdesk-mock-v1';
const ME = 'HSUDRA';
const DAY = 864e5;

export const PROJECTS: Project[] = [
  { Project: 'GST', Name: 'GST & e-invoicing', Color: '#4EA7FC', SortOrder: 1, IsActive: true },
  { Project: 'GATE', Name: 'Gate entry app', Color: '#4CB782', SortOrder: 2, IsActive: true },
  { Project: 'PPR', Name: 'Production reporting', Color: '#F2994A', SortOrder: 3, IsActive: true },
  { Project: 'FIN', Name: 'Finance automation', Color: '#F2C94C', SortOrder: 4, IsActive: true },
  { Project: 'CORE', Name: 'Clean core & platform', Color: '#BB87FC', SortOrder: 5, IsActive: true },
];
const v = (ListType: string, Code: string, Text: string, SortOrder: number, Color = '', WipLimit = 0): ValueItem =>
  ({ ListType, Code, Text, SortOrder, Color, WipLimit, IsActive: true });
export const VALUES: ValueItem[] = [
  v('STATUS', 'BACKLOG', 'Backlog', 1, '#8A8F98'), v('STATUS', 'TODO', 'To do', 2, '#4EA7FC'), v('STATUS', 'PROG', 'In progress', 3, '#F0BF00', 4),
  v('STATUS', 'TEST', 'Testing', 4, '#26B5CE', 5), v('STATUS', 'BLOCK', 'Blocked', 5, '#EB5757'), v('STATUS', 'DONE', 'Done', 6, '#4CB782'),
  v('AREA', 'SD', 'Sales and Distribution', 1), v('AREA', 'MM', 'Materials Management', 2), v('AREA', 'FI', 'Finance', 3),
  v('AREA', 'PP', 'Production Planning', 4), v('AREA', 'PS', 'Project System', 5), v('AREA', 'BASIS', 'Basis / technical', 6),
  v('TECH', 'RAP', 'RAP', 1, '#5E6AD2'), v('TECH', 'CDS', 'CDS', 2, '#26B5CE'), v('TECH', 'ABAP', 'ABAP', 3, '#8A8F98'), v('TECH', 'ODATA', 'OData', 4, '#4CB782'),
  v('TECH', 'FIORI', 'Fiori / UI5', 5, '#BB87FC'), v('TECH', 'INTEG', 'Integration', 6, '#F2994A'), v('TECH', 'FORM', 'Form', 7, '#E5A3C0'),
  v('TYPE', 'BUG', 'Bug', 1), v('TYPE', 'CR', 'Change request', 2), v('TYPE', 'NEW', 'New development', 3), v('TYPE', 'SUP', 'Support', 4),
  v('ACTIVITY', 'CODE', 'Coding', 1, '#5E6AD2'), v('ACTIVITY', 'DEBUG', 'Debugging', 2, '#EB5757'), v('ACTIVITY', 'TEST', 'Testing', 3, '#26B5CE'),
  v('ACTIVITY', 'ANA', 'Analysis', 4, '#4CB782'), v('ACTIVITY', 'MEET', 'Meetings', 5, '#F2994A'), v('ACTIVITY', 'DOC', 'Documentation', 6, '#8A8F98'),
  v('CHECKCAT', 'UNIT', 'Unit tests written and green', 1), v('CHECKCAT', 'INTEG', 'Tested end-to-end in QA', 2),
  v('CHECKCAT', 'AUTH', 'Authorization checks verified', 3), v('CHECKCAT', 'ERROR', 'Errors logged and shown to the user', 4),
  v('CHECKCAT', 'PERF', 'Runtime checked with production volume', 5), v('CHECKCAT', 'TRANSPORT', 'All objects in the TR, TR released', 6),
];

interface Db { seq: number; tickets: Ticket[] }
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const delay = <T,>(x: T) => new Promise<T>(r => setTimeout(() => r(clone(x)), 60));
const etag = () => `W/"${Date.now()}${Math.random().toString(36).slice(2, 6)}"`;

/* ---------- sample data ---------- */
const TPL: [string, string, string, string, string, string[]][] = [
  ['GST', 'SD', 'ABAP', 'CR', 'Sales register: add GST split columns', ['CGST, SGST and IGST in separate columns', 'Totals match the billing documents']],
  ['GST', 'SD', 'INTEG', 'BUG', 'E-invoice cockpit: retry failed IRN generation', ['Failed requests can be retried', 'Each retry is logged']],
  ['GST', 'SD', 'INTEG', 'CR', 'IRP API: timeout handling and retry with backoff', ['Timeout 60 s', 'Up to 3 retries with backoff']],
  ['GST', 'SD', 'FORM', 'CR', 'Tax invoice form: print IRN QR code', ['QR code printed for invoices with an IRN']],
  ['GATE', 'MM', 'RAP', 'NEW', 'Gate entry: multiple POs per vehicle', ['One gate entry holds items of several POs', 'Quantity check per PO item']],
  ['GATE', 'MM', 'RAP', 'CR', 'Gate entry: approval with four-eyes check', ['Creator cannot approve', 'Approval is logged']],
  ['GATE', 'MM', 'FIORI', 'BUG', 'Gate entry app: unclear vehicle number message', ['Message names the expected format']],
  ['GATE', 'MM', 'ODATA', 'BUG', 'Gate entry OData: $expand to items is slow', ['List with items loads in under 2 s']],
  ['PPR', 'PP', 'ABAP', 'CR', 'MRP link report: performance on large plants', ['Runtime under 60 s for plant 1000']],
  ['PPR', 'PP', 'CDS', 'NEW', 'Production dashboard: scheduled vs actual', ['Scheduled and actual quantity per order']],
  ['PPR', 'PP', 'ODATA', 'CR', 'Dashboard service: add plant filter', ['Filter by plant with value help']],
  ['FIN', 'FI', 'ABAP', 'BUG', 'Vendor auto-mail fails for blocked vendors', ['Blocked vendors are skipped and listed in the log']],
  ['FIN', 'FI', 'ABAP', 'CR', 'Pending tax invoice reminder: CC to manager', ['Manager in CC from the org assignment']],
  ['FIN', 'FI', 'FORM', 'CR', 'Statement of account: add opening balance', ['Opening balance on the first page']],
  ['CORE', 'BASIS', 'ABAP', 'CR', 'Application log helper: add context fields', ['Ticket number and object in every log entry']],
  ['CORE', 'BASIS', 'ABAP', 'SUP', 'ATC findings on custom code: triage', ['Priority 1 findings assigned to tickets']],
];
const REQ: Record<string, string> = { SD: 'Sales Ops', MM: 'Purchasing', FI: 'Finance', PP: 'Production planning', BASIS: 'IT', PS: 'Projects' };

function seed(): Db {
  let s = 20261022;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tickets: Ticket[] = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const [project, area, tech, type, title, acc] = TPL[i % TPL.length];
    const created = new Date(today.getTime() - (90 - i * 2.7) * DAY + 10 * 36e5);
    const path: Status[] = ['BACKLOG', 'TODO', 'PROG', 'TEST', 'DONE'];
    if (i % 7 === 3) path.splice(3, 0, 'BLOCK', 'PROG');
    const events: TicketEvent[] = [];
    const worklog: Worklog[] = [];
    const t = mkTicket({
      Title: title + (i >= TPL.length ? ' – follow-up' : ''), Project: project, Area: area, Tech: tech, TicketType: type,
      Priority: String(1 + Math.floor(rnd() * 4)), Requester: REQ[area], Description: `Requested by ${REQ[area]}.`,
      EstimateHours: 2 + Math.round(rnd() * 12), DueDate: isoDate(new Date(created.getTime() + (8 + rnd() * 26) * DAY)),
    }, i + 1001, created);
    let at = created.getTime(), status: Status = 'BACKLOG';
    for (const st of path.slice(1)) {
      at += (1 + rnd() * 7) * DAY;
      if (at > Date.now()) break;
      events.push(mkEvent(t.TicketUUID, status, st, new Date(at)));
      if (st === 'TEST' || st === 'DONE' || st === 'BLOCK') {
        for (let d = 0; d < 3; d++) {
          const wd = new Date(at - d * DAY);
          if (wd.getDay() === 0 || wd.getDay() === 6 || rnd() < .4) continue;
          worklog.push(mkWorklog(t.TicketUUID, isoDate(wd), Math.round((0.5 + rnd() * 2.5) * 4) / 4, st === 'TEST' ? 'TEST' : rnd() < .35 ? 'DEBUG' : 'CODE', ''));
        }
      }
      status = st;
    }
    // recent days for open work, so the week views have data
    if (status === 'PROG' || status === 'TEST') {
      for (let d = 0; d < 6; d++) {
        const wd = new Date(today.getTime() - d * DAY);
        if (wd.getDay() === 0 || wd.getDay() === 6 || rnd() < .45) continue;
        worklog.push(mkWorklog(t.TicketUUID, isoDate(wd), Math.round((0.5 + rnd() * 2) * 4) / 4, status === 'TEST' ? 'TEST' : 'CODE', ''));
      }
    }
    t.Status = status;
    t.StatusChangedAt = events.at(-1)?.EventAt ?? t.CreatedAt;
    t.ClosedAt = status === 'DONE' ? t.StatusChangedAt : null;
    t._Event = events;
    t._Worklog = worklog;
    t._Acceptance = acc.map((a, k) => ({ AccUUID: uuid(), TicketUUID: t.TicketUUID, SortOrder: k + 1, Text: a, etag: etag() }));
    t._Test = acc.map((a, k) => ({ TestUUID: uuid(), TicketUUID: t.TicketUUID, SortOrder: k + 1, TestName: a, TestSteps: '', Expected: a, Actual: status === 'DONE' ? a : '',
      TestResult: status === 'DONE' ? 'PASS' : 'OPEN', TestedAt: null, TestedBy: '', etag: etag() }));
    t._Checklist = checklist(t.TicketUUID).map((c, k) => ({ ...c, IsDone: status === 'DONE' || (status === 'TEST' && k < 2) }));
    if (status === 'PROG' && i % 3 === 0) t._Note = [{ NoteUUID: uuid(), TicketUUID: t.TicketUUID, Text: 'Checked in DEV with test data; waiting for feedback on the layout.', CreatedBy: ME, CreatedAt: t.StatusChangedAt, etag: etag() }];
    tickets.push(t);
  }
  return { seq: 1001 + N, tickets };
}

function mkTicket(p: Partial<Ticket>, no: number, created = new Date()): Ticket {
  const id = uuid();
  return {
    TicketUUID: id, TicketNo: String(no).padStart(8, '0'), TicketId: 'TK-' + no, Title: '', Description: '', Status: 'BACKLOG', Priority: '3',
    Project: 'CORE', ProjectName: '', Area: 'BASIS', Tech: 'ABAP', TicketType: 'CR', Environment: 'DEV', Assignee: ME, Requester: '', Reference: '',
    DueDate: isoDate(new Date(Date.now() + 7 * DAY)), EstimateHours: 0, LoggedHours: 0, StatusChangedAt: created.toISOString(), ClosedAt: null,
    TimerStartedAt: null, IsOverdue: false, CreatedBy: ME, CreatedAt: created.toISOString(), LastChangedAt: created.toISOString(), etag: etag(),
    _Acceptance: [], _Test: [], _Checklist: [], _Worklog: [], _Note: [], _Event: [], ...p,
  };
}
const mkEvent = (TicketUUID: string, from: string, to: string, at: Date): TicketEvent =>
  ({ EventUUID: uuid(), TicketUUID, EventKind: 'STAT', StatusFrom: from, StatusTo: to, Text: '', EventAt: at.toISOString(), EventBy: ME, IsRead: Date.now() - at.getTime() > 3 * DAY, etag: etag() });
const mkWorklog = (TicketUUID: string, WorkDate: string, Hours: number, Activity: string, CommentText: string, EntrySource = 'MANUAL'): Worklog =>
  ({ WorklogUUID: uuid(), TicketUUID, WorkDate, Hours, Activity, CommentText, EntrySource, CreatedBy: ME, CreatedAt: nowIso(), etag: etag() });
const checklist = (TicketUUID: string) => VALUES.filter(x => x.ListType === 'CHECKCAT')
  .map(x => ({ ItemUUID: uuid(), TicketUUID, SortOrder: x.SortOrder, Category: x.Code, Text: x.Text, IsDone: false, etag: etag() }));

/* ---------- persistence ---------- */
let db: Db = load();
function load(): Db {
  try { const s = localStorage.getItem(STORE); if (s) return JSON.parse(s) } catch { /* private mode */ }
  return seed();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(db)) } catch { /* ignore */ } }
export function resetMock() { db = seed(); save() }

/** Derived fields that CDS calculates on the server */
function derive(t: Ticket): Ticket {
  const today = isoDate(new Date());
  return { ...t, ProjectName: PROJECTS.find(p => p.Project === t.Project)?.Name ?? t.Project,
    LoggedHours: (t._Worklog ?? []).reduce((s, w) => s + w.Hours, 0),
    IsOverdue: t.Status !== 'DONE' && !!t.DueDate && t.DueDate < today };
}
function find(uuid: string): Ticket {
  const t = db.tickets.find(x => x.TicketUUID === uuid);
  if (!t) throw new Error('Ticket not found');
  return t;
}
function checkEtag(item: { etag?: string }, sent?: string) {
  if (sent && sent !== '*' && item.etag !== sent) throw Object.assign(new Error('Someone (or another tab) changed this item in the meantime. It was reloaded – try again.'), { status: 412 });
}
function touch(t: Ticket) { t.LastChangedAt = nowIso(); t.etag = etag(); save() }
const head = (t: Ticket): Ticket => { const d = derive(t); return { ...d, _Acceptance: undefined, _Test: undefined, _Checklist: undefined, _Worklog: undefined, _Note: undefined, _Event: undefined } };
function validate(t: Partial<Ticket>) {
  if (!t.Title?.trim()) throw new Error('Enter a title');
  if (t.Priority && !['1', '2', '3', '4'].includes(t.Priority)) throw new Error('Priority must be 1 (Urgent) to 4 (Low)');
  if (t.Project && !PROJECTS.some(p => p.Project === t.Project)) throw new Error(`Project "${t.Project}" is not maintained in ZDD_PROJECT`);
  if (t.EstimateHours !== undefined && t.EstimateHours < 0) throw new Error('The estimate cannot be negative');
}
const setTarget: Record<ChildSet, keyof Ticket> = { Acceptance: '_Acceptance', TestCase: '_Test', ChecklistItem: '_Checklist', Worklog: '_Worklog', Note: '_Note', TicketEvent: '_Event' };
function findChild(set: ChildSet, id: string): { t: Ticket; list: Record<string, unknown>[]; item: Record<string, unknown> } {
  const k = CHILD_KEY[set];
  for (const t of db.tickets) {
    const list = (t[setTarget[set]] as unknown as Record<string, unknown>[]) ?? [];
    const item = list.find(x => x[k] === id);
    if (item) return { t, list, item };
  }
  throw new Error('Item not found');
}

export const mockApi: Api = {
  kind: 'mock',
  user: () => delay({ id: ME, fullName: 'Himanshu Sudra' }),
  listProjects: () => delay(PROJECTS),
  listValues: () => delay(VALUES),
  listTickets: () => delay(db.tickets.map(head).sort((a, b) => b.TicketNo.localeCompare(a.TicketNo))),
  changedSince: iso => delay(db.tickets.filter(t => (t.LastChangedAt ?? '') > iso).map(head)),
  getTicket: uuid => delay(derive(find(uuid))),
  async createTicket(n: NewTicket) {
    validate(n);
    const t = mkTicket({ Title: n.Title, Description: n.Description, Priority: n.Priority, Project: n.Project, Area: n.Area, Tech: n.Tech,
      TicketType: n.TicketType, Environment: n.Environment, Requester: n.Requester, Reference: n.Reference, DueDate: n.DueDate || null,
      EstimateHours: n.EstimateHours }, db.seq++);
    t._Acceptance = n.acceptance.map((a, i) => ({ AccUUID: uuid(), TicketUUID: t.TicketUUID, SortOrder: i + 1, Text: a, etag: etag() }));
    t._Test = n.acceptance.map((a, i) => ({ TestUUID: uuid(), TicketUUID: t.TicketUUID, SortOrder: i + 1, TestName: a, TestSteps: '', Expected: a, Actual: '', TestResult: 'OPEN', TestedAt: null, TestedBy: '', etag: etag() }));
    t._Checklist = checklist(t.TicketUUID);
    db.tickets.push(t); save();
    if (n.status !== 'BACKLOG') await this.setStatus(t, n.status);
    return delay(derive(find(t.TicketUUID)));
  },
  async updateTicket(x, patch) {
    const t = find(x.TicketUUID); checkEtag(t, x.etag);
    const next = { ...t, ...patch } as Ticket; validate(next);
    for (const k of Object.keys(patch) as (keyof Ticket)[]) if (!k.startsWith('_')) (t as unknown as Record<string, unknown>)[k] = patch[k];
    touch(t); await delay(0);
  },
  async deleteTicket(x) { checkEtag(find(x.TicketUUID), x.etag); db.tickets = db.tickets.filter(t => t.TicketUUID !== x.TicketUUID); save(); await delay(0) },
  async setStatus(x, status) {
    const t = find(x.TicketUUID); checkEtag(t, x.etag);
    if (t.Status === status) return;
    const at = new Date();
    t._Event = [...(t._Event ?? []), { ...mkEvent(t.TicketUUID, t.Status, status, at), IsRead: true }];
    t.Status = status; t.StatusChangedAt = at.toISOString(); t.ClosedAt = status === 'DONE' ? at.toISOString() : null;
    touch(t); await delay(0);
  },
  async startTimer(x) { const t = find(x.TicketUUID); checkEtag(t, x.etag); if (!t.TimerStartedAt) { t.TimerStartedAt = nowIso(); touch(t) } await delay(0) },
  async stopTimer(x) {
    const t = find(x.TicketUUID); checkEtag(t, x.etag);
    if (t.TimerStartedAt) {
      const sec = (Date.now() - Date.parse(t.TimerStartedAt)) / 1e3;
      const quarters = Math.max(1, Math.min(96, Math.round(sec / 900)));
      const act = t.Status === 'TEST' ? 'TEST' : t.Status === 'TODO' ? 'ANA' : 'CODE';
      t._Worklog = [...(t._Worklog ?? []), mkWorklog(t.TicketUUID, isoDate(new Date()), quarters / 4, act, 'Timer', 'TIMER')];
      t.TimerStartedAt = null; touch(t);
    }
    await delay(0);
  },
  async createChild(x, nav: ChildNav, data) {
    const t = find(x.TicketUUID);
    const list = (t[nav] as unknown as Record<string, unknown>[]) ?? [];
    const base: Record<string, unknown> = { TicketUUID: t.TicketUUID, etag: etag() };
    if (nav === '_Worklog') {
      const h = Number(data.Hours);
      if (!(h > 0 && h <= 24)) throw new Error('Hours must be more than 0 and at most 24');
      if (String(data.WorkDate) > isoDate(new Date())) throw new Error('Time cannot be logged for a future date');
      Object.assign(base, mkWorklog(t.TicketUUID, String(data.WorkDate || isoDate(new Date())), h, String(data.Activity || 'CODE'), String(data.CommentText || '')));
    } else {
      const k = { _Acceptance: 'AccUUID', _Test: 'TestUUID', _Checklist: 'ItemUUID', _Note: 'NoteUUID' }[nav as '_Note'];
      Object.assign(base, { [k]: uuid(), ...(nav === '_Note' ? { CreatedBy: ME, CreatedAt: nowIso() } : {}), ...(nav === '_Test' ? { TestResult: 'OPEN', TestSteps: '', Actual: '', TestedAt: null, TestedBy: '' } : {}), ...(nav === '_Checklist' ? { IsDone: false } : {}) }, data);
    }
    (t as unknown as Record<string, unknown>)[nav] = [...list, base];
    touch(t); await delay(0);
  },
  async updateChild(set, x, patch) {
    const k = CHILD_KEY[set];
    const { t, item } = findChild(set, String(x[k]));
    checkEtag(item as { etag?: string }, x.etag);
    Object.assign(item, patch, { etag: etag() });
    if (set === 'TestCase' && 'TestResult' in patch) Object.assign(item, patch.TestResult === 'OPEN' ? { TestedAt: null, TestedBy: '' } : { TestedAt: nowIso(), TestedBy: ME });
    touch(t); await delay(0);
  },
  async deleteChild(set, x) {
    const k = CHILD_KEY[set];
    const { t } = findChild(set, String(x[k]));
    (t as unknown as Record<string, unknown>)[setTarget[set]] = ((t[setTarget[set]] as unknown as Record<string, unknown>[]) ?? []).filter(i => i[k] !== x[k]);
    touch(t); await delay(0);
  },
  listEvents: top => delay(db.tickets.flatMap(t => (t._Event ?? []).map(e => ({ ...e, _Ticket: { TicketUUID: t.TicketUUID, TicketId: t.TicketId, Title: t.Title, Status: t.Status } })))
    .sort((a, b) => (b.EventAt ?? '').localeCompare(a.EventAt ?? '')).slice(0, top)),
  listWorklog: (from, to) => delay(db.tickets.flatMap(t => (t._Worklog ?? []).filter(w => w.WorkDate >= from && w.WorkDate <= to)
    .map(w => ({ ...w, _Ticket: { TicketUUID: t.TicketUUID, TicketId: t.TicketId, Title: t.Title, Status: t.Status, EstimateHours: t.EstimateHours } })))),
};
