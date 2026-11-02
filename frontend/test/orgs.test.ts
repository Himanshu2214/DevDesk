// Organizations, share invitations and notifications – in the database itself.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333', N = '44444444-4444-4444-4444-444444444444';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SC = 'cccccccc-cccc-cccc-cccc-cccccccccccc', SN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let t: Awaited<ReturnType<typeof freshDb>>;
let ticket = '';
const notes = async (u: string, s: string) => { await t.as(u, s); return (await t.rows<{ Kind: string; Title: string }>('select "Kind","Title" from notifications order by "CreatedAt"')) };

beforeAll(async () => {
  t = await freshDb();
  await t.user(A, 'asha@team.io', 'Asha Admin'); await t.user(B, 'ben@team.io', 'Ben Teammate'); await t.user(C, 'cara@outside.io', 'Cara Outside');
  for (const [u, s] of [[A, SA], [B, SB], [C, SC]]) await t.verify(s, u);
  await t.as(A, SA);
  ticket = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Team work','GEN') returning "TicketUUID"`))!.TicketUUID;
}, 60_000);

describe('organization', () => {
  it('an admin creates it and invites; the person accepts', async () => {
    await t.as(A, SA);
    await t.db.query(`select create_org('SAP team')`);
    await expect(t.db.query(`select create_org('Another')`)).rejects.toThrow(/already in an organization/);
    expect(await t.one(`select invite_to_org('Ben@Team.io') as r`)).toEqual({ r: 'invited' });
    expect(await t.one(`select invite_to_org('newbie@team.io') as r`)).toEqual({ r: 'no-account' });
    expect((await notes(B, SB)).map(n => n.Kind)).toEqual(['org-invite']);
    await t.as(B, SB);
    await expect(t.db.query(`select invite_to_org('x@y.io')`)).rejects.toThrow(/Only an admin/);
    const [inv] = await t.rows<{ kind: string; ref: string; title: string; from_name: string }>('select * from my_invitations()');
    expect(inv).toMatchObject({ kind: 'org', title: 'SAP team', from_name: 'Asha Admin' });
    await t.db.query('select answer_invitation($1, $2, true)', [inv.kind, inv.ref]);
    const org = (await t.one<{ o: { name: string; admin: boolean; members: { email: string; role: string }[] } }>('select my_org() as o'))!.o;
    expect(org).toMatchObject({ name: 'SAP team', admin: false });
    expect(org.members.map(m => [m.email, m.role])).toEqual([['asha@team.io', 'admin'], ['ben@team.io', 'member']]);
    expect((await notes(A, SA)).map(n => n.Kind)).toContain('org-joined');
  });

  it('someone invited before having an account sees it after signing up', async () => {
    await t.user(N, 'newbie@team.io', 'New Person'); await t.verify(SN, N);
    await t.as(N, SN);
    expect(await t.rows('select kind, title from my_invitations()')).toEqual([{ kind: 'org', title: 'SAP team' }]);
  });
});

describe('sharing inside and outside', () => {
  it('inside the organization a share applies at once and tells the person', async () => {
    await t.as(A, SA);
    expect(await t.one('select share_ticket($1, $2) as s', [ticket, 'ben@team.io'])).toEqual({ s: 'active' });
    await t.as(B, SB);
    expect(await t.rows('select "Title" from tickets_v where "TicketUUID" = $1', [ticket])).toEqual([{ Title: 'Team work' }]);
    expect((await notes(B, SB)).at(-1)).toMatchObject({ Kind: 'shared' });
    expect(await t.rows('select email from share_contacts()')).toEqual([{ email: 'asha@team.io' }]);   // organization members are suggested
  });

  it('outside it starts as an invitation: no access until accepted; declining removes it', async () => {
    await t.as(A, SA);
    expect(await t.one('select share_ticket($1, $2, $3) as s', [ticket, 'cara@outside.io', 'comment'])).toEqual({ s: 'pending' });
    expect(await t.rows('select email, access, status from ticket_members($1) where email = $2', [ticket, 'cara@outside.io']))
      .toEqual([{ email: 'cara@outside.io', access: 'comment', status: 'pending' }]);
    await t.as(C, SC);
    expect(await t.rows('select 1 from tickets where "TicketUUID" = $1', [ticket])).toHaveLength(0);
    await expect(t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'early')`, [ticket])).rejects.toThrow(/row-level security/);
    const [inv] = await t.rows<{ kind: string; ref: string; from_name: string; access: string }>('select * from my_invitations()');
    expect(inv).toMatchObject({ kind: 'ticket', from_name: 'Asha Admin', access: 'comment' });
    await t.db.query('select answer_invitation($1, $2, false)', [inv.kind, inv.ref]);
    expect(await t.rows('select * from my_invitations()')).toEqual([]);
    expect((await notes(A, SA)).at(-1)).toMatchObject({ Kind: 'declined', Title: 'Cara Outside declined TK-1001' });
  });

  it('accepting gives access', async () => {
    await t.as(A, SA);
    await t.db.query('select share_ticket($1, $2)', [ticket, 'cara@outside.io']);
    await t.acceptAll(C, SC);
    expect(await t.rows('select "Title" from tickets_v where "TicketUUID" = $1', [ticket])).toEqual([{ Title: 'Team work' }]);
    expect((await notes(A, SA)).at(-1)).toMatchObject({ Kind: 'accepted' });
  });

  it('"only share inside" blocks new outside shares; admins only', async () => {
    await t.as(B, SB);
    await expect(t.db.query(`select set_org_settings('SAP team', true)`)).rejects.toThrow(/Only an admin/);
    await t.as(A, SA);
    await t.db.query(`select set_org_settings('SAP team', true)`);
    const other = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Private','GEN') returning "TicketUUID"`))!.TicketUUID;
    await expect(t.db.query('select share_ticket($1, $2)', [other, 'cara@outside.io'])).rejects.toThrow(/Sharing outside SAP team is switched off/);
    expect(await t.one('select share_ticket($1, $2) as s', [other, 'ben@team.io'])).toEqual({ s: 'active' });
  });
});

describe('membership rules', () => {
  it('the last admin hands over before leaving; members can leave', async () => {
    await t.as(A, SA);
    await expect(t.db.query('select remove_org_member($1)', [A])).rejects.toThrow(/someone else an admin/);
    await expect(t.db.query(`select set_org_member($1, 'member')`, [A])).rejects.toThrow(/at least one admin/);
    await t.db.query(`select set_org_member($1, 'admin')`, [B]);
    await t.db.query('select remove_org_member($1)', [A]);
    expect(await t.one('select my_org() as o')).toEqual({ o: null });
    await t.as(B, SB);
    expect((await t.one<{ o: { members: unknown[] } }>('select my_org() as o'))!.o.members).toHaveLength(1);
  });
});
