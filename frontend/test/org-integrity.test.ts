// Organization ownership and sharing integrity (migration 20261117000000_org_integrity).
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SC = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
let t: Awaited<ReturnType<typeof freshDb>>;
let ticketA = '', ticketB = '', directA = '';

/** A (admin) and B in "Team"; C is joined in the tests that need three members */
beforeEach(async () => {
  t = await freshDb();
  await t.user(A, 'a@team.io', 'Asha'); await t.user(B, 'b@team.io', 'Ben'); await t.user(C, 'c@team.io', 'Cara');
  for (const [u, s] of [[A, SA], [B, SB], [C, SC]]) await t.verify(s, u);
  await t.as(A, SA);
  directA = (await t.one<{ id: string }>(`insert into tickets ("Title","Project") values ('Shared before the team','GEN') returning "TicketUUID" as id`))!.id;
  await t.db.query('select share_ticket($1, $2)', [directA, 'b@team.io']);          // before any organization: an invitation
  await t.acceptAll(B, SB);
  await t.as(A, SA);
  await t.db.query(`select create_org('Team')`);
  await t.db.query(`select invite_to_org('b@team.io')`);
  await t.acceptAll(B, SB);
  await t.as(A, SA);
  ticketA = (await t.one<{ id: string }>(`insert into tickets ("Title","Project") values ('Team ticket','GEN') returning "TicketUUID" as id`))!.id;
  await t.db.query('select share_ticket($1, $2)', [ticketA, 'b@team.io']);
  await t.db.query(`select share_project('GEN', 'b@team.io', 'view')`);
  await t.as(B, SB);
  ticketB = (await t.one<{ id: string }>(`insert into tickets ("Title","Project") values ('Ben ticket','GEN') returning "TicketUUID" as id`))!.id;
  await t.db.query('select share_ticket($1, $2)', [ticketB, 'a@team.io']);
}, 60_000);

const vias = async () => { await t.reset(); return t.rows<{ title: string; via: string }>(
  `select t."Title" as title, s."Via" as via from ticket_shares s join tickets t on t."TicketUUID" = s."TicketUUID" order by 1`) };

describe('how a share came about', () => {
  it('inside the organization: org; an accepted outside invitation: direct', async () => {
    expect(await vias()).toEqual([{ title: 'Ben ticket', via: 'org' }, { title: 'Shared before the team', via: 'direct' }, { title: 'Team ticket', via: 'org' }]);
    expect(await t.one(`select "Via" from project_shares`)).toEqual({ Via: 'org' });
  });
});

describe('leaving or being removed', () => {
  it('removes only the shares that existed through the organization, both directions, and tells the person', async () => {
    await t.as(A, SA);
    await t.db.query('select remove_org_member($1)', [B]);
    expect(await vias()).toEqual([{ title: 'Shared before the team', via: 'direct' }]);
    expect(await t.one('select count(*)::int n from project_shares')).toEqual({ n: 0 });
    await t.as(B, SB);
    expect(await t.rows('select "Title" from tickets_v where user_id = $1', [A])).toEqual([{ Title: 'Shared before the team' }]);
    expect(await t.one(`select "Kind","Title","Body" from notifications where "Kind" = 'org-removed'`))
      .toEqual({ Kind: 'org-removed', Title: 'You were removed from Team', Body: '3 item(s) shared inside the organization are no longer shared with you or by you.' });
  });

  it('leaving yourself does the same; others in the organization keep their shares with each other', async () => {
    await t.as(A, SA);
    await t.db.query(`select invite_to_org('c@team.io')`);
    await t.acceptAll(C, SC);
    await t.as(A, SA);
    await t.db.query('select share_ticket($1, $2)', [ticketA, 'c@team.io']);
    await t.as(B, SB);
    await t.db.query('select remove_org_member($1)', [B]);                            // Ben leaves
    expect((await vias()).map(v => v.title)).toEqual(['Shared before the team', 'Team ticket']);   // A→C stays
    expect(await t.one(`select count(*)::int n from ticket_shares where member_id = $1`, [C])).toEqual({ n: 1 });
    await t.as(B, SB);
    expect(await t.one(`select "Kind" from notifications where "Kind" = 'org-left'`)).toEqual({ Kind: 'org-left' });
  });
});

describe('roles', () => {
  it('cannot change someone outside the organization; never leaves it without an admin', async () => {
    await t.as(A, SA);
    await expect(t.db.query(`select set_org_member($1, 'admin')`, [C])).rejects.toThrow(/Not a member/);
    await expect(t.db.query(`select set_org_member($1, 'member')`, [A])).rejects.toThrow(/at least one admin/);
    await expect(t.db.query('select remove_org_member($1)', [A])).rejects.toThrow(/someone else an admin/);
  });
});

describe('deleting an account', () => {
  it('the only admin: the longest-standing member becomes admin and is told', async () => {
    await t.asRole('service_role');
    await t.db.query('select delete_user_data($1)', [A]);
    await t.reset();
    expect(await t.rows(`select user_id, "Role" from org_members`)).toEqual([{ user_id: B, Role: 'admin' }]);
    expect(await t.one(`select "Kind" from notifications where user_id = $1 and "Kind" = 'org-admin'`, [B])).toEqual({ Kind: 'org-admin' });
    expect(await t.one('select count(*)::int n from ticket_shares')).toEqual({ n: 0 });    // A's shares went with A
    await t.as(B, SB);
    expect((await t.one<{ o: { name: string; admin: boolean } }>('select my_org() as o'))!.o).toMatchObject({ name: 'Team', admin: true });
  });

  it('the last member: the organization goes too', async () => {
    await t.as(A, SA);
    await t.db.query(`select set_org_member($1, 'admin')`, [B]);
    await t.db.query('select remove_org_member($1)', [A]);
    await t.asRole('service_role');
    await t.db.query('select delete_user_data($1)', [B]);
    await t.reset();
    expect(await t.one('select (select count(*) from organizations)::int o, (select count(*) from org_members)::int m')).toEqual({ o: 0, m: 0 });
  });
});
