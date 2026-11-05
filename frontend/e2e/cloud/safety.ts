// Safety checks and cleanup for the cloud tests, kept free of Playwright and of file access so they can be unit-tested
// (test/e2e-safety.test.ts, part of `npm test` and CI). cloud.ts applies them to the real test project.
//
// Before ANY call to Supabase the configuration must pass every check below. None of them alone proves the project is
// safe; together they require: a standard project address that is not production, keys that belong to that same
// project, nothing in the shell that could point the app somewhere else, a service key the project accepts, the
// test-only mail_sink table, and an app build that talks to that project and not to production.

/** the production project – never touched by the tests */
export const PRODUCTION_REF = 'udsqireigvipmpepbtrf';

/** a standard Supabase project address: https://<20 lowercase letters>.supabase.co (custom domains are refused) */
const PROJECT_URL = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/;

export interface TestConfig { url: string; ref: string; anonKey: string; serviceKey: string }

/** KEY=value lines of an env file (comments and blank lines ignored, surrounding quotes removed) */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** the claims of a JWT-style Supabase key, or null for the newer sb_… keys (which carry no project reference) */
function jwtClaims(key: string): Record<string, unknown> | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

function checkKey(name: string, key: string, role: 'anon' | 'service_role', ref: string) {
  const claims = jwtClaims(key);
  if (claims) {
    if (claims.ref !== ref) throw new Error(`${name} belongs to a different project (${String(claims.ref)}), not to ${ref} in VITE_SUPABASE_URL.`);
    if (claims.role !== role) throw new Error(`${name} is a "${String(claims.role)}" key; expected the ${role} key.`);
    return;
  }
  // newer API keys: the project is checked on the server (verifyProject), the kind here
  const prefix = role === 'anon' ? 'sb_publishable_' : 'sb_secret_';
  if (!key.startsWith(prefix)) throw new Error(`${name} is not a Supabase ${role === 'anon' ? 'anon/publishable' : 'service_role/secret'} key.`);
}

/** Checks .env.e2e.local (`file`) and the shell environment (`shell`). Throws a clear error on the first problem. */
export function checkConfig(file: Record<string, string>, shell: Record<string, string | undefined>): TestConfig {
  // Vite lets shell variables override .env files: the app under test could then talk to another project than the helpers
  const overrides = Object.keys(shell).filter(k => k.startsWith('VITE_SUPABASE_') && shell[k] !== undefined);
  if (overrides.length) throw new Error(`Refusing to run: ${overrides.join(', ')} ${overrides.length > 1 ? 'are' : 'is'} set in the shell and would override .env.e2e.local. Unset ${overrides.length > 1 ? 'them' : 'it'} first.`);

  const url = file.VITE_SUPABASE_URL ?? '';
  if (!url) throw new Error('.env.e2e.local needs VITE_SUPABASE_URL (see e2e/README.md).');
  const m = url.match(PROJECT_URL);
  if (!m) throw new Error(`Refusing to run: VITE_SUPABASE_URL must be a standard project address https://<project-ref>.supabase.co (custom domains are not accepted). Got: ${url}`);
  const ref = m[1];
  if (ref === PRODUCTION_REF) throw new Error('Refusing to run: .env.e2e.local points at the PRODUCTION project. Use the separate test project.');

  const anonKey = file.VITE_SUPABASE_ANON_KEY ?? '', serviceKey = file.E2E_SERVICE_ROLE_KEY ?? '';
  if (!anonKey) throw new Error('.env.e2e.local needs VITE_SUPABASE_ANON_KEY (see e2e/README.md).');
  if (!serviceKey) throw new Error('.env.e2e.local needs E2E_SERVICE_ROLE_KEY (see e2e/README.md).');
  if (anonKey === serviceKey) throw new Error('VITE_SUPABASE_ANON_KEY and E2E_SERVICE_ROLE_KEY are the same key.');
  checkKey('VITE_SUPABASE_ANON_KEY', anonKey, 'anon', ref);
  checkKey('E2E_SERVICE_ROLE_KEY', serviceKey, 'service_role', ref);
  return { url: url.replace(/\/$/, ''), ref, anonKey, serviceKey };
}

/** The built app (its JavaScript files) must talk to the test project and must not contain the production address. */
export function checkBundle(files: { name: string; text: string }[], ref: string, serviceKey: string) {
  if (!files.length) throw new Error('The cloud test build (e2e-dist-cloud) has no JavaScript files.');
  const leak = files.find(f => f.text.includes(serviceKey));
  if (leak) throw new Error(`Refusing to run: the service_role key is inside the app build (${leak.name}). It must never reach the browser.`);
  const prod = files.find(f => f.text.includes(PRODUCTION_REF));
  if (prod) throw new Error(`Refusing to run: the app build contains the PRODUCTION project address (${prod.name}).`);
  if (!files.some(f => f.text.includes(`https://${ref}.supabase.co`))) throw new Error(`The app build does not talk to the test project ${ref}; rebuild it from .env.e2e.local.`);
}

/** The parts of the Supabase admin client these helpers use (a fake in the unit tests) */
type Result = { error: { message: string } | null };
export interface AdminLike {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result>;
  from(table: string): {
    select(cols: string, opts?: { count?: 'exact'; head?: boolean }): PromiseLike<Result>;
    delete(): { eq(col: string, v: string): PromiseLike<Result> };
  };
  /** Storage: the user's files (attachments/<user id>/…); optional so the unit tests' fake client may leave it out */
  storage?: { from(bucket: string): {
    list(prefix: string, opts: { limit: number }): PromiseLike<{ data: { name: string }[] | null; error: { message: string } | null }>;
    remove(paths: string[]): PromiseLike<Result>;
  } };
  auth: { admin: {
    deleteUser(id: string): PromiseLike<Result>;
    listUsers(p: { page: number; perPage: number }): PromiseLike<{ data: { users: AuthUser[] } | null; error: { message: string } | null }>;
  } };
}
export interface AuthUser { id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown> }

/** Server-side checks. Supabase routes a request by its address (https://<ref>.supabase.co) and accepts only that
 *  project's own keys there, so a key accepted at the checked address belongs to that project – for the newer sb_… keys,
 *  which carry no project reference, this is the identity check. Both keys are checked this way:
 *  - the anon key at the Auth settings endpoint (any other project's key, or a made-up one, is answered with 401);
 *  - the service key by listing users, which only a service_role key of this project may do.
 *  Then the test-only mail_sink table must exist. */
export async function verifyProject(client: AdminLike, anon: { url: string; key: string; fetch: (u: string, init: { headers: Record<string, string> }) => Promise<{ status: number }> }) {
  let status = 0;
  try { status = (await anon.fetch(`${anon.url}/auth/v1/settings`, { headers: { apikey: anon.key } })).status } catch (e) { throw new Error(`The test project could not be reached (${errText(e)}).`) }
  if (status !== 200) throw new Error(`The test project refused VITE_SUPABASE_ANON_KEY (HTTP ${status}). Is the key from the same project as VITE_SUPABASE_URL?`);
  const users = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (users.error && /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(users.error.message))
    throw new Error(`The test project could not be reached (${users.error.message}). Nothing was run or cleaned up – try again.`);
  if (users.error) throw new Error(`The test project refused E2E_SERVICE_ROLE_KEY (${users.error.message}). Is it the service_role key of the same project as VITE_SUPABASE_URL?`);
  const sink = await client.from('mail_sink').select('id', { count: 'exact', head: true });
  if (sink.error) throw new Error(`The mail_sink table is missing on the test project (${sink.error.message}). Run supabase/tests/mail_sink.sql there (test project only) and set the secret MAIL_SINK=table.`);
}

/** e2e-<role>-<run>-<6 hex>@example.com, exactly as createUser makes them */
export const E2E_EMAIL = /^e2e-([a-z]{1,20})-([0-9a-z]{6,12})-[0-9a-f]{6}@example\.com$/;
export const e2eEmail = (role: string, run: string, hex: string) => {
  const email = `e2e-${role}-${run}-${hex}@example.com`;
  if (!E2E_EMAIL.test(email)) throw new Error(`Invalid test account name: ${email}`);
  return email;
};
/** an account this framework created: the exact address pattern AND the marker it sets, with the same run id */
export function isE2EAccount(u: Pick<AuthUser, 'email' | 'user_metadata'>): boolean {
  const m = (u.email ?? '').match(E2E_EMAIL);
  return !!m && u.user_metadata?.e2e_run === m[2];
}

export interface CleanupFailure { user: string; operation: string; message: string }
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Removes one test account: its data (as "Delete account" does), the login, its mail-sink rows. Every step is tried
 *  even when an earlier one fails; the failures are returned. Accounts that are not E2E accounts are never touched. */
export async function cleanupUser(client: AdminLike, u: { id: string; email: string; user_metadata?: Record<string, unknown> }): Promise<CleanupFailure[]> {
  if (!isE2EAccount(u)) return [{ user: u.email, operation: 'check', message: 'refused: not an account created by the E2E tests' }];
  const failures: CleanupFailure[] = [];
  const step = async (operation: string, run: () => PromiseLike<Result>) => {
    try { const { error } = await run(); if (error) failures.push({ user: u.email, operation, message: error.message }) }
    catch (e) { failures.push({ user: u.email, operation, message: errText(e) }) }
  };
  // files first, as the app's own delete-account does: Storage is not covered by the database cascade
  const files = client.storage?.from('attachments');
  if (files) await step('delete files', async () => {
    for (;;) {
      const { data, error } = await files.list(u.id, { limit: 1000 });
      if (error || !data?.length) return { data: null, error };
      const removed = await files.remove(data.map(x => `${u.id}/${x.name}`));
      if (removed.error || data.length < 1000) return removed;
    }
  });
  await step('delete_user_data', () => client.rpc('delete_user_data', { p_user: u.id }));
  await step('auth.admin.deleteUser', () => client.auth.admin.deleteUser(u.id));
  await step('delete mail_sink rows', () => client.from('mail_sink').delete().eq('to_address', u.email.toLowerCase()));
  return failures;
}

export const describeFailures = (f: CleanupFailure[]) =>
  `Cleanup failed for ${f.length} step${f.length > 1 ? 's' : ''}:\n` + f.map(x => `  - ${x.user}: ${x.operation} – ${x.message}`).join('\n');

/** when a run started: its id is Date.now() in base 36 (NaN when it is not one) */
export const runStartedAt = (run: string) => /^[0-9a-z]{6,12}$/.test(run) ? parseInt(run, 36) : NaN;

/** A whole test run is stopped after RUN_LIMIT_MS (Playwright globalTimeout in playwright.config.ts). An account counts as
 *  abandoned only when both the account and its run started more than ABANDONED_AFTER_MS ago – twice the run limit, so a
 *  run that is still going (even with a clock some minutes off) is never swept by another run. */
export const RUN_LIMIT_MS = 60 * 60_000, ABANDONED_AFTER_MS = 2 * RUN_LIMIT_MS;

/** This run's E2E accounts (`run`), and abandoned ones of earlier runs, are removed. */
export async function sweep(client: AdminLike, opts: { run?: string; olderThanMs: number; now?: number }): Promise<{ removed: string[]; failures: CleanupFailure[] }> {
  const now = opts.now ?? Date.now(), found: AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { removed: [], failures: [{ user: '(all)', operation: 'auth.admin.listUsers', message: error.message }] };
    const users = data?.users ?? [];
    found.push(...users);
    if (users.length < 1000) break;
  }
  const abandoned = (u: AuthUser) => {
    const started = runStartedAt(String(u.user_metadata?.e2e_run)), created = Date.parse(u.created_at);
    return Number.isFinite(started) && Number.isFinite(created) && now - started > opts.olderThanMs && now - created > opts.olderThanMs;
  };
  const stale = found.filter(u => isE2EAccount(u) && ((opts.run !== undefined && u.user_metadata?.e2e_run === opts.run) || abandoned(u)));
  const removed: string[] = [], failures: CleanupFailure[] = [];
  for (const u of stale) {
    const f = await cleanupUser(client, { id: u.id, email: u.email!, user_metadata: u.user_metadata });
    if (f.length) failures.push(...f); else removed.push(u.email!);
  }
  return { removed, failures };
}
