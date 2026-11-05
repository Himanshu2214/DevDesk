// Security 1, 8 and the 2-step sign-in: one user's private data is invisible and untouchable for another user,
// for anonymous visitors and for a session that has not passed the emailed code. Real API, anon key, real sessions.
import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { createUser, removeUsers, type TestUser } from '../cloud';
import { allowed, anonymous, changesNothing, newAttachment, newTicket, passwordOnly, refused, seesNothing, verified, type Api } from './api';

test.describe.configure({ mode: 'serial' });

let a: TestUser, b: TestUser, c: TestUser;
let A: Api, B: Api, anon: Api;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  a = await createUser('seca'); b = await createUser('secb'); c = await createUser('secc');
  A = await verified(a); B = await verified(b); anon = await anonymous();

  // A's private data, written through the API as the app writes it
  const t = await newTicket(A, 'E2E private of A');
  ids.ticket = t.TicketUUID; ids.ticketId = t.TicketId;
  ids.ticket2 = (await newTicket(A, 'E2E second of A')).TicketUUID;
  ids.note = (await allowed<{ NoteUUID: string }>('A comments', A.from('notes').insert({ TicketUUID: ids.ticket, Text: 'private note' }).select('NoteUUID').single())).NoteUUID;
  ids.worklog = (await allowed<{ WorklogUUID: string }>('A logs time', A.from('worklogs').insert({ TicketUUID: ids.ticket, Hours: 1.5 }).select('WorklogUUID').single())).WorklogUUID;
  ids.check = (await allowed<{ ItemUUID: string }>('A adds a checklist item', A.from('checklist_items').insert({ TicketUUID: ids.ticket, Text: 'private' }).select('ItemUUID').single())).ItemUUID;
  ids.test = (await allowed<{ TestUUID: string }>('A adds a test case', A.from('test_cases').insert({ TicketUUID: ids.ticket, TestName: 'private' }).select('TestUUID').single())).TestUUID;
  ids.acc = (await allowed<{ AccUUID: string }>('A adds a criterion', A.from('acceptance').insert({ TicketUUID: ids.ticket, Text: 'private' }).select('AccUUID').single())).AccUUID;
  ids.transport = (await allowed<{ TransportUUID: string }>('A adds a transport', A.from('transports').insert({ TrKorr: 'DEVK900001', TicketUUID: ids.ticket }).select('TransportUUID').single())).TransportUUID;
  ids.article = (await allowed<{ ArticleUUID: string }>('A writes an article', A.from('articles').insert({ Title: 'private article' }).select('ArticleUUID').single())).ArticleUUID;
  ids.template = (await allowed<{ TemplateUUID: string }>('A saves a template', A.from('ticket_templates').insert({ Name: 'private', Data: {} }).select('TemplateUUID').single())).TemplateUUID;
  ids.object = (await allowed<{ ObjectUUID: string }>('A adds an object', A.from('tech_objects').insert({ ObjectType: 'PROG', ObjectName: 'ZPRIVATE' }).select('ObjectUUID').single())).ObjectUUID;
  ids.link = (await allowed<{ LinkUUID: string }>('A links two tickets', A.from('ticket_links').insert({ FromTicket: ids.ticket, ToTicket: ids.ticket2 }).select('LinkUUID').single())).LinkUUID;
  await allowed('A saves settings', A.from('user_settings').upsert({ user_id: a.id, CalendarUrl: 'https://example.com/private.ics' }));
  await allowed('A changes the status', A.rpc('set_status', { p_ticket: ids.ticket, p_status: 'PROG', p_by: 'A' }));
  await allowed('A changes the title', A.from('tickets').update({ Title: 'E2E private of A (renamed)' }).eq('TicketUUID', ids.ticket));
  ids.att = await newAttachment(A, a.id, ids.ticket);
});
test.afterAll(async () => { await removeUsers(a, b, c) });

const PRIVATE: [string, string, string][] = [
  ['tickets', 'TicketUUID', 'ticket'], ['tickets_v', 'TicketUUID', 'ticket'], ['notes', 'NoteUUID', 'note'], ['worklogs', 'WorklogUUID', 'worklog'],
  ['checklist_items', 'ItemUUID', 'check'], ['test_cases', 'TestUUID', 'test'], ['acceptance', 'AccUUID', 'acc'], ['attachments', 'AttUUID', 'att'],
  ['transports', 'TransportUUID', 'transport'], ['articles', 'ArticleUUID', 'article'], ['ticket_templates', 'TemplateUUID', 'template'],
  ['tech_objects', 'ObjectUUID', 'object'], ['ticket_links', 'LinkUUID', 'link'], ['ticket_events', 'TicketUUID', 'ticket'], ['ticket_changes', 'TicketUUID', 'ticket'],
];

test('1. another user reads none of A\'s private rows, in any table or view', async () => {
  for (const [table, key, id] of PRIVATE) await seesNothing(`B reads A's ${table}`, B.from(table).select('*').eq(key, ids[id]));
  for (const table of ['projects', 'projects_v', 'value_items', 'counters', 'user_settings', 'notifications', 'ticket_seen'])
    await seesNothing(`B reads A's ${table}`, B.from(table).select('*').eq('user_id', a.id));
  // A's own session sees them (the rows exist, so the checks above mean something)
  expect((await A.from('ticket_events').select('EventUUID').eq('TicketUUID', ids.ticket)).data?.length).toBeGreaterThan(0);
  expect((await A.from('ticket_changes').select('ChangeUUID').eq('TicketUUID', ids.ticket)).data?.length).toBeGreaterThan(0);
  expect((await A.from('user_settings').select('CalendarUrl').eq('user_id', a.id).single()).data?.CalendarUrl).toContain('private.ics');
});

test('1. another user changes and deletes nothing of A\'s', async () => {
  for (const [table, key, id] of PRIVATE.filter(([t]) => !['tickets_v', 'ticket_changes', 'ticket_events'].includes(t))) {
    await changesNothing(`B updates A's ${table}`, B.from(table).update({ user_id: b.id }).eq(key, ids[id]).select());
    await changesNothing(`B deletes A's ${table}`, B.from(table).delete().eq(key, ids[id]).select());
  }
  await changesNothing('B updates A\'s settings', B.from('user_settings').update({ CalendarUrl: 'https://evil.example/x.ics' }).eq('user_id', a.id).select());
  await changesNothing('B renames A\'s project', B.from('projects').update({ Name: 'taken' }).eq('user_id', a.id).select());
  await changesNothing('B deletes A\'s projects', B.from('projects').delete().eq('user_id', a.id).select());
  // everything is still there and unchanged for A
  expect((await A.from('tickets').select('Title, user_id').eq('TicketUUID', ids.ticket).single()).data).toEqual({ Title: 'E2E private of A (renamed)', user_id: a.id });
  for (const [table, key, id] of PRIVATE.filter(([t]) => !['tickets_v', 'ticket_changes', 'ticket_events'].includes(t)))
    expect((await A.from(table).select(key).eq(key, ids[id])).data, `A's ${table} row survives`).toHaveLength(1);
  expect((await A.from('user_settings').select('CalendarUrl').eq('user_id', a.id).single()).data?.CalendarUrl).toContain('private.ics');
});

test('1. another user cannot attach rows to A\'s ticket or call ticket functions on it', async () => {
  await refused('B comments on A\'s ticket', B.from('notes').insert({ TicketUUID: ids.ticket, Text: 'x' }));
  await refused('B logs time on A\'s ticket', B.from('worklogs').insert({ TicketUUID: ids.ticket, Hours: 1 }));
  await refused('B adds a checklist item', B.from('checklist_items').insert({ TicketUUID: ids.ticket, Text: 'x' }));
  await refused('B adds an attachment row', B.from('attachments').insert({ TicketUUID: ids.ticket, FileName: 'x' }));
  await refused('B links A\'s ticket', B.from('ticket_links').insert({ FromTicket: ids.ticket, ToTicket: ids.ticket2 }));
  await refused('B adds a transport to A\'s ticket', B.from('transports').insert({ TrKorr: 'DEVK900002', TicketUUID: ids.ticket }));
  await refused('B changes the status of A\'s ticket', B.rpc('set_status', { p_ticket: ids.ticket, p_status: 'DONE', p_by: 'B' }));
  await refused('B shares A\'s ticket', B.rpc('share_ticket', { p_ticket: ids.ticket, p_email: c.email, p_access: 'edit' }));
  await refused('B marks A\'s ticket as seen', B.rpc('mark_ticket_seen', { p_ticket: ids.ticket }));
  await seesNothing('B lists the people on A\'s ticket', B.rpc('ticket_members', { p_ticket: ids.ticket }));
  await seesNothing('B lists the changes of A\'s ticket', B.rpc('ticket_change_list', { p_ticket: ids.ticket }));
  await seesNothing('B asks its access level', B.rpc('ticket_access', { p_ticket: ids.ticket }));
  await seesNothing('B asks A\'s name', B.rpc('user_label', { p_user: a.id }));
  await seesNothing('B lists the people of A\'s project', B.rpc('project_people', { p_key: `GEN@${a.id.slice(0, 8)}` }));
  const changes = (await A.from('ticket_changes').select('ChangeUUID').eq('TicketUUID', ids.ticket)).data ?? [];
  await refused('B undoes a change on A\'s ticket', B.rpc('undo_ticket_change', { p_change: changes[0]?.ChangeUUID }));
  expect((await A.from('tickets').select('Status').eq('TicketUUID', ids.ticket).single()).data?.Status).toBe('PROG');
});

test('1. another user cannot read, overwrite or delete A\'s files', async () => {
  const path = `${a.id}/${ids.att}`;
  await refused('B downloads A\'s file', B.storage.from('attachments').download(path));
  await refused('B creates a link to A\'s file', B.storage.from('attachments').createSignedUrl(path, 60));
  await refused('B overwrites A\'s file', B.storage.from('attachments').upload(path, new Blob(['evil']), { upsert: true }));
  await refused('B uploads into A\'s folder', B.storage.from('attachments').upload(`${a.id}/planted`, new Blob(['evil'])));
  await B.storage.from('attachments').remove([path]);
  expect(await (await A.storage.from('attachments').download(path)).data?.text(), 'A\'s file is unchanged').toBe('e2e!!');
});

test('8. anonymous visitors get nothing: tables, views, functions, files', async () => {
  const tables = ['tickets', 'tickets_v', 'projects', 'projects_v', 'notes', 'worklogs', 'checklist_items', 'test_cases', 'acceptance', 'attachments',
    'transports', 'transport_deps', 'articles', 'article_links', 'ticket_templates', 'tech_objects', 'object_links', 'object_deps', 'ticket_links',
    'ticket_events', 'ticket_changes', 'ticket_seen', 'ticket_shares', 'project_shares', 'value_items', 'counters', 'user_settings', 'notifications',
    'organizations', 'org_members', 'org_invites', 'verified_sessions', 'login_codes', 'trusted_browsers', 'calendar_tokens', 'oauth_states',
    'login_approvals', 'push_devices', 'login_failures', 'mail_log', 'client_errors'];
  for (const t of tables) await seesNothing(`anonymous reads ${t}`, anon.from(t).select('*').limit(5));
  await refused('anonymous creates a ticket', anon.from('tickets').insert({ Title: 'anon', Project: 'GEN' }));
  await changesNothing('anonymous updates tickets', anon.from('tickets').update({ Title: 'anon' }).eq('TicketUUID', ids.ticket).select());
  await changesNothing('anonymous deletes tickets', anon.from('tickets').delete().eq('TicketUUID', ids.ticket).select());
  for (const [fn, args] of [['my_org', {}], ['my_invitations', {}], ['share_contacts', {}], ['user_label', { p_user: a.id }], ['ticket_access', { p_ticket: ids.ticket }],
    ['ticket_members', { p_ticket: ids.ticket }], ['ticket_change_list', { p_ticket: ids.ticket }], ['project_people', { p_key: 'GEN' }], ['my_org_id', {}]] as const)
    await seesNothing(`anonymous calls ${fn}`, anon.rpc(fn, args));
  for (const [fn, args] of [['create_org', { p_name: 'anon org' }], ['share_ticket', { p_ticket: ids.ticket, p_email: b.email, p_access: 'edit' }],
    ['set_status', { p_ticket: ids.ticket, p_status: 'DONE', p_by: 'anon' }], ['answer_invitation', { p_kind: 'ticket', p_ref: ids.ticket, p_accept: true }],
    ['delete_user_data', { p_user: a.id }], ['digest_due', {}], ['notify', { p_user: a.id, p_kind: 'x', p_title: 'x', p_body: '', p_link: '' }]] as const)
    await refused(`anonymous calls ${fn}`, anon.rpc(fn, args));
  await refused('anonymous downloads a file', anon.storage.from('attachments').download(`${a.id}/${ids.att}`));
  await refused('anonymous uploads a file', anon.storage.from('attachments').upload(`${a.id}/anon`, new Blob(['x'])));
  expect((await A.from('tickets').select('Title').eq('TicketUUID', ids.ticket).single()).data?.Title).toBe('E2E private of A (renamed)');
});

test('8. anonymous visitors cannot tell whether two people share an organization (F6)', async () => {
  await seesNothing('anonymous calls same_org', anon.rpc('same_org', { a: a.id, b: b.id }));
});

test('2-step: a password-only session (no emailed code) sees and changes nothing', async () => {
  const P = await passwordOnly(a);
  expect((await P.rpc('session_verified')).data).toBe(false);
  await seesNothing('password-only reads own tickets', P.from('tickets').select('*'));
  await seesNothing('password-only reads own projects', P.from('projects').select('*'));
  await seesNothing('password-only reads own settings', P.from('user_settings').select('*'));
  await refused('password-only creates a ticket', P.from('tickets').insert({ Title: 'x', Project: 'GEN' }));
  await changesNothing('password-only updates a ticket', P.from('tickets').update({ Title: 'x' }).eq('TicketUUID', ids.ticket).select());
  await refused('password-only shares a ticket', P.rpc('share_ticket', { p_ticket: ids.ticket, p_email: b.email, p_access: 'edit' }));
  await refused('password-only creates an organization', P.rpc('create_org', { p_name: 'x' }));
  await refused('password-only downloads a file', P.storage.from('attachments').download(`${a.id}/${ids.att}`));
  const del = await P.functions.invoke('delete-account', { body: {} });
  expect(del.error, 'delete-account refuses a password-only session').not.toBeNull();
  const trust = await P.functions.invoke('verify-login-code', { body: { issueTrust: true } });
  expect(trust.error, 'no trusted-browser token without the second step').not.toBeNull();
});

/** RFC 6238 code for a base32 secret (what an authenticator app shows) */
function totp(secret: string) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(ch => alpha.indexOf(ch).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map(x => parseInt(x, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac('sha1', key).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('2-step: an authenticator app added from a password-only session does not replace the emailed code (F1)', async () => {
  const P = await passwordOnly(c);                                          // c has no authenticator app yet
  const { data: en, error } = await P.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e attacker' });
  if (!error && en) {
    const { data: ch } = await P.auth.mfa.challenge({ factorId: en.id });
    if (ch) await P.auth.mfa.verify({ factorId: en.id, challengeId: ch.id, code: totp(en.totp.secret) });
  }
  expect((await P.rpc('session_verified')).data, 'a self-added app must not count as the second step').toBe(false);
  await seesNothing('after adding an app: own projects', P.from('projects').select('*'));
  const trust = await P.functions.invoke('verify-login-code', { body: { issueTrust: true } });
  expect(trust.error, 'no trusted-browser token for a self-added app').not.toBeNull();
});
