// Teams (shared projects): who sees and changes what, in the database itself.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const OWNER = '11111111-1111-1111-1111-111111111111', MEMBER = '22222222-2222-2222-2222-222222222222', OUTSIDER = '33333333-3333-3333-3333-333333333333';
const SO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SX = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SHARED = 'GST@11111111';

let t: Awaited<ReturnType<typeof freshDb>>;
let shared = '', privateTicket = '';

beforeAll(async () => {
  t = await freshDb();
  await t.user(OWNER, 'owner@test.io', 'Olivia Owner'); await t.user(MEMBER, 'member@test.io', 'Max Member'); await t.user(OUTSIDER, 'out@test.io');
  for (const [u, s] of [[OWNER, SO], [MEMBER, SM], [OUTSIDER, SX]]) await t.verify(s, u);
  await t.as(OWNER, SO);
  await t.db.query(`insert into projects ("Project","Name") values ('GST','GST & e-invoicing')`);
  shared = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Shared work','GST') returning "TicketUUID"`))!.TicketUUID;
  privateTicket = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Private','GEN') returning "TicketUUID"`))!.TicketUUID;
}, 60_000);

describe('sharing a project', () => {
  it('needs an existing account and your own project', async () => {
    await t.as(OWNER, SO);
    await expect(t.db.query(`select share_project('GST', 'nobody@test.io')`)).rejects.toThrow(/No SLATE·SPACE account/);
    await expect(t.db.query(`select share_project('GST', 'owner@test.io')`)).rejects.toThrow(/your own account/);
    await t.as(MEMBER, SM);
    await expect(t.db.query(`select share_project('GST', 'out@test.io')`)).rejects.toThrow(/Only your own projects/);
    await t.as(OWNER, SO);
    expect(await t.one(`select share_project('GST', ' Member@Test.io ') as name`)).toEqual({ name: 'Max Member' });
    expect(await t.rows('select email, name from project_members($1)', ['GST'])).toEqual([{ email: 'member@test.io', name: 'Max Member' }]);
  });
  it('shows the project to the member with a distinct code and who shared it', async () => {
    await t.as(MEMBER, SM);
    expect(await t.rows('select "Project","Name","SharedBy" from projects_v order by "Project"')).toEqual([
      { Project: 'GEN', Name: 'General', SharedBy: null },
      { Project: SHARED, Name: 'GST & e-invoicing', SharedBy: 'Olivia Owner' },
    ]);
    await t.as(OWNER, SO);
    expect(await t.one(`select "Members" from projects_v where "Project" = 'GST'`)).toEqual({ Members: 1 });
  });
});

describe('member access', () => {
  it('sees only the shared project\'s tickets', async () => {
    await t.as(MEMBER, SM);
    expect(await t.rows('select "TicketId","Project","ProjectName" from tickets_v')).toEqual([{ TicketId: 'TK-1001', Project: SHARED, ProjectName: 'GST & e-invoicing' }]);
    expect(await t.rows('select 1 from tickets where "TicketUUID" = $1', [privateTicket])).toEqual([]);
  });
  it('works on the ticket: status, time, notes', async () => {
    await t.as(MEMBER, SM);
    await t.db.query(`select set_status($1, 'PROG', 'Max')`, [shared]);
    await t.db.query(`insert into worklogs ("TicketUUID","Hours") values ($1, 2)`, [shared]);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'On it')`, [shared]);
    await t.as(OWNER, SO);
    expect(await t.one('select "Status", "LoggedHours" from tickets_v where "TicketUUID" = $1', [shared])).toEqual({ Status: 'PROG', LoggedHours: 2 });
    expect(await t.rows('select "Text" from notes where "TicketUUID" = $1', [shared])).toEqual([{ Text: 'On it' }]);
  });
  it('creates tickets in the shared project with the owner\'s numbering', async () => {
    await t.as(MEMBER, SM);
    const row = await t.one(`insert into tickets ("Title","Project") values ('From the member', $1) returning "TicketId", "Project", user_id`, [SHARED]);
    expect(row).toEqual({ TicketId: 'TK-1003', Project: 'GST', user_id: OWNER });
  });
  it('cannot move a shared ticket into a personal project, take it over or delete it', async () => {
    await t.as(MEMBER, SM);
    await expect(t.db.query(`update tickets set "Project" = 'GEN' where "TicketUUID" = $1`, [shared])).rejects.toThrow(/cannot move/);
    await expect(t.db.query(`update tickets set user_id = $2 where "TicketUUID" = $1`, [shared, MEMBER])).rejects.toThrow(/owner of a ticket/);
    expect(await t.rows('delete from tickets where "TicketUUID" = $1 returning 1', [shared])).toEqual([]);
  });
  it('keeps the member\'s other data private from the owner', async () => {
    await t.as(MEMBER, SM);
    const mine = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title") values ('Member private') returning "TicketUUID"`))!.TicketUUID;
    await t.as(OWNER, SO);
    expect(await t.rows('select 1 from tickets where "TicketUUID" = $1', [mine])).toEqual([]);
  });
  it('lets files on shared tickets be read by both', async () => {
    await t.as(MEMBER, SM);
    const att = (await t.one<{ AttUUID: string }>(`insert into attachments ("TicketUUID","FileName","MimeType","FileSize") values ($1,'s.png','image/png',10) returning "AttUUID"`, [shared]))!.AttUUID;
    await t.reset(); await t.db.query(`insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [`${MEMBER}/${att}`]);
    await t.as(OWNER, SO);
    expect(await t.rows(`select 1 from storage.objects where name = $1`, [`${MEMBER}/${att}`])).toHaveLength(1);
    await t.as(OUTSIDER, SX);
    expect(await t.rows(`select 1 from storage.objects where name = $1`, [`${MEMBER}/${att}`])).toEqual([]);
  });
});

describe('outsiders and leaving', () => {
  it('gives an outsider nothing', async () => {
    await t.as(OUTSIDER, SX);
    expect(await t.rows('select 1 from tickets_v')).toEqual([]);
    expect(await t.rows('select 1 from worklogs')).toEqual([]);
    await expect(t.db.query(`insert into tickets ("Title","Project") values ('x', $1)`, [SHARED])).rejects.toThrow(/no longer have access/);
    await expect(t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'x')`, [shared])).rejects.toThrow(/row-level security/);
  });
  it('ends access when the member leaves', async () => {
    await t.as(MEMBER, SM);
    await t.db.query('delete from project_shares where member_id = $1', [MEMBER]);
    expect(await t.rows('select 1 from tickets_v where "TicketUUID" = $1', [shared])).toEqual([]);
  });
});
