// In-browser stand-in for ZUI_DD_O4, used by `npm run dev` until the SAP service is active.
// Behaves like the RAP BO: defaults on create, setStatus writes events, timer rounds to 0.25 h,
// checklist from value list CHECKCAT, TK- numbers. Data is kept in localStorage.
import type { Api, Article, ChildNav, ChildSet, NewTicket, Phase, Project, RootSet, Status, SubSet, TechObject, Ticket, TicketEvent, Transport, ValueItem, Worklog } from './types';
import { CHILD_KEY, ROOT_KEY, SUB_KEY, SUB_NAV } from './types';

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
  v('OBJTYPE', 'TABL', 'Table', 1, '#4EA7FC'), v('OBJTYPE', 'DDLS', 'CDS view', 2, '#26B5CE'), v('OBJTYPE', 'BDEF', 'Behavior definition', 3, '#5E6AD2'),
  v('OBJTYPE', 'CLAS', 'Class', 4, '#F0BF00'), v('OBJTYPE', 'PROG', 'Report', 5, '#8A8F98'), v('OBJTYPE', 'FUGR', 'Function group', 6, '#8A8F98'),
  v('OBJTYPE', 'TRAN', 'Transaction', 7, '#8A8F98'), v('OBJTYPE', 'SRVD', 'Service definition', 8, '#4CB782'), v('OBJTYPE', 'SRVB', 'Service binding', 9, '#4CB782'),
  v('OBJTYPE', 'SSFO', 'Smart Form / Adobe form', 10, '#E5A3C0'), v('OBJTYPE', 'FIORI', 'Fiori app', 11, '#BB87FC'), v('OBJTYPE', 'DEST', 'Destination (SM59)', 12, '#F2994A'),
  v('OBJTYPE', 'API', 'External API', 13, '#EB5757'),
  v('KBTYPE', 'SNIP', 'Snippet', 1), v('KBTYPE', 'FIX', 'Error & fix', 2), v('KBTYPE', 'API', 'API example', 3), v('KBTYPE', 'CONF', 'Config note', 4), v('KBTYPE', 'DECI', 'Design decision', 5),
  v('DEPKIND', 'USES', 'uses', 1), v('DEPKIND', 'EXPOSES', 'exposes', 2), v('DEPKIND', 'CALLS', 'calls', 3),
];

interface Db { seq: number; tickets: Ticket[]; kbSeq: number; transports: Transport[]; objects: TechObject[]; articles: Article[] }
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
  return { seq: 1001 + N, tickets, ...seedPhase2(tickets) };
}

/* ---------- phase 2 sample data: objects with dependencies, transports, articles ---------- */
const OBJ: [string, string, string, string, string][] = [   // project, type, name, description, package
  ['GST', 'PROG', 'ZSD_SALES_REGISTER', 'Sales register with GST split', 'ZSD_GST'], ['GST', 'TABL', 'ZEINV_LOG', 'E-invoice request log', 'ZSD_GST'],
  ['GST', 'CLAS', 'ZCL_EINV_IRP_CLIENT', 'IRP API client with retry', 'ZSD_GST'], ['GST', 'DEST', 'IRP_GSP', 'HTTP destination to the GSP', ''],
  ['GST', 'API', 'IRP e-invoice API', 'Government IRP (generate / cancel IRN)', ''], ['GST', 'SSFO', 'ZSD_TAX_INVOICE', 'Tax invoice form with QR code', 'ZSD_GST'],
  ['GATE', 'TABL', 'ZMM_GATE_HDR', 'Gate entry header', 'ZMM_GATE'], ['GATE', 'TABL', 'ZMM_GATE_ITM', 'Gate entry items (PO lines)', 'ZMM_GATE'],
  ['GATE', 'DDLS', 'ZR_MM_GATEENTRY', 'Gate entry BO root view', 'ZMM_GATE'], ['GATE', 'BDEF', 'ZR_MM_GATEENTRY', 'Gate entry behavior', 'ZMM_GATE'],
  ['GATE', 'CLAS', 'ZBP_R_MM_GATEENTRY', 'Gate entry behavior pool', 'ZMM_GATE'], ['GATE', 'SRVB', 'ZUI_MM_GATE_O4', 'Gate entry OData V4 binding', 'ZMM_GATE'],
  ['GATE', 'FIORI', 'zmm.gateentry', 'Gate entry app', ''], ['PPR', 'PROG', 'ZPP_MRP_LINK', 'MRP link report', 'ZPP_REP'],
  ['PPR', 'DDLS', 'ZI_PP_PRODDASHBOARD', 'Scheduled vs actual per order', 'ZPP_REP'], ['FIN', 'PROG', 'ZFI_VENDOR_MAIL', 'Vendor auto-mail', 'ZFI_AUTO'],
  ['CORE', 'CLAS', 'ZCL_CA_APPLOG', 'Application log helper', 'ZCA_TOOLS'],
];
// [dependent, used]
const DEPS: [number, number][] = [[0, 1], [2, 1], [2, 3], [3, 4], [5, 1], [8, 6], [8, 7], [9, 8], [10, 9], [11, 9], [12, 11], [14, 13], [2, 16], [15, 16], [10, 16]];

function seedPhase2(tickets: Ticket[]): Pick<Db, 'kbSeq' | 'transports' | 'objects' | 'articles'> {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
  const objects: TechObject[] = OBJ.map(([Project, ObjectType, ObjectName, Description, PackageName], i) => ({ ObjectUUID: uuid(), ObjectType, ObjectName, Description, PackageName,
    Project, Notes: '', CreatedBy: ME, CreatedAt: at(80 - i), LastChangedAt: at(80 - i), etag: etag(), _Dependency: [] }));
  for (const [from, to] of DEPS) objects[from]._Dependency.push({ DepUUID: uuid(), ObjectUUID: objects[from].ObjectUUID, UsesObjectUUID: objects[to].ObjectUUID, DepKind: 'USES', NoteText: '', etag: etag() });
  // every ticket changes one or two objects of its project
  for (const t of tickets) {
    const mine = objects.filter(o => o.Project === t.Project);
    const pick = mine.length ? [mine[Number(t.TicketNo) % mine.length], mine[(Number(t.TicketNo) + 2) % mine.length]] : [];
    t._ObjectLink = [...new Set(pick)].map((o, k) => ({ LinkUUID: uuid(), TicketUUID: t.TicketUUID, ObjectUUID: o.ObjectUUID, ChangeKind: k ? 'CHECK' : 'CHANGE', NoteText: '', etag: etag() }));
    t._Attachment = t._Attachment ?? [];
  }
  // one transport per ticket in progress, testing or done; some with warnings, one failed in QA
  let nr = 900101;
  const transports: Transport[] = tickets.filter(t => t.Status === 'TEST' || t.Status === 'DONE' || t.Status === 'PROG').map((t, i) => {
    const days = Math.max(1, (Date.now() - Date.parse(t.StatusChangedAt ?? t.CreatedAt ?? '')) / DAY);
    const tr: Transport = { TransportUUID: uuid(), TrKorr: 'S4DK' + nr++, TicketUUID: t.TicketUUID, TrText: `${t.TicketId} ${t.Title}`.slice(0, 60), TrKind: 'K', TrOwner: ME,
      ReleasedOn: null, QaRc: 0, QaImportedAt: null, PrdRc: 0, PrdImportedAt: null, Phase: 'DEV', TestEvidence: '', DeployNotes: '', RollbackNotes: '',
      CreatedBy: ME, CreatedAt: at(days + 3), LastChangedAt: at(days), etag: etag(), _Dependency: [] };
    if (t.Status !== 'PROG') { tr.ReleasedOn = at(days + 1).slice(0, 10); tr.QaImportedAt = at(days + 1); tr.QaRc = i % 5 === 2 ? 4 : 0 }
    if (t.Status === 'TEST' && i % 4 === 1) tr.QaRc = 8;
    if (t.Status === 'DONE') { tr.PrdImportedAt = at(Math.max(0.5, days - 0.5)); tr.TestEvidence = 'Tested in QA with the requester; screenshots in the ticket.' }
    tr.Phase = phaseOf(tr);
    return tr;
  });
  if (transports.length > 3) transports[3]._Dependency.push({ DepUUID: uuid(), TransportUUID: transports[3].TransportUUID, DependsOn: transports[1].TrKorr, NoteText: 'same table', etag: etag() });
  const objOf = (name: string) => objects.find(o => o.ObjectName === name)!.ObjectUUID;
  const art = (no: number, p: Partial<Article>, objNames: string[], daysAgo: number): Article => {
    const ArticleUUID = uuid();
    return { ArticleUUID, ArticleNo: String(no).padStart(8, '0'), ArticleId: 'KB-' + no, ArticleType: 'SNIP', Title: '', Tags: '', ErrorText: '', RootCause: '', FixLocation: '', FixText: '', TestNote: '',
      CodeText: '', CodeLang: '', NoteText: '', HttpMethod: '', Endpoint: '', RequestBody: '', ResponseBody: '', ResponseCodes: '', AuthReference: '', StepsText: '', ContextText: '',
      DecisionText: '', Consequences: '', CreatedBy: ME, CreatedAt: at(daysAgo), LastChangedAt: at(daysAgo), etag: etag(), ...p,
      _Link: objNames.map(n => ({ LinkUUID: uuid(), ArticleUUID, TicketUUID: null, ObjectUUID: objOf(n), etag: etag() })) };
  };
  const articles: Article[] = [
    art(1, { ArticleType: 'FIX', Title: 'RAP dump CX_RAP_HANDLER_NOT_IMPLEMENTED on a child action', Tags: 'rap,dump',
      ErrorText: 'Short dump CX_RAP_HANDLER_NOT_IMPLEMENTED when the UI calls an action on a child entity.', RootCause: 'The action was declared on the child, but the handler class only implemented the root.',
      FixLocation: 'ZBP_R_MM_GATEENTRY, local handler for the item', FixText: 'Moved the action to the root entity and passed the item key as a parameter.', TestNote: 'Action works from the list and the object page.' }, ['ZBP_R_MM_GATEENTRY'], 40),
    art(2, { ArticleType: 'SNIP', Title: 'Application log with context fields', Tags: 'abap,log', CodeLang: 'ABAP',
      CodeText: "DATA(lo_log) = zcl_ca_applog=>create( object = 'ZDD' subobject = 'TICKET' ).\nlo_log->add_text( |Ticket { lv_ticket }: { lv_text }| ).\nlo_log->save( ).",
      NoteText: 'Always pass the ticket number so the log can be found from SLATE·SPACE.' }, ['ZCL_CA_APPLOG'], 30),
    art(3, { ArticleType: 'API', Title: 'IRP: generate IRN', Tags: 'gst,einvoice,api', HttpMethod: 'POST', Endpoint: '/eicore/v1.03/Invoice',
      RequestBody: '{\n  "Version": "1.1",\n  "TranDtls": { "TaxSch": "GST", "SupTyp": "B2B" }\n}', ResponseBody: '{ "Irn": "...", "AckNo": 112010000001, "Status": "ACT" }',
      ResponseCodes: '200 ok, 2150 duplicate IRN, 5002 timeout', AuthReference: 'Token from destination IRP_GSP (no credentials here)' }, ['IRP e-invoice API', 'ZCL_EINV_IRP_CLIENT'], 22),
    art(4, { ArticleType: 'CONF', Title: 'Publish an OData V4 service group', Tags: 'odata,basis',
      StepsText: '/IWFND/V4_ADMIN\nPublish Service Groups\nSystem alias LOCAL, Get Service Groups\nSelect the group and publish' }, ['ZUI_MM_GATE_O4'], 15),
    art(5, { ArticleType: 'DECI', Title: 'Gate entry: no draft', Tags: 'rap,design', ContextText: 'Security staff create entries on a tablet in one step.',
      DecisionText: 'Managed BO without draft; every change is saved at once.', Consequences: 'Validations must give clear messages because there is no draft to fix later.' }, ['ZR_MM_GATEENTRY'], 8),
  ];
  return { kbSeq: 6, transports, objects, articles };
}
/** Tracker column, as ZR_DD_Transport calculates it */
function phaseOf(t: Pick<Transport, 'PrdImportedAt' | 'PrdRc' | 'QaImportedAt' | 'QaRc'>): Phase {
  return t.PrdImportedAt ? (t.PrdRc > 4 ? 'FAILED' : 'PRD') : t.QaImportedAt ? (t.QaRc > 4 ? 'FAILED' : 'QA') : 'DEV';
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
  try {
    const s = localStorage.getItem(STORE);
    if (s) {
      const d = JSON.parse(s) as Db;
      if (!d.objects) Object.assign(d, seedPhase2(d.tickets));   // data saved before phase 2
      return d;
    }
  } catch { /* private mode */ }
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
const head = (t: Ticket): Ticket => { const d = derive(t); return { ...d, _Acceptance: undefined, _Test: undefined, _Checklist: undefined, _Worklog: undefined, _Note: undefined, _Event: undefined, _Attachment: undefined, _ObjectLink: undefined } };
/** like the SAP read: attachments without their content */
const detail = (t: Ticket): Ticket => { const d = derive(t); return { ...d, _Attachment: (d._Attachment ?? []).map(a => ({ ...a, Content: undefined })) } };
function validate(t: Partial<Ticket>) {
  if (!t.Title?.trim()) throw new Error('Enter a title');
  if (t.Priority && !['1', '2', '3', '4'].includes(t.Priority)) throw new Error('Priority must be 1 (Urgent) to 4 (Low)');
  if (t.Project && !PROJECTS.some(p => p.Project === t.Project)) throw new Error(`Project "${t.Project}" is not maintained in ZDD_PROJECT`);
  if (t.EstimateHours !== undefined && t.EstimateHours < 0) throw new Error('The estimate cannot be negative');
}
const setTarget: Record<ChildSet, keyof Ticket> = { Acceptance: '_Acceptance', TestCase: '_Test', ChecklistItem: '_Checklist', Worklog: '_Worklog', Note: '_Note', TicketEvent: '_Event',
  Attachment: '_Attachment', ObjectLink: '_ObjectLink' };
const roots = (set: RootSet) => (set === 'Transport' ? db.transports : set === 'TechObject' ? db.objects : db.articles) as unknown as Record<string, unknown>[];
function findRoot(set: RootSet, id: string): Record<string, unknown> & { etag?: string } {
  const r = roots(set).find(x => x[ROOT_KEY[set]] === id);
  if (!r) throw new Error('Not found - it may have been deleted');
  return r;
}
const TRKORR = /^[A-Z0-9]{3}[KT][0-9]{6}$/;
/** what the BO validations check on save */
function validateRoot(set: RootSet, r: Record<string, unknown>) {
  if (set === 'Transport') {
    if (!TRKORR.test(String(r.TrKorr))) throw new Error(`"${r.TrKorr}" is not a transport request (e.g. S4DK900123)`);
    if (db.transports.some(t => t.TrKorr === r.TrKorr && t.TransportUUID !== r.TransportUUID)) throw new Error(`${r.TrKorr} is already in the tracker`);
  }
  if (set === 'TechObject') {
    if (!String(r.ObjectName ?? '').trim()) throw new Error('Enter the object name');
    if (db.objects.some(o => o.ObjectType === r.ObjectType && o.ObjectName === r.ObjectName && o.ObjectUUID !== r.ObjectUUID)) throw new Error(`${r.ObjectType} ${r.ObjectName} is already registered`);
  }
  if (set === 'Article' && !String(r.Title ?? '').trim()) throw new Error('Enter a title');
}
/** what the BO determinations do */
function normalize(set: RootSet, r: Record<string, unknown>) {
  if (set === 'Transport') { r.TrKorr = String(r.TrKorr ?? '').trim().toUpperCase(); r.Phase = phaseOf(r as unknown as Transport) }
  if (set === 'TechObject') {
    const keepCase = ['FIORI', 'DEST', 'API'].includes(String(r.ObjectType));
    r.ObjectName = keepCase ? String(r.ObjectName ?? '').trim() : String(r.ObjectName ?? '').trim().toUpperCase();
    r.PackageName = String(r.PackageName ?? '').trim().toUpperCase();
  }
}
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
  getTicket: uuid => delay(detail(find(uuid))),
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
    return delay(detail(find(t.TicketUUID)));
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
    } else if (nav === '_Attachment') {
      const size = Math.floor(String(data.Content ?? '').replace(/=+$/, '').length * 3 / 4);
      if (!size) throw new Error('The file must not be empty and at most 10 MB');
      if (size > 1.5e6) throw new Error('The browser mock keeps files up to 1.5 MB (SAP: 10 MB)');
      Object.assign(base, { AttUUID: uuid(), FileName: data.FileName, MimeType: data.MimeType || 'application/octet-stream', FileSize: size, Content: data.Content, CreatedBy: ME, CreatedAt: nowIso() });
    } else if (nav === '_ObjectLink') {
      if (!db.objects.some(o => o.ObjectUUID === data.ObjectUUID)) throw new Error('The object is not in the object registry');
      if ((t._ObjectLink ?? []).some(l => l.ObjectUUID === data.ObjectUUID)) throw new Error('The object is already linked to this ticket');
      Object.assign(base, { LinkUUID: uuid(), ChangeKind: 'CHANGE', NoteText: '' }, data);
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
  async downloadAttachment(a) {
    const { item } = findChild('Attachment', a.AttUUID);
    const bin = atob(String(item.Content ?? ''));
    return new Blob([Uint8Array.from(bin, c => c.charCodeAt(0))], { type: String(item.MimeType) });
  },
  listObjectLinks: () => delay(db.tickets.flatMap(t => t._ObjectLink ?? [])),

  listTransports: () => delay(db.transports.map(t => ({ ...t, Phase: phaseOf(t) }))),
  listObjects: () => delay(db.objects),
  listArticles: () => delay(db.articles),
  async createRoot(set, data) {
    const id = uuid(), now = nowIso();
    const base: Record<string, unknown> = { [ROOT_KEY[set]]: id, CreatedBy: ME, CreatedAt: now, LastChangedAt: now, etag: etag(), [SUB_NAV[set]]: [] };
    if (set === 'Transport') Object.assign(base, { TicketUUID: null, TrText: '', TrKind: 'K', TrOwner: ME, ReleasedOn: null, QaRc: 0, QaImportedAt: null, PrdRc: 0, PrdImportedAt: null,
      TestEvidence: '', DeployNotes: '', RollbackNotes: '' });
    if (set === 'TechObject') Object.assign(base, { Description: '', PackageName: '', Project: '', Notes: '' });
    if (set === 'Article') {
      const no = db.kbSeq++;
      Object.assign(base, { ArticleNo: String(no).padStart(8, '0'), ArticleId: 'KB-' + no, Tags: '', ErrorText: '', RootCause: '', FixLocation: '', FixText: '', TestNote: '', CodeText: '', CodeLang: '',
        NoteText: '', HttpMethod: '', Endpoint: '', RequestBody: '', ResponseBody: '', ResponseCodes: '', AuthReference: '', StepsText: '', ContextText: '', DecisionText: '', Consequences: '' });
    }
    Object.assign(base, data);
    normalize(set, base); validateRoot(set, base);
    roots(set).unshift(base); save();
    return delay(id);
  },
  async updateRoot(set, x, patch) {
    const r = findRoot(set, String(x[ROOT_KEY[set]])); checkEtag(r, x.etag);
    const next = { ...r, ...patch }; normalize(set, next); validateRoot(set, next);
    Object.assign(r, next, { LastChangedAt: nowIso(), etag: etag() }); save(); await delay(0);
  },
  async deleteRoot(set, x) {
    const r = findRoot(set, String(x[ROOT_KEY[set]])); checkEtag(r, x.etag);
    const list = roots(set); list.splice(list.indexOf(r), 1); save(); await delay(0);
  },
  async createSub(set, x, data) {
    const r = findRoot(set, String(x[ROOT_KEY[set]]));
    const list = r[SUB_NAV[set]] as Record<string, unknown>[];
    if (set === 'Transport') {
      const dep = String(data.DependsOn ?? '').trim().toUpperCase();
      if (!TRKORR.test(dep)) throw new Error(`"${dep}" is not a transport request`);
      if (dep === r.TrKorr) throw new Error('A transport cannot depend on itself');
      list.push({ DepUUID: uuid(), TransportUUID: r.TransportUUID, NoteText: '', etag: etag(), ...data, DependsOn: dep });
    } else if (set === 'TechObject') {
      if (data.UsesObjectUUID === r.ObjectUUID) throw new Error('An object cannot depend on itself');
      if (!db.objects.some(o => o.ObjectUUID === data.UsesObjectUUID)) throw new Error('The used object does not exist');
      list.push({ DepUUID: uuid(), ObjectUUID: r.ObjectUUID, DepKind: 'USES', NoteText: '', etag: etag(), ...data });
    } else {
      if (!data.TicketUUID === !data.ObjectUUID) throw new Error('A link points to either a ticket or an object');
      list.push({ LinkUUID: uuid(), ArticleUUID: r.ArticleUUID, TicketUUID: null, ObjectUUID: null, etag: etag(), ...data });
    }
    Object.assign(r, { LastChangedAt: nowIso(), etag: etag() }); save(); await delay(0);
  },
  async deleteSub(set: SubSet, x) {
    const k = SUB_KEY[set], parentSet: RootSet = set === 'TransportDependency' ? 'Transport' : set === 'ObjectDependency' ? 'TechObject' : 'Article';
    for (const r of roots(parentSet)) {
      const list = r[SUB_NAV[parentSet]] as Record<string, unknown>[];
      const i = list.findIndex(c => c[k] === x[k]);
      if (i >= 0) { list.splice(i, 1); Object.assign(r, { LastChangedAt: nowIso(), etag: etag() }); save(); break }
    }
    await delay(0);
  },
  async markReleased(x) {
    const r = findRoot('Transport', x.TransportUUID) as unknown as Transport; checkEtag(r, x.etag);
    if (!r.ReleasedOn) r.ReleasedOn = isoDate(new Date());
    Object.assign(r, { LastChangedAt: nowIso(), etag: etag() }); save(); await delay(0);
  },
  async recordImport(x, system, rc) {
    const r = findRoot('Transport', x.TransportUUID) as unknown as Transport; checkEtag(r, x.etag);
    if (!r.ReleasedOn) r.ReleasedOn = isoDate(new Date());
    if (system === 'QA') { r.QaRc = rc; r.QaImportedAt = nowIso() } else { r.PrdRc = rc; r.PrdImportedAt = nowIso() }
    Object.assign(r, { Phase: phaseOf(r), LastChangedAt: nowIso(), etag: etag() }); save(); await delay(0);
  },
};
