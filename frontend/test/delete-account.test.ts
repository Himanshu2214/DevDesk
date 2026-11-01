// Deleting an account (as Supabase's auth service does, with rights on the auth schema only) removes all of its data.
// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { freshDb } from './db';

it('removes every row of a deleted user, sample data included', async () => {
  const t = await freshDb();
  const U = '55555555-5555-5555-5555-555555555555';
  await t.user(U, 'himanshusudra30@gmail.com', 'H S');
  await t.reset();
  await t.db.exec(readFileSync('../supabase/seed/sample-data.sql', 'utf8'));
  await t.db.query(`insert into user_settings (user_id, "DigestEnabled") values ($1, true)`, [U]);
  await t.db.query(`insert into calendar_tokens (user_id, refresh_token) values ($1, 'x')`, [U]);
  await t.db.exec(`create role auth_admin nologin; grant usage on schema auth to auth_admin; grant select, delete on auth.users to auth_admin; set role auth_admin`);
  await t.db.query('delete from auth.users where id = $1', [U]);
  await t.reset();
  const left = await t.one<Record<string, number>>(`select (select count(*) from tickets)::int t, (select count(*) from worklogs)::int w, (select count(*) from transports)::int tr,
    (select count(*) from articles)::int a, (select count(*) from projects)::int p, (select count(*) from user_settings)::int s, (select count(*) from calendar_tokens)::int c`);
  expect(left).toEqual({ t: 0, w: 0, tr: 0, a: 0, p: 0, s: 0, c: 0 });
}, 60000);

it('delete_user_data removes the rows first, only for the service role', async () => {
  const t = await freshDb();
  const U = '55555555-5555-5555-5555-555555555555';
  await t.user(U, 'himanshusudra30@gmail.com', 'H S');
  await t.reset();
  await t.db.exec(readFileSync('../supabase/seed/sample-data.sql', 'utf8'));
  await t.db.query(`insert into user_settings (user_id, "DigestEnabled") values ($1, true)`, [U]);
  await t.db.query(`insert into calendar_tokens (user_id, refresh_token) values ($1, 'x')`, [U]);
  await t.db.exec('set role authenticated');
  await expect(t.db.query('select public.delete_user_data($1)', [U])).rejects.toThrow(/permission denied/);
  await t.asRole('service_role');
  await t.db.query('select public.delete_user_data($1)', [U]);
  await t.reset();
  const left = await t.one<{ n: number }>(`select (select count(*) from tickets) + (select count(*) from worklogs) + (select count(*) from transports)
    + (select count(*) from articles) + (select count(*) from projects) + (select count(*) from user_settings) + (select count(*) from calendar_tokens) as n`);
  expect(Number(left.n)).toBe(0);
  await t.db.query('delete from auth.users where id = $1', [U]);
}, 60000);
