// trusted_browsers: server only, cleaned of expired tokens, gone with the account; phone approval tables removed.
// @vitest-environment node
import { expect, it } from 'vitest';
import { freshDb } from './db';

it('is reachable only by the server and cleans up', async () => {
  const t = await freshDb();
  const U = '11111111-1111-1111-1111-111111111111', S = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await t.user(U); await t.verify(S, U);
  await t.as(U, S);
  await expect(t.db.query('select * from trusted_browsers')).rejects.toThrow(/permission denied/);
  await expect(t.db.query(`insert into trusted_browsers (token_hash, user_id, expires_at) values ('x', $1, now() + interval '1 day')`, [U])).rejects.toThrow(/permission denied/);
  await t.asRole('service_role');
  await t.db.query(`insert into trusted_browsers (token_hash, user_id, expires_at) values ('old', $1, now() - interval '1 hour')`, [U]);
  await t.db.query(`insert into trusted_browsers (token_hash, user_id, expires_at) values ('new', $1, now() + interval '24 hours')`, [U]);
  expect(await t.rows('select token_hash from trusted_browsers')).toEqual([{ token_hash: 'new' }]);   // the expired one went
  await t.db.query('select delete_user_data($1)', [U]);
  expect(await t.rows('select token_hash from trusted_browsers')).toEqual([]);
  await t.reset();
  expect(await t.rows(`select table_name from information_schema.tables where table_name in ('push_devices', 'login_approvals')`)).toEqual([]);
}, 60_000);
