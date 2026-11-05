// Security tests against the TEST Supabase project through its real API, as real users.
// Every permission check runs with the public (anon / publishable) key and the user's own session – exactly what a
// browser could send. The service-role client is used only for set-up and clean-up (creating and deleting the test
// users, reading their sign-in code from the mail sink), never to decide whether something was allowed.
import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ANON_KEY, SUPABASE_URL, codeMark, ensureSafe, latestCode, type TestUser } from '../cloud';

export type Api = SupabaseClient;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** nobody signed in: the anon key only */
export async function anonymous(): Promise<Api> {
  await ensureSafe();
  return createClient(SUPABASE_URL, ANON_KEY, opts);
}

/** email + password only – the second step (emailed code) NOT done */
export async function passwordOnly(u: TestUser): Promise<Api> {
  const c = await anonymous();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`signing in ${u.email} failed: ${error.message}`);
  return c;
}

/** a fully signed-in session: password, then the emailed code through the real edge functions */
export async function verified(u: TestUser): Promise<Api> {
  const c = await passwordOnly(u);
  const mark = await codeMark(u);
  const sent = await c.functions.invoke('send-login-code', { body: {} });
  if (sent.error) throw new Error(`send-login-code for ${u.email}: ${sent.error.message}`);
  const code = await latestCode(u, mark);
  const ok = await c.functions.invoke('verify-login-code', { body: { code } });
  if (ok.error) throw new Error(`verify-login-code for ${u.email}: ${ok.error.message}`);
  expect((await c.rpc('session_verified')).data, `${u.email}: session verified after the code`).toBe(true);
  return c;
}

type Result = { data: unknown; error: { message: string; code?: string } | null };
const rows = (r: Result) => (Array.isArray(r.data) ? r.data : r.data == null ? [] : [r.data]);
const show = (r: Result) => r.error ? `error ${r.error.code ?? ''} ${r.error.message}` : `${rows(r).length} row(s): ${JSON.stringify(r.data).slice(0, 200)}`;

/** a read that must reveal nothing: either refused or empty */
export async function seesNothing(what: string, q: PromiseLike<Result>) {
  const r = await q;
  expect(r.error || rows(r).length === 0, `${what} – expected nothing, got ${show(r)}`).toBeTruthy();
}
/** a write or call that must be refused with an error */
export async function refused(what: string, q: PromiseLike<Result>) {
  const r = await q;
  expect(r.error, `${what} – expected an error, got ${show(r)}`).not.toBeNull();
}
/** an UPDATE/DELETE (with .select()) that must touch nothing: refused, or zero rows */
export async function changesNothing(what: string, q: PromiseLike<Result>) {
  const r = await q;
  expect(r.error || rows(r).length === 0, `${what} – expected no row changed, got ${show(r)}`).toBeTruthy();
}
/** an operation that must succeed */
export async function allowed<T = unknown>(what: string, q: PromiseLike<Result>): Promise<T> {
  const r = await q;
  expect(r.error, `${what} – expected success, got ${show(r)}`).toBeNull();
  return r.data as T;
}

/** downloads a file through /object/authenticated/…, which Storage checks against the policies on every request.
 *  (supabase-js download() uses /object/…, which the CDN may answer from cache for a token that fetched it before –
 *  finding F12 – so a revoked person's access is checked here, where the server decides.) */
export async function serverDownload(c: Api, path: string): Promise<Result> {
  const token = (await c.auth.getSession()).data.session?.access_token;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/attachments/${path}`,
    { headers: { apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return r.ok ? { data: await r.text(), error: null } : { data: null, error: { message: `HTTP ${r.status} ${(await r.text()).slice(0, 120)}` } };
}

/** a ticket created by the user through the API (as the app does), in their own General project */
export async function newTicket(c: Api, title: string): Promise<{ TicketUUID: string; TicketId: string }> {
  return allowed('creating a ticket', c.from('tickets').insert({ Title: title, Project: 'GEN' }).select('TicketUUID, TicketId').single());
}

/** an attachment row plus its file at <uploader>/<AttUUID>, as the app stores it */
export async function newAttachment(c: Api, uploader: string, ticket: string): Promise<string> {
  const row = await allowed<{ AttUUID: string }>('adding an attachment row',
    c.from('attachments').insert({ TicketUUID: ticket, FileName: 'e2e.txt', MimeType: 'text/plain', FileSize: 5 }).select('AttUUID').single());
  await allowed('uploading the file', c.storage.from('attachments').upload(`${uploader}/${row.AttUUID}`, new Blob(['e2e!!'], { type: 'text/plain' }), { contentType: 'text/plain' }));
  return row.AttUUID;
}
