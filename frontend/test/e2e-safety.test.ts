// The safety checks and the clean-up of the cloud end-to-end tests (frontend/e2e/cloud/safety.ts), with a fake Supabase
// admin client – no network and no real project.
import { describe, expect, it } from 'vitest';
import { ABANDONED_AFTER_MS, checkBundle, checkConfig, cleanupUser, describeFailures, e2eEmail, isE2EAccount, parseEnvFile, PRODUCTION_REF, runStartedAt, sweep, verifyProject,
  type AdminLike, type AuthUser } from '../e2e/cloud/safety';

const REF = 'abcdefghijklmnopqrst';                      // a made-up test project reference (20 letters)
const jwt = (claims: Record<string, unknown>) => ['{"alg":"HS256"}', JSON.stringify(claims)].map(s => Buffer.from(s).toString('base64url')).join('.') + '.sig';
const ANON = jwt({ ref: REF, role: 'anon' }), SERVICE = jwt({ ref: REF, role: 'service_role' });
const file = (over: Record<string, string> = {}) => ({ VITE_SUPABASE_URL: `https://${REF}.supabase.co`, VITE_SUPABASE_ANON_KEY: ANON, E2E_SERVICE_ROLE_KEY: SERVICE, ...over });

describe('test project configuration', () => {
  it('accepts a standard test project address with its own keys', () => {
    expect(checkConfig(file(), {})).toMatchObject({ ref: REF, url: `https://${REF}.supabase.co` });
    expect(checkConfig(file({ VITE_SUPABASE_URL: `https://${REF}.supabase.co/` }), {}).url).toBe(`https://${REF}.supabase.co`);
  });

  it('refuses the production project', () => {
    const prod = file({ VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`, VITE_SUPABASE_ANON_KEY: jwt({ ref: PRODUCTION_REF, role: 'anon' }), E2E_SERVICE_ROLE_KEY: jwt({ ref: PRODUCTION_REF, role: 'service_role' }) });
    expect(() => checkConfig(prod, {})).toThrow(/PRODUCTION/);
  });

  it.each([
    ['a custom domain', 'https://api.slatespace.app'],
    ['plain http', `http://${REF}.supabase.co`],
    ['a path after the address', `https://${REF}.supabase.co/rest/v1`],
    ['a reference of the wrong length', 'https://abcdef.supabase.co'],
    ['a look-alike domain', `https://${REF}.supabase.co.evil.example`],
    ['the production reference inside another name', `https://x${PRODUCTION_REF}.supabase.co`],
  ])('refuses %s', (_, url) => {
    expect(() => checkConfig(file({ VITE_SUPABASE_URL: url }), {})).toThrow(/standard project address/);
  });

  it('refuses VITE_SUPABASE_* variables set in the shell, which would override the file in the app build', () => {
    expect(() => checkConfig(file(), { VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` })).toThrow(/VITE_SUPABASE_URL is set in the shell/);
    expect(() => checkConfig(file(), { VITE_SUPABASE_ANON_KEY: 'x', VITE_SUPABASE_URL: 'y' })).toThrow(/are set in the shell/);
    expect(() => checkConfig(file(), { PATH: '/usr/bin', VITE_BACKEND: 'supabase' })).not.toThrow();
  });

  it('refuses missing settings', () => {
    expect(() => checkConfig(file({ E2E_SERVICE_ROLE_KEY: '' }), {})).toThrow(/needs E2E_SERVICE_ROLE_KEY/);
    expect(() => checkConfig(file({ VITE_SUPABASE_ANON_KEY: '' }), {})).toThrow(/needs VITE_SUPABASE_ANON_KEY/);
    expect(() => checkConfig(file({ VITE_SUPABASE_URL: '' }), {})).toThrow(/needs VITE_SUPABASE_URL/);
  });

  it('refuses keys of another project, the wrong kind of key, or the same key twice', () => {
    expect(() => checkConfig(file({ E2E_SERVICE_ROLE_KEY: jwt({ ref: PRODUCTION_REF, role: 'service_role' }) }), {})).toThrow(/different project/);
    expect(() => checkConfig(file({ VITE_SUPABASE_ANON_KEY: jwt({ ref: 'zzzzzzzzzzzzzzzzzzzz', role: 'anon' }) }), {})).toThrow(/different project/);
    expect(() => checkConfig(file({ E2E_SERVICE_ROLE_KEY: jwt({ ref: REF, role: 'anon', iat: 2 }) }), {})).toThrow(/expected the service_role key/);
    expect(() => checkConfig(file({ E2E_SERVICE_ROLE_KEY: ANON }), {})).toThrow(/same key/);
    expect(() => checkConfig(file({ E2E_SERVICE_ROLE_KEY: 'not-a-key' }), {})).toThrow(/not a Supabase service_role/);
  });

  it('accepts the newer sb_publishable_ / sb_secret_ keys (their project is checked on the server)', () => {
    expect(() => checkConfig(file({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc', E2E_SERVICE_ROLE_KEY: 'sb_secret_def' }), {})).not.toThrow();
    expect(() => checkConfig(file({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc', E2E_SERVICE_ROLE_KEY: 'sb_publishable_def' }), {})).toThrow(/not a Supabase service_role/);
  });

  it('reads the env file', () => {
    expect(parseEnvFile('# comment\nVITE_SUPABASE_URL="https://x.supabase.co"\r\n\nE2E_SERVICE_ROLE_KEY = abc \n')).toEqual({ VITE_SUPABASE_URL: 'https://x.supabase.co', E2E_SERVICE_ROLE_KEY: 'abc' });
  });
});

describe('the app build', () => {
  it('must talk to the test project and never contain the production address', () => {
    expect(() => checkBundle([{ name: 'a.js', text: `const u="https://${REF}.supabase.co"` }], REF, SERVICE)).not.toThrow();
    expect(() => checkBundle([{ name: 'a.js', text: `https://${REF}.supabase.co` }, { name: 'b.js', text: PRODUCTION_REF }], REF, SERVICE)).toThrow(/PRODUCTION project address \(b\.js\)/);
    expect(() => checkBundle([{ name: 'a.js', text: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }], REF, SERVICE)).toThrow(/does not talk to the test project/);
    expect(() => checkBundle([], REF, SERVICE)).toThrow(/no JavaScript/);
    expect(() => checkBundle([{ name: 'c.js', text: `https://${REF}.supabase.co "${SERVICE}"` }], REF, SERVICE)).toThrow('the service_role key is inside the app build (c.js)');
  });
});

/** a fake admin client: users in memory, operations that can be made to fail, and a log of what was called */
function fakeAdmin(opts: { users?: AuthUser[]; fail?: Partial<Record<'rpc' | 'deleteUser' | 'sinkDelete' | 'sinkSelect' | 'listUsers', string>>; throwOn?: 'rpc' } = {}) {
  const calls: string[] = [];
  const res = (k: keyof NonNullable<typeof opts.fail>) => Promise.resolve({ error: opts.fail?.[k] ? { message: opts.fail[k]! } : null });
  const client: AdminLike = {
    rpc: (fn, args) => { calls.push(`rpc ${fn} ${args.p_user}`); if (opts.throwOn === 'rpc') throw new Error('network down'); return res('rpc') },
    from: table => ({
      select: () => { calls.push(`select ${table}`); return res('sinkSelect') },
      delete: () => ({ eq: (_c, v) => { calls.push(`delete ${table} ${v}`); return res('sinkDelete') } }),
    }),
    auth: { admin: {
      deleteUser: id => { calls.push(`deleteUser ${id}`); return res('deleteUser') },
      listUsers: () => { calls.push('listUsers'); return Promise.resolve(opts.fail?.listUsers ? { data: null, error: { message: opts.fail.listUsers } } : { data: { users: opts.users ?? [] }, error: null }) },
    } },
  };
  return { client, calls };
}

describe('the test project on the server', () => {
  const URL = `https://${REF}.supabase.co`;
  /** the anon-key probe: answers with `status` and records the address and key it was asked with */
  const probe = (status: number, seen: string[] = []) => ({ url: URL, key: 'sb_publishable_x',
    fetch: async (u: string, init: { headers: Record<string, string> }) => { seen.push(`${u} ${init.headers.apikey}`); return { status } } });

  it('passes when the project accepts both keys and has the mail_sink table', async () => {
    const seen: string[] = [];
    await expect(verifyProject(fakeAdmin().client, probe(200, seen))).resolves.toBeUndefined();
    expect(seen).toEqual([`${URL}/auth/v1/settings sb_publishable_x`]);     // asked at the checked address, with the anon key
  });
  it('fails when the project refuses the anon key (a key of another project, or a made-up one)', async () => {
    const { client, calls } = fakeAdmin();
    await expect(verifyProject(client, probe(401))).rejects.toThrow('refused VITE_SUPABASE_ANON_KEY (HTTP 401)');
    expect(calls).toEqual([]);                                              // nothing else was attempted
  });
  it('fails when the project cannot be reached', async () => {
    await expect(verifyProject(fakeAdmin().client, { url: URL, key: 'k', fetch: async () => { throw new Error('getaddrinfo ENOTFOUND') } })).rejects.toThrow(/could not be reached/);
  });
  it('fails when the project refuses the service key', async () => {
    await expect(verifyProject(fakeAdmin({ fail: { listUsers: 'Invalid API key' } }).client, probe(200))).rejects.toThrow(/refused E2E_SERVICE_ROLE_KEY/);
  });
  it('reports a network failure as unreachable, not as a wrong key', async () => {
    await expect(verifyProject(fakeAdmin({ fail: { listUsers: 'fetch failed' } }).client, probe(200))).rejects.toThrow('could not be reached (fetch failed)');
  });
  it('fails when the mail_sink table is missing', async () => {
    await expect(verifyProject(fakeAdmin({ fail: { sinkSelect: 'relation "public.mail_sink" does not exist' } }).client, probe(200))).rejects.toThrow(/mail_sink table is missing/);
  });
});

const RUN = 'mh3k2x9a';
const acct = (role: string, over: Partial<AuthUser> = {}): AuthUser & { email: string } =>
  ({ id: 'id-' + role, email: e2eEmail(role, RUN, 'a1b2c3'), created_at: new Date().toISOString(), user_metadata: { e2e_run: RUN }, ...over });

describe('which accounts count as E2E accounts', () => {
  it('only the exact generated address together with the matching run marker', () => {
    expect(isE2EAccount(acct('owner'))).toBe(true);
    for (const email of [
      'e2e-owner-mh3k2x9a-a1b2c3@example.org',        // another domain
      'E2E-owner-mh3k2x9a-a1b2c3@example.com',        // capitals
      'e2e-owner-mh3k2x9a-a1b2c@example.com',         // 5 hex characters
      'e2e-owner-mh3k2x9a-a1b2c3@example.com.au',     // longer domain
      'xe2e-owner-mh3k2x9a-a1b2c3@example.com',       // prefix
      'e2e-owner1-mh3k2x9a-a1b2c3@example.com',       // digit in the role
      'someone@gmail.com',
    ]) expect(isE2EAccount({ email, user_metadata: { e2e_run: RUN } }), email).toBe(false);
    expect(isE2EAccount(acct('owner', { user_metadata: {} }))).toBe(false);                    // no marker
    expect(isE2EAccount(acct('owner', { user_metadata: { e2e_run: 'other123' } }))).toBe(false); // marker of another run
    expect(() => e2eEmail('Owner', RUN, 'a1b2c3')).toThrow(/Invalid test account name/);
  });
});

describe('cleaning up a test account', () => {
  it('runs every step and reports nothing when all succeed', async () => {
    const { client, calls } = fakeAdmin();
    expect(await cleanupUser(client, acct('owner'))).toEqual([]);
    expect(calls).toEqual(['rpc delete_user_data id-owner', 'deleteUser id-owner', `delete mail_sink ${acct('owner').email}`]);
  });

  it('continues after a failed step and reports the user and the exact step', async () => {
    const { client, calls } = fakeAdmin({ fail: { rpc: 'permission denied' } });
    const f = await cleanupUser(client, acct('owner'));
    expect(f).toEqual([{ user: acct('owner').email, operation: 'delete_user_data', message: 'permission denied' }]);
    expect(calls).toHaveLength(3);                                         // the login and the mail rows were still removed
    expect(describeFailures(f)).toContain(`${acct('owner').email}: delete_user_data – permission denied`);
  });

  it('reports a step that throws, and every failing step', async () => {
    const { client, calls } = fakeAdmin({ throwOn: 'rpc', fail: { deleteUser: 'User not found' } });
    const f = await cleanupUser(client, acct('owner'));
    expect(f.map(x => `${x.operation}: ${x.message}`)).toEqual(['delete_user_data: network down', 'auth.admin.deleteUser: User not found']);
    expect(calls.at(-1)).toMatch(/^delete mail_sink/);
  });

  it('removes the account\'s own files first, only in its own folder; a failure there is reported and the rest still runs', async () => {
    for (const fail of [undefined, 'storage down']) {
      const { client, calls } = fakeAdmin();
      client.storage = { from: bucket => ({
        list: (prefix, o) => { calls.push(`list ${bucket} ${prefix} ${o.limit}`); return Promise.resolve({ data: [{ name: 'att-1' }, { name: 'att-2' }], error: null }) },
        remove: paths => { calls.push(`remove ${paths.join(',')}`); return Promise.resolve({ data: null, error: fail ? { message: fail } : null }) },
      }) };
      const f = await cleanupUser(client, acct('owner'));
      expect(calls.slice(0, 2)).toEqual(['list attachments id-owner 1000', 'remove id-owner/att-1,id-owner/att-2']);
      expect(f).toEqual(fail ? [{ user: acct('owner').email, operation: 'delete files', message: fail }] : []);
      expect(calls.slice(2)).toEqual(['rpc delete_user_data id-owner', 'deleteUser id-owner', `delete mail_sink ${acct('owner').email}`]);
    }
  });

  it('never touches an account that is not an E2E account', async () => {
    const { client, calls } = fakeAdmin();
    const f = await cleanupUser(client, { id: 'real', email: 'someone@gmail.com', user_metadata: {} });
    expect(f[0].message).toMatch(/refused/);
    expect(calls).toEqual([]);
  });
});

describe('sweeping abandoned accounts', () => {
  const MIN = 60_000, now = Date.parse('2026-11-05T12:00:00Z');
  const runAt = (minutesAgo: number) => (now - minutesAgo * MIN).toString(36);       // a run id is its start time
  const account = (role: string, run: string, createdMinutesAgo: number) =>
    ({ id: `id-${role}-${run}`, email: e2eEmail(role, run, 'a1b2c3'), created_at: new Date(now - createdMinutesAgo * MIN).toISOString(), user_metadata: { e2e_run: run } });
  const opts = (run?: string) => ({ run, olderThanMs: ABANDONED_AFTER_MS, now });

  it('run ids are start times', () => {
    expect(runStartedAt(runAt(5))).toBe(now - 5 * MIN);
    expect(runStartedAt('Bad-id')).toBeNaN();
  });

  it('removes this run and abandoned E2E accounts only; real users and other active runs stay', async () => {
    const thisRun = runAt(3), dead = runAt(600), active = runAt(90), slow = runAt(115);
    const real = { id: 'real', email: 'dev@company.com', created_at: new Date(now - 6000 * MIN).toISOString(), user_metadata: {} };
    const lookalike = { id: 'look', email: `e2e-owner-${dead}-a1b2c3@example.com`, created_at: new Date(now - 6000 * MIN).toISOString(), user_metadata: {} };
    const users = [real, lookalike,
      account('owner', dead, 599),       // abandoned 10 hours ago → removed
      account('member', thisRun, 2),     // this run → removed
      account('other', active, 89),      // a run started 90 minutes ago that may still be going → kept
      account('signin', slow, 115),      // within twice the run limit → kept
    ];
    const { client, calls } = fakeAdmin({ users });
    const r = await sweep(client, opts(thisRun));
    expect(r.failures).toEqual([]);
    expect(r.removed).toEqual([account('owner', dead, 599).email, account('member', thisRun, 2).email]);
    expect(calls.join(' | ')).not.toMatch(new RegExp(`real|look|${active}|${slow}`));
  });

  it('keeps an account whose run started recently even if the account looks old (clock or data oddities)', async () => {
    const { client, calls } = fakeAdmin({ users: [account('owner', runAt(10), 6000)] });
    expect((await sweep(client, opts())).removed).toEqual([]);
    expect(calls).toEqual(['listUsers']);
  });

  it('before a run (no run of its own) it removes only abandoned accounts', async () => {
    const { client } = fakeAdmin({ users: [account('owner', runAt(1), 1), account('member', runAt(300), 300)] });
    expect((await sweep(client, opts())).removed).toEqual([account('member', runAt(300), 300).email]);
  });

  it('keeps going after one account fails and reports it', async () => {
    const users = [account('owner', runAt(300), 300), account('member', runAt(400), 400)];
    const { client } = fakeAdmin({ users, fail: { deleteUser: 'database error' } });
    const r = await sweep(client, opts());
    expect(r.removed).toEqual([]);
    expect(r.failures.map(f => f.user)).toEqual(users.map(u => u.email));
  });

  it('reports when the accounts cannot be listed', async () => {
    const r = await sweep(fakeAdmin({ fail: { listUsers: 'Invalid API key' } }).client, opts());
    expect(r.failures[0]).toMatchObject({ operation: 'auth.admin.listUsers', message: 'Invalid API key' });
  });
});
