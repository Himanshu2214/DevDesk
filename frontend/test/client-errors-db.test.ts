// client_errors: written only through log_client_error(), throttled, unreadable from the app.
// @vitest-environment node
import { expect, it } from 'vitest';
import { freshDb } from './db';

it('stores at most 30 errors per user per hour and hides them from users', async () => {
  const t = await freshDb();
  const U = '11111111-1111-1111-1111-111111111111', S = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await t.user(U); await t.verify(S, U);
  await t.as(U, S);
  for (let i = 0; i < 35; i++) await t.db.query(`select log_client_error($1, $2, 'page', '#home', 'test')`, [`Error ${i}`, 'x'.repeat(5000)]);
  await expect(t.db.query('select * from client_errors')).rejects.toThrow(/permission denied/);
  await expect(t.db.query(`insert into client_errors ("Message") values ('forged')`)).rejects.toThrow(/permission denied/);
  await t.asRole('service_role');
  const r = await t.one<{ n: number; longest: number }>('select count(*)::int n, max(length("Stack"))::int longest from client_errors');
  expect(r).toEqual({ n: 30, longest: 2000 });
  await t.reset();
  await t.db.exec('reset role');
  await t.db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await t.db.exec('set role anon');
  await expect(t.db.query(`select log_client_error('x','','','','')`)).rejects.toThrow(/permission denied/);
}, 60_000);
