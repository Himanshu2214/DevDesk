// @mentions in comments (migration 20261121000000_mentions): only people who can see the ticket are notified.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const OWNER = '11111111-1111-1111-1111-111111111111', VERA = '22222222-2222-2222-2222-222222222222', EDA = '44444444-4444-4444-4444-444444444444', STRANGER = '55555555-5555-5555-5555-555555555555';
const SO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SV = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SE = 'dddddddd-dddd-dddd-dddd-dddddddddddd', SS = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

let t: Awaited<ReturnType<typeof freshDb>>;
let ticket = '';
const mentions = async (user: string, session: string) => {
  await t.as(user, session);
  return (await t.rows<{ Title: string; Body: string; Link: string }>(`select "Title","Body","Link" from notifications where "Kind" = 'mention' order by "CreatedAt"`));
};

beforeAll(async () => {
  t = await freshDb();
  await t.user(OWNER, 'olivia.owner@test.io', 'Olivia Owner'); await t.user(VERA, 'vera.v@test.io', 'Vera Viewer');
  await t.user(EDA, 'eda@test.io', ''); await t.user(STRANGER, 'stan@test.io', 'Stan Stranger');
  for (const [u, s] of [[OWNER, SO], [VERA, SV], [EDA, SE], [STRANGER, SS]]) await t.verify(s, u);
  await t.as(OWNER, SO);
  ticket = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Fix the invoice','GEN') returning "TicketUUID"`))!.TicketUUID;
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'vera.v@test.io', 'comment']);
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'eda@test.io', 'edit']);
  await t.acceptAll(VERA, SV); await t.acceptAll(EDA, SE);
}, 60_000);

describe('@mentions', () => {
  it('notifies a person on the ticket by first name, full name or email name – with the excerpt and a link', async () => {
    await t.as(OWNER, SO);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, '<p>@Vera can you check the totals? cc @eda</p>')`, [ticket]);
    expect(await mentions(VERA, SV)).toEqual([{ Title: 'Olivia Owner mentioned you on TK-1001', Body: '@Vera can you check the totals? cc @eda', Link: 'ticket/TK-1001' }]);
    expect((await mentions(EDA, SE)).map(n => n.Title)).toEqual(['Olivia Owner mentioned you on TK-1001']);
  });
  it('a collaborator can mention the owner; the author is never notified', async () => {
    await t.as(VERA, SV);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'Done, @olivia owner – and @vera.v too')`, [ticket]);
    expect((await mentions(OWNER, SO)).map(n => n.Title)).toEqual(['Vera Viewer mentioned you on TK-1001']);
    expect(await mentions(VERA, SV)).toHaveLength(1);                     // only the earlier mention by Olivia
  });
  it('nobody outside the ticket is notified, and a longer word is not a match', async () => {
    await t.as(OWNER, SO);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, '@Stan @stan @veral @edak please look')`, [ticket]);
    expect(await mentions(STRANGER, SS)).toEqual([]);
    expect(await mentions(VERA, SV)).toHaveLength(1);
    expect(await mentions(EDA, SE)).toHaveLength(1);
  });
  it('the trigger function cannot be called directly', async () => {
    await t.as(OWNER, SO);
    await expect(t.db.query('select notify_mentions()')).rejects.toThrow();
  });
});
