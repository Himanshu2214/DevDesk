// Share suggestions: only people you already share with, in either direction – never other accounts.
// @vitest-environment node
import { expect, it } from 'vitest';
import { freshDb } from './db';

it('suggests only people connected by a share', async () => {
  const t = await freshDb();
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333', D = '44444444-4444-4444-4444-444444444444';
  const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SA2 = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002';
  await t.user(A, 'asha@test.io', 'Asha Kumar'); await t.user(B, 'max@test.io', 'Max Member');
  await t.user(C, 'cem@test.io', 'Cem'); await t.user(D, 'stranger@test.io', 'Stranger');
  await t.verify(SA, A); await t.verify(SB, B);
  await t.as(A, SA);
  const tk = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('x','GEN') returning "TicketUUID"`))!.TicketUUID;
  await t.db.query('select share_ticket($1, $2)', [tk, 'max@test.io']);
  await t.db.query(`select share_project('GEN', 'cem@test.io')`);
  await t.acceptAll(B, SB); await t.as(A, SA);
  expect(await t.rows('select email, name from share_contacts()')).toEqual([{ email: 'cem@test.io', name: 'Cem' }, { email: 'max@test.io', name: 'Max Member' }]);
  await t.as(B, SB);                                                     // the other direction: who shared with me
  expect(await t.rows('select email from share_contacts()')).toEqual([{ email: 'asha@test.io' }]);
  await t.as(A, SA2);                                                    // second step not done: nothing
  expect(await t.rows('select email from share_contacts()')).toEqual([]);
}, 60_000);
