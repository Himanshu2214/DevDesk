// Sharing a single ticket: the other person gets that ticket and what is below it – nothing else, and no owner rights.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const OWNER = '11111111-1111-1111-1111-111111111111', MEMBER = '22222222-2222-2222-2222-222222222222', OUTSIDER = '33333333-3333-3333-3333-333333333333';
const SO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SX = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let t: Awaited<ReturnType<typeof freshDb>>;
let shared = '', other = '';

beforeAll(async () => {
  t = await freshDb();
  await t.user(OWNER, 'owner@test.io', 'Olivia Owner'); await t.user(MEMBER, 'member@test.io', 'Max Member'); await t.user(OUTSIDER, 'out@test.io');
  for (const [u, s] of [[OWNER, SO], [MEMBER, SM], [OUTSIDER, SX]]) await t.verify(s, u);
  await t.as(OWNER, SO);
  shared = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Fix the invoice','GEN') returning "TicketUUID"`))!.TicketUUID;
  other = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Same project, not shared','GEN') returning "TicketUUID"`))!.TicketUUID;
  await t.db.query(`insert into worklogs ("TicketUUID","WorkDate","Hours","Activity") values ($1, current_date, 2, 'DEV')`, [shared]);
}, 60_000);

describe('sharing one ticket', () => {
  it('only the owner shares it, with an existing account', async () => {
    await t.as(MEMBER, SM);
    await expect(t.db.query('select share_ticket($1, $2)', [shared, 'out@test.io'])).rejects.toThrow(/Only your own tickets/);
    await t.as(OWNER, SO);
    await expect(t.db.query('select share_ticket($1, $2)', [shared, 'nobody@test.io'])).rejects.toThrow(/No SLATE·SPACE account/);
    await expect(t.db.query('select share_ticket($1, $2)', [shared, 'owner@test.io'])).rejects.toThrow(/your own account/);
    expect(await t.one('select share_ticket($1, $2) as name', [shared, ' Member@Test.io '])).toEqual({ name: 'Max Member' });
    expect(await t.rows('select email, name from ticket_members($1)', [shared])).toEqual([{ email: 'member@test.io', name: 'Max Member' }]);
    expect(await t.one(`select "Shares","SharedBy" from tickets_v where "TicketUUID" = $1`, [shared])).toEqual({ Shares: 1, SharedBy: null });
  });

  it('the member sees that ticket and its time – not the rest of the project', async () => {
    await t.as(MEMBER, SM);
    const mine = await t.rows<{ Title: string; SharedBy: string; SharedVia: string }>(`select "Title","SharedBy","SharedVia" from tickets_v where user_id = $1`, [OWNER]);
    expect(mine).toEqual([{ Title: 'Fix the invoice', SharedBy: 'Olivia Owner', SharedVia: 'ticket' }]);
    expect(await t.rows('select "Hours" from worklogs where "TicketUUID" = $1', [shared])).toHaveLength(1);
    expect(await t.rows('select 1 from tickets where "TicketUUID" = $1', [other])).toHaveLength(0);
    await t.as(OUTSIDER, SX);
    expect(await t.rows('select 1 from tickets where user_id = $1', [OWNER])).toHaveLength(0);
  });

  it('the member edits and comments, but cannot delete or move it', async () => {
    await t.as(MEMBER, SM);
    await t.db.query(`update tickets set "Status" = 'PROG' where "TicketUUID" = $1`, [shared]);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'Looking at it')`, [shared]);
    await expect(t.db.query(`update tickets set "Project" = 'MINE' where "TicketUUID" = $1`, [shared])).rejects.toThrow(/cannot move/);
    await t.db.query('delete from tickets where "TicketUUID" = $1', [shared]);             // no row they may delete
    await t.as(OWNER, SO);
    expect(await t.one('select "Status" from tickets where "TicketUUID" = $1', [shared])).toEqual({ Status: 'PROG' });
    expect(await t.rows('select "Text" from notes where "TicketUUID" = $1', [shared])).toEqual([{ Text: 'Looking at it' }]);
  });

  it('the member can remove it from their list; then it is gone for them', async () => {
    await t.as(MEMBER, SM);
    await t.db.query('delete from ticket_shares where "TicketUUID" = $1 and member_id = $2', [shared, MEMBER]);
    expect(await t.rows('select 1 from tickets where "TicketUUID" = $1', [shared])).toHaveLength(0);
    await expect(t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'sneaky')`, [shared])).rejects.toThrow(/row-level security/);
    await t.as(OWNER, SO);
    expect(await t.one(`select "Shares" from tickets_v where "TicketUUID" = $1`, [shared])).toEqual({ Shares: 0 });
  });
});
