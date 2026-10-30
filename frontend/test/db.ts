// Runs all Supabase migrations in PGlite (Postgres compiled to WebAssembly) with small stand-ins for Supabase's
// auth and storage schemas, so the database rules and row level security can be tested without a Supabase project.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema auth, storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create publication supabase_realtime;
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  await db.exec('grant execute on all functions in schema auth to authenticated');

  const reset = () => db.exec('reset role');
  return {
    db,
    /** inserts a user into auth.users (the signup trigger then seeds lists and a project) */
    async user(id: string, email = `${id.slice(0, 4)}@test.io`, name = '') {
      await reset(); await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ full_name: name })]);
    },
    /** marks a session as having passed the emailed 2-step code */
    async verify(session: string, user: string) { await reset(); await db.query('insert into verified_sessions (session_id, user_id) values ($1, $2)', [session, user]) },
    /** continue as a signed-in user with the given JWT claims */
    async as(user: string, session: string, claims: Record<string, unknown> = {}) {
      await reset();
      await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [user, JSON.stringify({ sub: user, session_id: session, ...claims })]);
      await db.exec('set role authenticated');
    },
    async asRole(role: 'anon' | 'service_role') { await reset(); await db.exec(`set role ${role}`) },
    reset,
    async rows<T = Record<string, unknown>>(sql: string, params?: unknown[]) { return (await db.query<T>(sql, params)).rows },
    async one<T = Record<string, unknown>>(sql: string, params?: unknown[]) { return (await db.query<T>(sql, params)).rows[0] },
  };
}
