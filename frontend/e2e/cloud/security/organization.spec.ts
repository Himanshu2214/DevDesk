// Security 5, 6, 7: removing a member ends organization access at once but keeps direct shares; two organizations
// see nothing of each other; an ordinary member cannot make themselves admin or take the organization over.
import { expect, test } from '@playwright/test';
import { createUser, removeUsers, type TestUser } from '../cloud';
import { allowed, changesNothing, newAttachment, newTicket, refused, seesNothing, serverDownload, verified, type Api } from './api';

test.describe.configure({ mode: 'serial' });

let a1: TestUser, m1: TestUser, a2: TestUser, m2: TestUser, outsider: TestUser;
let A1: Api, M1: Api, A2: Api, M2: Api, X: Api;
let direct: string, inside: string, insideAtt: string, org2Ticket: string;
type Org = { id: string; name: string; admin: boolean; members: { userId: string; role: string }[]; invites: { email: string }[] } | null;
const myOrg = async (c: Api) => (await c.rpc('my_org')).data as Org;

test.beforeAll(async () => {
  a1 = await createUser('orgsone'); m1 = await createUser('orgsmember'); a2 = await createUser('orgstwo'); m2 = await createUser('orgsmembertwo'); outsider = await createUser('orgsoutside');
  [A1, M1, A2, M2, X] = await Promise.all([a1, m1, a2, m2, outsider].map(u => verified(u)));

  // a direct share made before any organization exists (an invitation the member accepts)
  direct = (await newTicket(A1, 'E2E sec direct')).TicketUUID;
  await allowed('direct share', A1.rpc('share_ticket', { p_ticket: direct, p_email: m1.email, p_access: 'comment' }));
  await allowed('member accepts the direct share', M1.rpc('answer_invitation', { p_kind: 'ticket', p_ref: direct, p_accept: true }));

  // organization 1: admin a1, member m1
  await allowed('a1 creates organization 1', A1.rpc('create_org', { p_name: 'E2E Sec Org One' }));
  await allowed('a1 invites m1', A1.rpc('invite_to_org', { p_email: m1.email, p_role: 'member' }));
  const org1 = (await myOrg(A1))!.id;
  await allowed('m1 joins', M1.rpc('answer_invitation', { p_kind: 'org', p_ref: org1, p_accept: true }));
  // organization 2: admin a2, member m2
  await allowed('a2 creates organization 2', A2.rpc('create_org', { p_name: 'E2E Sec Org Two' }));
  await allowed('a2 invites m2', A2.rpc('invite_to_org', { p_email: m2.email, p_role: 'member' }));
  await allowed('m2 joins', M2.rpc('answer_invitation', { p_kind: 'org', p_ref: (await myOrg(A2))!.id, p_accept: true }));
  org2Ticket = (await newTicket(A2, 'E2E sec org two private')).TicketUUID;
  await allowed('a2 shares inside organization 2', A2.rpc('share_ticket', { p_ticket: org2Ticket, p_email: m2.email, p_access: 'edit' }));

  // inside organization 1 a share applies at once; with a file
  inside = (await newTicket(A1, 'E2E sec inside')).TicketUUID;
  expect(await allowed('share inside organization 1', A1.rpc('share_ticket', { p_ticket: inside, p_email: m1.email, p_access: 'edit' }))).toBe('active');
  insideAtt = await newAttachment(A1, a1.id, inside);
  // a pending invitation an ordinary member must not be able to cancel
  await allowed('a1 invites the outsider', A1.rpc('invite_to_org', { p_email: outsider.email, p_role: 'member' }));
});
test.afterAll(async () => { await removeUsers(m1, a1, m2, a2, outsider) });

test('7. an ordinary member cannot raise themselves, invite, change settings, cancel invitations or remove others', async () => {
  await refused('member makes themselves admin', M1.rpc('set_org_member', { p_user: m1.id, p_role: 'admin' }));
  await refused('member demotes the admin', M1.rpc('set_org_member', { p_user: a1.id, p_role: 'member' }));
  await refused('member invites someone as admin', M1.rpc('invite_to_org', { p_email: m2.email, p_role: 'admin' }));
  await refused('member renames the organization / opens sharing', M1.rpc('set_org_settings', { p_name: 'taken over', p_only_internal: true }));
  await refused('member removes the admin', M1.rpc('remove_org_member', { p_user: a1.id }));
  await refused('member creates a second organization', M1.rpc('create_org', { p_name: 'second' }));
  await M1.rpc('cancel_org_invite', { p_email: outsider.email });
  await refused('member writes org_members directly', M1.from('org_members').insert({ OrgUUID: (await myOrg(M1))!.id, user_id: m1.id, Role: 'admin' }));
  await changesNothing('member edits org_members directly', M1.from('org_members').update({ Role: 'admin' }).eq('user_id', m1.id).select());
  await changesNothing('member edits the organization directly', M1.from('organizations').update({ Name: 'taken over' }).eq('OrgUUID', (await myOrg(M1))!.id).select());
  await seesNothing('member reads invitations directly', M1.from('org_invites').select('*'));
  const org = (await myOrg(A1))!;
  expect(org.name).toBe('E2E Sec Org One');
  expect(org.members.find(x => x.userId === m1.id)?.role).toBe('member');
  expect(org.members.find(x => x.userId === a1.id)?.role).toBe('admin');
  expect(org.invites.map(i => i.email), 'the invitation the member tried to cancel is still there').toContain(outsider.email);
  expect((await myOrg(M1))!.invites, 'a member does not see the invitation list').toEqual([]);
});

test('6. two organizations see nothing of each other', async () => {
  const o1 = (await myOrg(M1))!, o2 = (await myOrg(M2))!;
  expect(o1.id).not.toBe(o2.id);
  expect(o1.members.map(x => x.userId).sort()).toEqual([a1.id, m1.id].sort());
  const contacts = ((await M1.rpc('share_contacts')).data as { email: string }[]).map(x => x.email);
  expect(contacts).toContain(a1.email);
  expect(contacts).not.toContain(a2.email);
  expect(contacts).not.toContain(m2.email);
  await seesNothing('org 1 member reads the name of org 2\'s admin', M1.rpc('user_label', { p_user: a2.id }));
  await seesNothing('org 1 member reads org 2\'s ticket', M1.from('tickets').select('*').eq('TicketUUID', org2Ticket));
  await seesNothing('org 1 admin reads org 2\'s ticket', A1.from('tickets').select('*').eq('TicketUUID', org2Ticket));
  await seesNothing('org 1 admin reads org 2\'s shares', A1.from('ticket_shares').select('*').eq('TicketUUID', org2Ticket));
  await seesNothing('org 1 member reads org 2 directly', M1.from('organizations').select('*'));
  await seesNothing('org 1 member reads org 2\'s members directly', M1.from('org_members').select('*'));
  await refused('org 2 admin promotes a member of org 1', A2.rpc('set_org_member', { p_user: m1.id, p_role: 'admin' }));
  await A2.rpc('remove_org_member', { p_user: m1.id });
  expect((await myOrg(M1))?.id, 'org 2\'s admin cannot remove org 1\'s member').toBe(o1.id);
  await refused('org 1 member joins org 2 without an invitation', M1.rpc('answer_invitation', { p_kind: 'org', p_ref: o2.id, p_accept: true }));
  await refused('org 2 admin shares into org 1 "inside" – it is an invitation, not access', A2.rpc('share_ticket', { p_ticket: org2Ticket, p_email: m1.email, p_access: 'edit' })
    .then(async r => r.error ? r : (r.data === 'pending' ? { data: null, error: { message: 'pending invitation (expected)' } } : r)));
  await seesNothing('…so the org 1 member still cannot read it', M1.from('tickets').select('*').eq('TicketUUID', org2Ticket));
  await allowed('the org 1 member declines', M1.rpc('answer_invitation', { p_kind: 'ticket', p_ref: org2Ticket, p_accept: false }));
});

test('6. outside someone\'s organization: same_org reveals nothing (F6)', async () => {
  await seesNothing('org 1 member asks whether org 2\'s people share an organization', M1.rpc('same_org', { a: a2.id, b: m2.id }));
});

test('5. removing a member ends organization access at once – direct shares stay', async () => {
  expect((await M1.from('tickets').select('TicketUUID').eq('TicketUUID', inside)).data).toHaveLength(1);
  expect(await (await M1.storage.from('attachments').download(`${a1.id}/${insideAtt}`)).data?.text()).toBe('e2e!!');
  await allowed('member edits the inside ticket', M1.from('tickets').update({ Title: 'E2E sec inside (edited)' }).eq('TicketUUID', inside));

  await allowed('admin removes the member', A1.rpc('remove_org_member', { p_user: m1.id }));

  await seesNothing('removed member reads the inside ticket', M1.from('tickets').select('*').eq('TicketUUID', inside));
  await changesNothing('removed member edits the inside ticket', M1.from('tickets').update({ Title: 'after removal' }).eq('TicketUUID', inside).select());
  await refused('removed member comments on it', M1.from('notes').insert({ TicketUUID: inside, Text: 'after removal' }));
  await refused('removed member downloads its file (server-checked path)', serverDownload(M1, `${a1.id}/${insideAtt}`));
  await refused('removed member creates a signed link', M1.storage.from('attachments').createSignedUrl(`${a1.id}/${insideAtt}`, 60));
  expect(await myOrg(M1)).toBeNull();
  expect((await myOrg(A1))!.members.map(x => x.userId)).toEqual([a1.id]);
  // the direct share made outside the organization is untouched
  expect((await M1.from('tickets').select('TicketUUID').eq('TicketUUID', direct)).data).toHaveLength(1);
  await allowed('the direct share still allows comments', M1.from('notes').insert({ TicketUUID: direct, Text: 'still shared directly' }));
  expect((await A1.from('ticket_shares').select('member_id, Via').eq('TicketUUID', direct)).data).toEqual([{ member_id: m1.id, Via: 'direct' }]);
  expect((await A1.from('ticket_shares').select('member_id').eq('TicketUUID', inside)).data).toEqual([]);
  expect((await A1.from('tickets').select('Title').eq('TicketUUID', inside).single()).data?.Title).toBe('E2E sec inside (edited)');
});
