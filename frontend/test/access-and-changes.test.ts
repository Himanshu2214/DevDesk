// Access levels on shared tickets (view / comment / edit), the change history with undo, and the
// "changed by someone else" flag – in the database itself.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const OWNER = '11111111-1111-1111-1111-111111111111', VIEWER = '22222222-2222-2222-2222-222222222222', COMMENTER = '33333333-3333-3333-3333-333333333333', EDITOR = '44444444-4444-4444-4444-444444444444';
const SO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SV = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SC = 'cccccccc-cccc-cccc-cccc-cccccccccccc', SE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let t: Awaited<ReturnType<typeof freshDb>>;
let ticket = '';

beforeAll(async () => {
  t = await freshDb();
  await t.user(OWNER, 'owner@test.io', 'Olivia Owner'); await t.user(VIEWER, 'viewer@test.io', 'Vera Viewer');
  await t.user(COMMENTER, 'comm@test.io', 'Cem Commenter'); await t.user(EDITOR, 'editor@test.io', 'Eda Editor');
  for (const [u, s] of [[OWNER, SO], [VIEWER, SV], [COMMENTER, SC], [EDITOR, SE]]) await t.verify(s, u);
  await t.as(OWNER, SO);
  ticket = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Fix the invoice','GEN') returning "TicketUUID"`))!.TicketUUID;
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'viewer@test.io', 'view']);
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'comm@test.io', 'comment']);
  await t.db.query('select share_ticket($1, $2)', [ticket, 'editor@test.io']);            // default: edit
  for (const [u, s] of [[VIEWER, SV], [COMMENTER, SC], [EDITOR, SE]]) await t.acceptAll(u, s);
}, 60_000);

describe('access levels', () => {
  it('the owner sees each level and can change it', async () => {
    await t.as(OWNER, SO);
    expect(await t.rows('select email, access from ticket_members($1) order by email', [ticket])).toEqual([
      { email: 'comm@test.io', access: 'comment' }, { email: 'editor@test.io', access: 'edit' }, { email: 'viewer@test.io', access: 'view' }]);
    await t.db.query(`update ticket_shares set "Access" = 'view' where "TicketUUID" = $1 and member_id = $2`, [ticket, EDITOR]);
    expect(await t.one(`select "Access" from ticket_shares where member_id = $1`, [EDITOR])).toEqual({ Access: 'view' });
    await t.db.query(`update ticket_shares set "Access" = 'edit' where "TicketUUID" = $1 and member_id = $2`, [ticket, EDITOR]);
  });

  it('view: reads, cannot comment or change', async () => {
    await t.as(VIEWER, SV);
    expect(await t.one('select "Title","Access" from tickets_v where "TicketUUID" = $1', [ticket])).toEqual({ Title: 'Fix the invoice', Access: 'view' });
    await expect(t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'hi')`, [ticket])).rejects.toThrow(/row-level security/);
    await t.db.query(`update tickets set "Title" = 'Hacked' where "TicketUUID" = $1`, [ticket]);   // no row it may change
    await expect(t.db.query(`update ticket_shares set "Access" = 'edit' where member_id = $1`, [VIEWER])).resolves.toBeTruthy();
    await t.as(OWNER, SO);
    expect(await t.one('select "Title" from tickets where "TicketUUID" = $1', [ticket])).toEqual({ Title: 'Fix the invoice' });
    expect(await t.one(`select "Access" from ticket_shares where member_id = $1`, [VIEWER])).toEqual({ Access: 'view' });   // cannot raise own level
  });

  it('comment: adds comments and time, changes only their own, cannot edit the ticket', async () => {
    await t.as(COMMENTER, SC);
    const note = (await t.one<{ NoteUUID: string }>(`insert into notes ("TicketUUID","Text") values ($1, 'Looked at it') returning "NoteUUID"`, [ticket]))!.NoteUUID;
    await t.db.query(`insert into worklogs ("TicketUUID","WorkDate","Hours","Activity") values ($1, current_date, 1, 'ANA')`, [ticket]);
    await t.db.query(`update notes set "Text" = 'Looked at it closely' where "NoteUUID" = $1`, [note]);
    await expect(t.db.query(`insert into acceptance ("TicketUUID","Text") values ($1, 'x')`, [ticket])).rejects.toThrow(/row-level security/);
    await t.db.query(`update tickets set "Status" = 'DONE' where "TicketUUID" = $1`, [ticket]);
    await t.as(OWNER, SO);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'Owner note')`, [ticket]);
    expect(await t.one('select "Status" from tickets where "TicketUUID" = $1', [ticket])).toEqual({ Status: 'BACKLOG' });
    await t.as(COMMENTER, SC);
    await t.db.query(`update notes set "Text" = 'changed' where "Text" = 'Owner note'`);            // not theirs: no effect
    await t.as(OWNER, SO);
    expect(await t.rows('select "Text" from notes where "TicketUUID" = $1 order by "Text"', [ticket])).toEqual([{ Text: 'Looked at it closely' }, { Text: 'Owner note' }]);
  });

  it('edit: changes the ticket', async () => {
    await t.as(EDITOR, SE);
    await t.db.query(`update tickets set "Priority" = '1' where "TicketUUID" = $1`, [ticket]);
    await t.as(OWNER, SO);
    expect(await t.one('select "Priority" from tickets where "TicketUUID" = $1', [ticket])).toEqual({ Priority: '1' });
  });
});

describe('change history', () => {
  it('records who changed what, and undoes a change', async () => {
    await t.as(EDITOR, SE);
    await t.db.query(`update tickets set "Title" = 'Fix the GST invoice', "DueDate" = '2026-12-01' where "TicketUUID" = $1`, [ticket]);
    await t.as(OWNER, SO);
    const list = await t.rows<{ ChangeUUID: string; Field: string; OldValue: unknown; NewValue: unknown; By: string; Mine: boolean }>(
      'select * from ticket_change_list($1)', [ticket]);
    const title = list.find(c => c.Field === 'Title')!;
    expect(title).toMatchObject({ OldValue: 'Fix the invoice', NewValue: 'Fix the GST invoice', By: 'Eda Editor', Mine: false });
    expect(list.find(c => c.Field === 'DueDate')).toMatchObject({ OldValue: null, NewValue: '2026-12-01' });
    expect(list.find(c => c.Field === 'Priority')).toMatchObject({ NewValue: '1', By: 'Eda Editor' });

    await t.db.query('select undo_ticket_change($1)', [title.ChangeUUID]);
    expect(await t.one('select "Title" from tickets where "TicketUUID" = $1', [ticket])).toEqual({ Title: 'Fix the invoice' });
    await expect(t.db.query('select undo_ticket_change($1)', [title.ChangeUUID])).rejects.toThrow(/changed again/);
    const due = list.find(c => c.Field === 'DueDate')!;
    await t.db.query('select undo_ticket_change($1)', [due.ChangeUUID]);
    expect(await t.one('select "DueDate" from tickets where "TicketUUID" = $1', [ticket])).toEqual({ DueDate: null });
  });

  it('a viewer sees the history but cannot undo', async () => {
    await t.as(VIEWER, SV);
    const [c] = await t.rows<{ ChangeUUID: string }>('select "ChangeUUID" from ticket_change_list($1) limit 1', [ticket]);
    await expect(t.db.query('select undo_ticket_change($1)', [c.ChangeUUID])).rejects.toThrow(/only view/);
  });
});

describe('changed by someone else', () => {
  it('is flagged until the ticket is opened, and not for your own changes', async () => {
    await t.as(OWNER, SO);
    expect(await t.one('select "ChangedByOthers" as f from tickets_v where "TicketUUID" = $1', [ticket])).toEqual({ f: true });
    await t.db.query('select mark_ticket_seen($1)', [ticket]);
    expect(await t.one('select "ChangedByOthers" as f from tickets_v where "TicketUUID" = $1', [ticket])).toEqual({ f: false });
    await t.db.query(`update tickets set "Reference" = 'mine' where "TicketUUID" = $1`, [ticket]);
    expect(await t.one('select "ChangedByOthers" as f from tickets_v where "TicketUUID" = $1', [ticket])).toEqual({ f: false });
    await t.as(COMMENTER, SC);
    await t.db.query(`insert into notes ("TicketUUID","Text") values ($1, 'Another comment')`, [ticket]);
    await t.as(OWNER, SO);
    expect(await t.one('select "ChangedByOthers" as f from tickets_v where "TicketUUID" = $1', [ticket])).toEqual({ f: true });
  });
});
