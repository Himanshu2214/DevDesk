// Standalone backend on Supabase (Postgres + Auth + Storage). Column names equal the app's field names,
// so rows are used as they come. Business rules that SAP runs in RAP live in the database
// (ticket/article numbers, LastChangedAt, status events, timer rounding, transport phase) – see supabase/migrations.
// Row level security returns only the signed-in user's rows, and only after the 2-step code.
import type { PostgrestError } from '@supabase/supabase-js';
import type { Api, Article, ChildNav, ChildSet, NewTicket, Project, RootSet, SubSet, TechObject, Ticket, TicketEvent, Transport, ValueItem, Worklog } from './types';
import { CHILD_KEY, ROOT_KEY, SUB_KEY } from './types';
import { sb } from '../lib/supabase';

type Row = Record<string, unknown>;
const CHILD_TABLE: Record<ChildSet, string> = {
  Acceptance: 'acceptance', TestCase: 'test_cases', ChecklistItem: 'checklist_items', Worklog: 'worklogs', Note: 'notes',
  TicketEvent: 'ticket_events', Attachment: 'attachments', ObjectLink: 'object_links',
};
const NAV_SET: Record<ChildNav, ChildSet> = {
  _Acceptance: 'Acceptance', _Test: 'TestCase', _Checklist: 'ChecklistItem', _Worklog: 'Worklog', _Note: 'Note', _Attachment: 'Attachment', _ObjectLink: 'ObjectLink',
};
const ROOT_TABLE: Record<RootSet, string> = { Transport: 'transports', TechObject: 'tech_objects', Article: 'articles' };
const SUB_TABLE: Record<SubSet, string> = { TransportDependency: 'transport_deps', ObjectDependency: 'object_deps', ArticleLink: 'article_links' };
const SUB_PARENT: Record<RootSet, SubSet> = { Transport: 'TransportDependency', TechObject: 'ObjectDependency', Article: 'ArticleLink' };
const BUCKET = 'attachments';
const TRKORR = /^[A-Z0-9]{3}[KT][0-9]{6}$/;
const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/** Database errors in words the user can act on */
function friendly(e: PostgrestError | { message: string; code?: string }): Error {
  const m = e.message ?? '';
  if (e.code === '42501' || /row-level security/i.test(m)) return new Error('Your session needs the sign-in code again. Reload the page.');
  if (e.code === '23505') {
    if (/TrKorr/.test(m)) return new Error('This transport is already in the tracker');
    if (/ObjectName/.test(m)) return new Error('This object is already registered');
    if (/object_links/.test(m)) return new Error('The object is already linked to this ticket');
    return new Error('This already exists');
  }
  if (e.code === '23514') {
    if (/TrKorr|DependsOn/.test(m)) return new Error('That is not a transport request (e.g. S4DK900123)');
    if (/Hours/.test(m)) return new Error('Hours must be more than 0 and at most 24');
    if (/WorkDate/.test(m)) return new Error('Time cannot be logged for a future date');
    if (/Title|ObjectName/.test(m)) return new Error('Enter a name or title');
    if (/TrText/.test(m)) return new Error('The description can have at most 60 characters');
    if (/FileSize/.test(m)) return new Error('The file must not be empty and at most 10 MB');
  }
  return new Error(m || 'The request failed');
}
async function run<T>(p: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw friendly(error);
  return data;
}
const conflict = () => Object.assign(new Error('Someone (or another tab) changed this item in the meantime. It was reloaded – try again.'), { status: 412 });

/** Drop the owner column and add the etag (LastChangedAt) the UI sends back for optimistic locking */
const clean = <T,>(r: Row): T => { const { user_id: _u, ...rest } = r; return { ...rest, ...(rest.LastChangedAt ? { etag: String(rest.LastChangedAt) } : {}) } as T };
const cleanAll = <T,>(rows: Row[] | null): T[] => (rows ?? []).map(r => clean<T>(r));
/** Only real columns go to the database: no navigation, derived or bookkeeping fields */
const DERIVED = new Set(['etag', 'user_id', 'ProjectName', 'LoggedHours', 'IsOverdue', 'Phase', 'TicketNo', 'TicketId', 'ArticleNo', 'ArticleId', 'CreatedAt', 'LastChangedAt']);
const columns = (p: Row): Row => Object.fromEntries(Object.entries(p).filter(([k, v]) => !k.startsWith('_') && !DERIVED.has(k) && v !== undefined));

let me = '';
const uid = async () => (await sb().auth.getUser()).data.user?.id ?? '';

/** what the RAP determinations normalize before save */
function normalize(set: RootSet, r: Row) {
  if (set === 'Transport' && r.TrKorr !== undefined) r.TrKorr = String(r.TrKorr).trim().toUpperCase();
  if (set === 'TechObject') {
    const keepCase = ['FIORI', 'DEST', 'API'].includes(String(r.ObjectType ?? ''));
    if (r.ObjectName !== undefined) r.ObjectName = keepCase ? String(r.ObjectName).trim() : String(r.ObjectName).trim().toUpperCase();
    if (r.PackageName !== undefined) r.PackageName = String(r.PackageName).trim().toUpperCase();
  }
  if (set === 'Transport' && r.TrKorr !== undefined && !TRKORR.test(String(r.TrKorr))) throw new Error(`"${r.TrKorr}" is not a transport request (e.g. S4DK900123)`);
}

/** Update one row; with an etag the row must still have that LastChangedAt, otherwise the caller gets a conflict */
async function updateOne(table: string, key: string, id: unknown, patch: Row, etag?: string) {
  let q = sb().from(table).update(patch).eq(key, id);
  if (etag && etag !== '*') q = q.eq('LastChangedAt', etag);
  const rows = await run(q.select(key));
  if (etag && etag !== '*' && !(rows as unknown as Row[]).length) throw conflict();
}

async function ticketHeads(): Promise<Map<string, Pick<Ticket, 'TicketUUID' | 'TicketId' | 'Title' | 'Status' | 'EstimateHours'>>> {
  const rows = await run(sb().from('tickets').select('TicketUUID,TicketId,Title,Status,EstimateHours'));
  return new Map((rows as Row[]).map(r => [String(r.TicketUUID), r as never]));
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export const supabaseApi: Api = {
  kind: 'supabase',
  async user() {
    const u = (await sb().auth.getUser()).data.user;
    if (!u) throw new Error('Not signed in');
    const meta = u.user_metadata ?? {};
    const fullName = String(meta.full_name || meta.name || u.email || 'You');
    me = fullName;
    return { id: u.email ?? u.id, fullName };
  },
  listProjects: async () => cleanAll<Project>(await run(sb().from('projects').select('*').order('SortOrder'))),
  listValues: async () => cleanAll<ValueItem>(await run(sb().from('value_items').select('*').order('ListType').order('SortOrder'))),
  listTickets: async () => cleanAll<Ticket>(await run(sb().from('tickets_v').select('*').order('TicketNo', { ascending: false }))),
  changedSince: async iso => cleanAll<Ticket>(await run(sb().from('tickets_v').select('*').gt('LastChangedAt', iso))),
  async getTicket(id) {
    const head = await run(sb().from('tickets_v').select('*').eq('TicketUUID', id).maybeSingle());
    if (!head) throw new Error('Ticket not found');
    const kids = (table: string, order: string) => run(sb().from(table).select('*').eq('TicketUUID', id).order(order)).then(r => cleanAll<never>(r as Row[]));
    const [acc, test, chk, wl, note, ev, att, links] = await Promise.all([
      kids('acceptance', 'SortOrder'), kids('test_cases', 'SortOrder'), kids('checklist_items', 'SortOrder'), kids('worklogs', 'WorkDate'),
      kids('notes', 'CreatedAt'), kids('ticket_events', 'EventAt'), kids('attachments', 'CreatedAt'), kids('object_links', 'LinkUUID'),
    ]);
    return { ...clean<Ticket>(head as Row), _Acceptance: acc, _Test: test, _Checklist: chk, _Worklog: wl, _Note: note, _Event: ev, _Attachment: att, _ObjectLink: links };
  },
  async createTicket(n: NewTicket) {
    if (!n.Title.trim()) throw new Error('Enter a title');
    const created = await run(sb().from('tickets').insert({
      Title: n.Title.trim(), Description: n.Description, Priority: n.Priority, Project: n.Project, Area: n.Area, Tech: n.Tech, TicketType: n.TicketType,
      Environment: n.Environment, Requester: n.Requester, Reference: n.Reference, DueDate: n.DueDate || null, EstimateHours: n.EstimateHours,
      Assignee: me, CreatedBy: me,
    }).select('TicketUUID').single()) as Row;
    const id = created.TicketUUID as string;
    const cats = await run(sb().from('value_items').select('Code,Text,SortOrder').eq('ListType', 'CHECKCAT').order('SortOrder')) as Row[];
    await Promise.all([
      n.acceptance.length && run(sb().from('acceptance').insert(n.acceptance.map((Text, i) => ({ TicketUUID: id, SortOrder: i + 1, Text })))),
      n.acceptance.length && run(sb().from('test_cases').insert(n.acceptance.map((a, i) => ({ TicketUUID: id, SortOrder: i + 1, TestName: a, Expected: a })))),
      cats.length && run(sb().from('checklist_items').insert(cats.map(c => ({ TicketUUID: id, SortOrder: c.SortOrder, Category: c.Code, Text: c.Text })))),
    ]);
    if (n.status !== 'BACKLOG') await run(sb().rpc('set_status', { p_ticket: id, p_status: n.status, p_by: me }));
    return this.getTicket(id);
  },
  async updateTicket(t, patch) {
    const p = columns(patch as Row);
    if ('Title' in p && !String(p.Title).trim()) throw new Error('Enter a title');
    if ('DueDate' in p && !p.DueDate) p.DueDate = null;
    await updateOne('tickets', 'TicketUUID', t.TicketUUID, p, t.etag);
  },
  async deleteTicket(t) {
    const files = await run(sb().from('attachments').select('AttUUID').eq('TicketUUID', t.TicketUUID)) as Row[];
    const owner = await uid();
    if (files.length) await sb().storage.from(BUCKET).remove(files.map(f => `${owner}/${f.AttUUID}`));
    let q = sb().from('tickets').delete().eq('TicketUUID', t.TicketUUID);
    if (t.etag) q = q.eq('LastChangedAt', t.etag);
    const rows = await run(q.select('TicketUUID'));
    if (t.etag && !(rows as Row[]).length) throw conflict();
  },
  setStatus: async (t, status) => { await run(sb().rpc('set_status', { p_ticket: t.TicketUUID, p_status: status, p_by: me })) },
  startTimer: async t => { await run(sb().from('tickets').update({ TimerStartedAt: new Date().toISOString() }).eq('TicketUUID', t.TicketUUID).is('TimerStartedAt', null)) },
  stopTimer: async t => { await run(sb().rpc('stop_timer', { p_ticket: t.TicketUUID, p_by: me })) },
  async createChild(t, nav, data) {
    const set = NAV_SET[nav], table = CHILD_TABLE[set];
    if (set === 'Worklog') {
      const h = Number(data.Hours);
      if (!(h > 0 && h <= 24)) throw new Error('Hours must be more than 0 and at most 24');
      const day = String(data.WorkDate || isoDate(new Date()));
      if (day > isoDate(new Date())) throw new Error('Time cannot be logged for a future date');
      await run(sb().from(table).insert({ TicketUUID: t.TicketUUID, WorkDate: day, Hours: h, Activity: data.Activity || 'CODE', CommentText: data.CommentText || '', CreatedBy: me }));
      return;
    }
    if (set === 'Attachment') {
      const bytes = base64ToBytes(String(data.Content ?? ''));
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('The file must not be empty and at most 10 MB');
      const row = await run(sb().from(table).insert({ TicketUUID: t.TicketUUID, FileName: data.FileName, MimeType: data.MimeType || 'application/octet-stream',
        FileSize: bytes.length, CreatedBy: me }).select('AttUUID').single()) as Row;
      const { error } = await sb().storage.from(BUCKET).upload(`${await uid()}/${row.AttUUID}`, bytes, { contentType: String(data.MimeType || 'application/octet-stream') });
      if (error) { await sb().from(table).delete().eq('AttUUID', row.AttUUID); throw new Error('The file could not be uploaded: ' + error.message) }
      return;
    }
    const extra: Row = set === 'Note' ? { CreatedBy: me } : {};
    await run(sb().from(table).insert({ ...columns(data), ...extra, TicketUUID: t.TicketUUID }));
  },
  async updateChild(set, item, patch) {
    const p = columns(patch);
    if (set === 'TestCase' && 'TestResult' in p) Object.assign(p, p.TestResult === 'OPEN' ? { TestedAt: null, TestedBy: '' } : { TestedAt: new Date().toISOString(), TestedBy: me });
    await run(sb().from(CHILD_TABLE[set]).update(p).eq(CHILD_KEY[set], item[CHILD_KEY[set]]));
  },
  async deleteChild(set, item) {
    const key = CHILD_KEY[set];
    if (set === 'Attachment') await sb().storage.from(BUCKET).remove([`${await uid()}/${item[key]}`]);
    await run(sb().from(CHILD_TABLE[set]).delete().eq(key, item[key]));
  },
  async listEvents(top) {
    const [rows, heads] = await Promise.all([run(sb().from('ticket_events').select('*').order('EventAt', { ascending: false }).limit(top)), ticketHeads()]);
    return cleanAll<TicketEvent>(rows as Row[]).map(e => ({ ...e, _Ticket: heads.get(e.TicketUUID) }));
  },
  async listWorklog(from, to) {
    const [rows, heads] = await Promise.all([run(sb().from('worklogs').select('*').gte('WorkDate', from).lte('WorkDate', to)), ticketHeads()]);
    return cleanAll<Worklog>(rows as Row[]).map(w => ({ ...w, _Ticket: heads.get(w.TicketUUID) }));
  },
  async downloadAttachment(a) {
    const { data, error } = await sb().storage.from(BUCKET).download(`${await uid()}/${a.AttUUID}`);
    if (error || !data) throw new Error('The file could not be downloaded');
    return data;
  },
  listObjectLinks: async () => cleanAll(await run(sb().from('object_links').select('*'))),

  async listTransports() {
    const [rows, deps] = await Promise.all([run(sb().from('transports').select('*').order('CreatedAt', { ascending: false })), run(sb().from('transport_deps').select('*'))]);
    const d = cleanAll<Row>(deps as Row[]);
    return cleanAll<Transport>(rows as Row[]).map(t => ({ ...t, _Dependency: d.filter(x => x.TransportUUID === t.TransportUUID) as never }));
  },
  async listObjects() {
    const [rows, deps] = await Promise.all([run(sb().from('tech_objects').select('*').order('ObjectName')), run(sb().from('object_deps').select('*'))]);
    const d = cleanAll<Row>(deps as Row[]);
    return cleanAll<TechObject>(rows as Row[]).map(o => ({ ...o, _Dependency: d.filter(x => x.ObjectUUID === o.ObjectUUID) as never }));
  },
  async listArticles() {
    const [rows, links] = await Promise.all([run(sb().from('articles').select('*').order('CreatedAt', { ascending: false })), run(sb().from('article_links').select('*'))]);
    const l = cleanAll<Row>(links as Row[]);
    return cleanAll<Article>(rows as Row[]).map(a => ({ ...a, _Link: l.filter(x => x.ArticleUUID === a.ArticleUUID) as never }));
  },
  async createRoot(set, data) {
    const r = columns(data);
    normalize(set, r);
    if (set === 'TechObject' && !String(r.ObjectName ?? '').trim()) throw new Error('Enter the object name');
    if (set === 'Article' && !String(r.Title ?? '').trim()) throw new Error('Enter a title');
    if (set === 'Transport') r.TrOwner = me;
    const row = await run(sb().from(ROOT_TABLE[set]).insert({ ...r, CreatedBy: me }).select(ROOT_KEY[set]).single()) as Row;
    return String(row[ROOT_KEY[set]]);
  },
  async updateRoot(set, item, patch) {
    const p = columns(patch);
    // the object type decides whether the name keeps its case, so normalize with the stored type when it is not changed
    const typeGiven = 'ObjectType' in p;
    if (set === 'TechObject' && !typeGiven) p.ObjectType = item.ObjectType;
    normalize(set, p);
    if (set === 'TechObject' && !typeGiven) delete p.ObjectType;
    await updateOne(ROOT_TABLE[set], ROOT_KEY[set], item[ROOT_KEY[set]], p, item.etag);
  },
  async deleteRoot(set, item) {
    let q = sb().from(ROOT_TABLE[set]).delete().eq(ROOT_KEY[set], item[ROOT_KEY[set]]);
    if (item.etag) q = q.eq('LastChangedAt', item.etag);
    const rows = await run(q.select(ROOT_KEY[set]));
    if (item.etag && !(rows as unknown as Row[]).length) throw conflict();
  },
  async createSub(set, item, data) {
    const table = SUB_TABLE[SUB_PARENT[set]];
    if (set === 'Transport') {
      const dep = String(data.DependsOn ?? '').trim().toUpperCase();
      if (!TRKORR.test(dep)) throw new Error(`"${dep}" is not a transport request`);
      if (dep === item.TrKorr) throw new Error('A transport cannot depend on itself');
      await run(sb().from(table).insert({ TransportUUID: item.TransportUUID, DependsOn: dep, NoteText: data.NoteText ?? '' }));
    } else if (set === 'TechObject') {
      if (data.UsesObjectUUID === item.ObjectUUID) throw new Error('An object cannot depend on itself');
      await run(sb().from(table).insert({ ObjectUUID: item.ObjectUUID, ...columns(data) }));
    } else {
      if (!data.TicketUUID === !data.ObjectUUID) throw new Error('A link points to either a ticket or an object');
      await run(sb().from(table).insert({ ArticleUUID: item.ArticleUUID, TicketUUID: data.TicketUUID ?? null, ObjectUUID: data.ObjectUUID ?? null }));
    }
  },
  deleteSub: async (set, item) => { await run(sb().from(SUB_TABLE[set]).delete().eq(SUB_KEY[set], item[SUB_KEY[set]])) },
  async markReleased(t) {
    if (t.ReleasedOn) return;
    await updateOne('transports', 'TransportUUID', t.TransportUUID, { ReleasedOn: isoDate(new Date()) }, t.etag);
  },
  async recordImport(t, system, rc) {
    const now = new Date().toISOString();
    const p: Row = system === 'QA' ? { QaRc: rc, QaImportedAt: now } : { PrdRc: rc, PrdImportedAt: now };
    if (!t.ReleasedOn) p.ReleasedOn = isoDate(new Date());
    await updateOne('transports', 'TransportUUID', t.TransportUUID, p, t.etag);
  },
};
