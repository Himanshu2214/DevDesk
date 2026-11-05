// Security 2, 3, 4, 9, 10: what view, comment and edit collaborators can do directly through the API (not only what
// the app's screens offer), forging of owners, authors and shares, and file access that follows the share.
import { expect, test } from '@playwright/test';
import { createUser, removeUsers, type TestUser } from '../cloud';
import { allowed, anonymous, changesNothing, newAttachment, newTicket, refused, seesNothing, serverDownload, verified, type Api } from './api';

test.describe.configure({ mode: 'serial' });

let o: TestUser, v: TestUser, c: TestUser, e: TestUser, s: TestUser;
let O: Api, V: Api, C: Api, E: Api, S: Api;
let ticket: string, ownerNote: string, ownerWork: string, ownerCheck: string, ownerAtt: string, ownerTest: string;

test.beforeAll(async () => {
  o = await createUser('showner'); v = await createUser('shview'); c = await createUser('shcomment'); e = await createUser('shedit'); s = await createUser('shstranger');
  [O, V, C, E, S] = await Promise.all([o, v, c, e, s].map(u => verified(u)));
  ticket = (await newTicket(O, 'E2E security shared ticket')).TicketUUID;
  ownerNote = (await allowed<{ NoteUUID: string }>('owner comments', O.from('notes').insert({ TicketUUID: ticket, Text: 'owner note' }).select('NoteUUID').single())).NoteUUID;
  ownerWork = (await allowed<{ WorklogUUID: string }>('owner logs time', O.from('worklogs').insert({ TicketUUID: ticket, Hours: 2 }).select('WorklogUUID').single())).WorklogUUID;
  ownerCheck = (await allowed<{ ItemUUID: string }>('owner adds a checklist item', O.from('checklist_items').insert({ TicketUUID: ticket, Text: 'owner item' }).select('ItemUUID').single())).ItemUUID;
  ownerTest = (await allowed<{ TestUUID: string }>('owner adds a test case', O.from('test_cases').insert({ TicketUUID: ticket, TestName: 'owner test' }).select('TestUUID').single())).TestUUID;
  ownerAtt = await newAttachment(O, o.id, ticket);
  // the owner shares (all outside any organization: invitations), each person accepts their own
  for (const [u, level] of [[v, 'view'], [c, 'comment'], [e, 'edit']] as const)
    expect(await allowed('owner shares', O.rpc('share_ticket', { p_ticket: ticket, p_email: u.email, p_access: level }))).toBe('pending');
  for (const X of [V, C, E]) await allowed('accepting the invitation', X.rpc('answer_invitation', { p_kind: 'ticket', p_ref: ticket, p_accept: true }));
});
test.afterAll(async () => { await removeUsers(o, v, c, e, s) });

const title = async () => (await O.from('tickets').select('Title, Priority, Status, user_id, Project').eq('TicketUUID', ticket).single()).data;

test('2. view: reads the ticket, its rows and files – and can write nothing', async () => {
  expect((await V.from('tickets').select('Title').eq('TicketUUID', ticket)).data).toHaveLength(1);
  expect((await V.from('notes').select('NoteUUID').eq('TicketUUID', ticket)).data?.length).toBeGreaterThan(0);
  expect(await (await V.storage.from('attachments').download(`${o.id}/${ownerAtt}`)).data?.text(), 'a viewer reads the file').toBe('e2e!!');
  const before = await title();
  await changesNothing('viewer edits the title', V.from('tickets').update({ Title: 'by viewer' }).eq('TicketUUID', ticket).select());
  await changesNothing('viewer deletes the ticket', V.from('tickets').delete().eq('TicketUUID', ticket).select());
  await refused('viewer changes the status', V.rpc('set_status', { p_ticket: ticket, p_status: 'DONE', p_by: 'viewer' }));
  await refused('viewer comments', V.from('notes').insert({ TicketUUID: ticket, Text: 'viewer note' }));
  await refused('viewer logs time', V.from('worklogs').insert({ TicketUUID: ticket, Hours: 1 }));
  await refused('viewer adds a checklist item', V.from('checklist_items').insert({ TicketUUID: ticket, Text: 'x' }));
  await refused('viewer adds a test case', V.from('test_cases').insert({ TicketUUID: ticket, TestName: 'x' }));
  await refused('viewer adds a criterion', V.from('acceptance').insert({ TicketUUID: ticket, Text: 'x' }));
  await refused('viewer adds an attachment', V.from('attachments').insert({ TicketUUID: ticket, FileName: 'x' }));
  await refused('viewer adds a transport', V.from('transports').insert({ TrKorr: 'DEVK900010', TicketUUID: ticket }));
  await refused('viewer adds a history event', V.from('ticket_events').insert({ TicketUUID: ticket, EventKind: 'STAT', StatusFrom: 'BACKLOG', StatusTo: 'DONE', EventBy: 'Owner' }));
  await changesNothing('viewer edits the owner\'s comment', V.from('notes').update({ Text: 'changed' }).eq('NoteUUID', ownerNote).select());
  await changesNothing('viewer deletes the owner\'s comment', V.from('notes').delete().eq('NoteUUID', ownerNote).select());
  await changesNothing('viewer edits the owner\'s time', V.from('worklogs').update({ Hours: 9 }).eq('WorklogUUID', ownerWork).select());
  await changesNothing('viewer ticks the checklist', V.from('checklist_items').update({ IsDone: true }).eq('ItemUUID', ownerCheck).select());
  await changesNothing('viewer deletes the checklist item', V.from('checklist_items').delete().eq('ItemUUID', ownerCheck).select());
  await changesNothing('viewer raises their own access', V.from('ticket_shares').update({ Access: 'edit' }).eq('TicketUUID', ticket).eq('member_id', v.id).select());
  await refused('viewer shares the ticket on', V.rpc('share_ticket', { p_ticket: ticket, p_email: s.email, p_access: 'view' }));
  const ch = (await V.from('ticket_changes').select('ChangeUUID').eq('TicketUUID', ticket)).data ?? [];
  if (ch[0]) await refused('viewer undoes a change', V.rpc('undo_ticket_change', { p_change: ch[0].ChangeUUID }));
  await refused('viewer deletes the owner\'s file', V.storage.from('attachments').remove([`${o.id}/${ownerAtt}`]).then(async r =>
    ({ data: r.data, error: r.error ?? ((await O.storage.from('attachments').download(`${o.id}/${ownerAtt}`)).error ? null : { message: 'file still there (refused)' }) })));
  expect(await title()).toEqual(before);
  expect((await O.from('notes').select('Text').eq('NoteUUID', ownerNote).single()).data?.Text).toBe('owner note');
  expect((await O.from('worklogs').select('Hours').eq('WorklogUUID', ownerWork).single()).data?.Hours).toBe(2);
  expect((await O.from('ticket_shares').select('Access').eq('TicketUUID', ticket).eq('member_id', v.id).single()).data?.Access).toBe('view');
});

test('3. comment: adds and edits own comments and time – ticket fields and others\' rows stay protected', async () => {
  const before = await title();
  const mine = await allowed<{ NoteUUID: string }>('commenter comments', C.from('notes').insert({ TicketUUID: ticket, Text: 'commenter note' }).select('NoteUUID').single());
  await allowed('commenter edits own comment', C.from('notes').update({ Text: 'commenter note (edited)' }).eq('NoteUUID', mine.NoteUUID));
  await allowed('commenter logs own time', C.from('worklogs').insert({ TicketUUID: ticket, Hours: 0.5 }));
  await changesNothing('commenter edits the title', C.from('tickets').update({ Title: 'by commenter' }).eq('TicketUUID', ticket).select());
  await changesNothing('commenter changes the priority', C.from('tickets').update({ Priority: '1' }).eq('TicketUUID', ticket).select());
  await changesNothing('commenter deletes the ticket', C.from('tickets').delete().eq('TicketUUID', ticket).select());
  await changesNothing('commenter edits the owner\'s comment', C.from('notes').update({ Text: 'hijacked' }).eq('NoteUUID', ownerNote).select());
  await changesNothing('commenter deletes the owner\'s comment', C.from('notes').delete().eq('NoteUUID', ownerNote).select());
  await changesNothing('commenter edits the owner\'s time', C.from('worklogs').update({ Hours: 0 }).eq('WorklogUUID', ownerWork).select());
  await changesNothing('commenter deletes the owner\'s time', C.from('worklogs').delete().eq('WorklogUUID', ownerWork).select());
  await refused('commenter adds a checklist item', C.from('checklist_items').insert({ TicketUUID: ticket, Text: 'x' }));
  await changesNothing('commenter ticks the checklist', C.from('checklist_items').update({ IsDone: true }).eq('ItemUUID', ownerCheck).select());
  await changesNothing('commenter passes a test', C.from('test_cases').update({ TestResult: 'PASS' }).eq('TestUUID', ownerTest).select());
  await refused('commenter adds an attachment', C.from('attachments').insert({ TicketUUID: ticket, FileName: 'x' }));
  await changesNothing('commenter raises own access', C.from('ticket_shares').update({ Access: 'edit' }).eq('TicketUUID', ticket).eq('member_id', c.id).select());
  await refused('commenter deletes the owner\'s file', C.storage.from('attachments').remove([`${o.id}/${ownerAtt}`]).then(async r =>
    ({ data: r.data, error: r.error ?? ((await O.storage.from('attachments').download(`${o.id}/${ownerAtt}`)).error ? null : { message: 'file still there (refused)' }) })));
  expect(await title()).toEqual(before);
  expect((await O.from('notes').select('Text').eq('NoteUUID', ownerNote).single()).data?.Text).toBe('owner note');
  expect((await O.from('worklogs').select('Hours').eq('WorklogUUID', ownerWork).single()).data?.Hours).toBe(2);
  expect((await O.from('notes').select('Text').eq('NoteUUID', mine.NoteUUID).single()).data?.Text).toBe('commenter note (edited)');
});

test('3. comment: cannot change the status, nor write status history (F3)', async () => {
  await refused('commenter changes the status', C.rpc('set_status', { p_ticket: ticket, p_status: 'DONE', p_by: 'Owner' }));
  await refused('commenter writes a status event', C.from('ticket_events').insert({ TicketUUID: ticket, EventKind: 'STAT', StatusFrom: 'PROG', StatusTo: 'DONE', EventBy: 'Owner' }));
});

test('4. edit: changes the ticket and its rows – never the owner, the project, the shares or the ticket\'s existence', async () => {
  await allowed('editor edits the title', E.from('tickets').update({ Title: 'E2E security shared ticket (edited)' }).eq('TicketUUID', ticket));
  await allowed('editor changes the status', E.rpc('set_status', { p_ticket: ticket, p_status: 'PROG', p_by: 'editor' }));
  await allowed('editor adds a checklist item', E.from('checklist_items').insert({ TicketUUID: ticket, Text: 'editor item' }));
  await allowed('editor ticks the owner\'s item', E.from('checklist_items').update({ IsDone: true }).eq('ItemUUID', ownerCheck));
  await refused('editor takes over the ticket', E.from('tickets').update({ user_id: e.id }).eq('TicketUUID', ticket));
  await refused('editor moves it into their own project', E.from('tickets').update({ Project: 'GEN', user_id: e.id }).eq('TicketUUID', ticket));
  await changesNothing('editor deletes the ticket', E.from('tickets').delete().eq('TicketUUID', ticket).select());
  await changesNothing('editor changes someone else\'s access', E.from('ticket_shares').update({ Access: 'edit' }).eq('TicketUUID', ticket).eq('member_id', v.id).select());
  await changesNothing('editor removes someone else\'s share', E.from('ticket_shares').delete().eq('TicketUUID', ticket).eq('member_id', v.id).select());
  await refused('editor shares the ticket on', E.rpc('share_ticket', { p_ticket: ticket, p_email: s.email, p_access: 'edit' }));
  await seesNothing('editor lists the owner\'s share list', E.rpc('ticket_members', { p_ticket: ticket }));
  const t = await title();
  expect(t).toMatchObject({ Title: 'E2E security shared ticket (edited)', Status: 'PROG', user_id: o.id, Project: 'GEN' });
  expect((await O.from('ticket_shares').select('member_id').eq('TicketUUID', ticket)).data).toHaveLength(3);
  // the history names the editor, from the server's own record
  const changes = (await O.rpc('ticket_change_list', { p_ticket: ticket })).data as { Field: string; By: string; Mine: boolean }[];
  expect(changes.find(x => x.Field === 'Title')).toMatchObject({ By: 'E2E Shedit', Mine: false });
});

test('9. nobody can forge an owner, a row owner or a share', async () => {
  // a ticket inserted with someone else's id becomes the caller's own
  const forged = await allowed<{ user_id: string }>('stranger inserts a ticket "for" the owner', S.from('tickets').insert({ Title: 'forged', Project: 'GEN', user_id: o.id }).select('user_id').single());
  expect(forged.user_id).toBe(s.id);
  await refused('editor comments as the owner (user_id)', E.from('notes').insert({ TicketUUID: ticket, Text: 'x', user_id: o.id }));
  await refused('commenter logs time as the owner (user_id)', C.from('worklogs').insert({ TicketUUID: ticket, Hours: 1, user_id: o.id }));
  const mine = await allowed<{ NoteUUID: string }>('editor comments', E.from('notes').insert({ TicketUUID: ticket, Text: 'editor note' }).select('NoteUUID').single());
  await E.from('notes').update({ user_id: o.id }).eq('NoteUUID', mine.NoteUUID);
  expect((await O.from('notes').select('user_id').eq('NoteUUID', mine.NoteUUID).single()).data?.user_id, 'a comment\'s owner never changes').toBe(e.id);
  await refused('stranger creates a share', S.from('ticket_shares').insert({ TicketUUID: ticket, owner_id: o.id, member_id: s.id, Access: 'edit', Status: 'active' }));
  await changesNothing('viewer turns their share into someone else\x27s', V.from('ticket_shares').update({ member_id: s.id }).eq('TicketUUID', ticket).eq('member_id', v.id).select());
  await refused('stranger accepts an invitation that is not theirs', S.rpc('answer_invitation', { p_kind: 'ticket', p_ref: ticket, p_accept: true }));
  await seesNothing('the stranger still sees nothing', S.from('tickets').select('*').eq('TicketUUID', ticket));
});

test('9. the owner changes only the access level of a share – never its status, member or origin (F11)', async () => {
  const extra = (await newTicket(O, 'E2E security pending share')).TicketUUID;
  expect(await allowed('owner invites the stranger', O.rpc('share_ticket', { p_ticket: extra, p_email: s.email, p_access: 'view' }))).toBe('pending');
  const share = () => O.from('ticket_shares').select('Status, member_id, Via').eq('TicketUUID', extra);
  await changesNothing('owner marks a share as made through the organization', O.from('ticket_shares').update({ Via: 'org' }).eq('TicketUUID', extra).eq('member_id', s.id).select());
  await changesNothing('owner moves the share to another person', O.from('ticket_shares').update({ member_id: v.id }).eq('TicketUUID', extra).eq('member_id', s.id).select());
  await changesNothing('owner turns the invitation active without the person accepting', O.from('ticket_shares').update({ Status: 'active' }).eq('TicketUUID', extra).eq('member_id', s.id).select());
  expect((await share()).data, 'the invitation is unchanged').toEqual([{ Status: 'pending', member_id: s.id, Via: 'direct' }]);
  await seesNothing('the stranger still cannot read the ticket', S.from('tickets').select('*').eq('TicketUUID', extra));
});

test('9. authors shown in the app come from the server, not from the client (F2)', async () => {
  const n = await allowed<{ CreatedBy: string }>('commenter posts a comment signed as the owner',
    C.from('notes').insert({ TicketUUID: ticket, Text: 'I approve this', CreatedBy: 'E2E Showner' }).select('CreatedBy').single());
  expect(n.CreatedBy, 'the comment shows its real author').toBe('E2E Shcomment');
  const w = await allowed<{ CreatedBy: string }>('commenter logs time signed as the owner',
    C.from('worklogs').insert({ TicketUUID: ticket, Hours: 0.25, CreatedBy: 'E2E Showner' }).select('CreatedBy').single());
  expect(w.CreatedBy).toBe('E2E Shcomment');
  await E.from('notes').update({ CreatedBy: 'Someone else' }).eq('NoteUUID', ownerNote);
  expect((await O.from('notes').select('CreatedBy').eq('NoteUUID', ownerNote).single()).data?.CreatedBy, 'an editor cannot re-sign the owner\'s comment').toBe('E2E Showner');
});

test('10. files follow the share: strangers and anonymous visitors never, a removed member no longer', async () => {
  const path = `${o.id}/${ownerAtt}`;
  await refused('stranger downloads', S.storage.from('attachments').download(path));
  await refused('stranger creates a signed link', S.storage.from('attachments').createSignedUrl(path, 60));
  await refused('stranger uploads into the owner\'s folder', S.storage.from('attachments').upload(`${o.id}/planted`, new Blob(['x'])));
  await refused('anonymous downloads', (await anonymous()).storage.from('attachments').download(path));
  await refused('viewer uploads into the owner\'s folder', V.storage.from('attachments').upload(`${o.id}/planted-by-viewer`, new Blob(['x'])));
  // the editor's own file on the shared ticket lives in the editor's folder
  const edAtt = await newAttachment(E, e.id, ticket);
  expect(await (await O.storage.from('attachments').download(`${e.id}/${edAtt}`)).data?.text(), 'the owner reads the editor\'s file').toBe('e2e!!');
  await refused('stranger reads the editor\'s file', S.storage.from('attachments').download(`${e.id}/${edAtt}`));
  // the owner removes the viewer: rows and files are gone for them at once
  await allowed('owner removes the viewer', O.from('ticket_shares').delete().eq('TicketUUID', ticket).eq('member_id', v.id));
  await seesNothing('removed viewer reads the ticket', V.from('tickets').select('*').eq('TicketUUID', ticket));
  await seesNothing('removed viewer reads the comments', V.from('notes').select('*').eq('TicketUUID', ticket));
  await refused('removed viewer downloads the file (server-checked path)', serverDownload(V, path));
  await refused('removed viewer creates a signed link', V.storage.from('attachments').createSignedUrl(path, 60));
  expect(await (await O.storage.from('attachments').download(path)).data?.text()).toBe('e2e!!');
});
