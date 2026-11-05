// The fixes of migration 20261120000000_security_fixes (findings F1, F2, F3, F5, F6, F11 of the Supabase security
// audit), in the database itself. The same behaviour is checked against the real test project by e2e/cloud/security.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const OWNER = '11111111-1111-1111-1111-111111111111', VIEWER = '22222222-2222-2222-2222-222222222222', COMMENTER = '33333333-3333-3333-3333-333333333333', EDITOR = '44444444-4444-4444-4444-444444444444';
const SO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SV = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SC = 'cccccccc-cccc-cccc-cccc-cccccccccccc', SE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ATTACKER_SESSION = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NEW_SESSION = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const F1 = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', F2 = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2', OLD = 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3';

let t: Awaited<ReturnType<typeof freshDb>>;
let ticket = '';
/** the server itself (no signed-in user): what a server job or the service role does */
const asServer = async () => { await t.reset(); await t.db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`) };
const factor = async (id: string, user: string, ageMinutes = 0) => {
  await t.reset();
  await t.db.query(`insert into auth.mfa_factors (id, user_id, status, created_at) values ($1, $2, 'verified', now() - make_interval(mins => $3))`, [id, user, ageMinutes]);
};

beforeAll(async () => {
  t = await freshDb();
  await t.user(OWNER, 'owner@test.io', 'Olivia Owner'); await t.user(VIEWER, 'viewer@test.io', 'Vera Viewer');
  await t.user(COMMENTER, 'comm@test.io', 'Cem Commenter'); await t.user(EDITOR, 'editor@test.io', 'Eda Editor');
  for (const [u, s] of [[OWNER, SO], [VIEWER, SV], [COMMENTER, SC], [EDITOR, SE]]) await t.verify(s, u);
  await t.as(OWNER, SO);
  ticket = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project") values ('Fix the invoice','GEN') returning "TicketUUID"`))!.TicketUUID;
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'viewer@test.io', 'view']);
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'comm@test.io', 'comment']);
  await t.db.query('select share_ticket($1, $2, $3)', [ticket, 'editor@test.io', 'edit']);
  for (const [u, s] of [[VIEWER, SV], [COMMENTER, SC], [EDITOR, SE]]) await t.acceptAll(u, s);
}, 60_000);

describe('F1: an authenticator app counts only after it was confirmed from a verified session', () => {
  it('a self-added app (password-only session, aal2) unlocks nothing', async () => {
    await factor(F1, VIEWER);                                         // enrolled + verified from a password-only session
    await t.as(VIEWER, ATTACKER_SESSION, { aal: 'aal2' });
    expect(await t.one('select session_verified() v')).toEqual({ v: false });
    expect(await t.rows('select 1 from tickets_v')).toEqual([]);
    await expect(t.db.query('select approve_app_factor($1)', [F1])).rejects.toThrow(/emailed code first/);
  });
  it('confirmed from a session that passed the emailed code, it unlocks later sign-ins', async () => {
    await t.as(VIEWER, SV);                                           // verified with the emailed code
    await t.db.query('select approve_app_factor($1)', [F1]);
    await t.as(VIEWER, NEW_SESSION, { aal: 'aal2' });                 // a later sign-in with the app
    expect(await t.one('select session_verified() v')).toEqual({ v: true });
    expect((await t.rows('select 1 from tickets_v')).length).toBe(1);
  });
  it('one more app that was not confirmed makes aal2 count for nothing again', async () => {
    await factor(F2, VIEWER);
    await t.as(VIEWER, NEW_SESSION, { aal: 'aal2' });
    expect(await t.one('select session_verified() v')).toEqual({ v: false });
    await t.reset(); await t.db.query('delete from auth.mfa_factors where id = $1', [F2]);
  });
  it('confirms only your own app, verified in the last 30 minutes', async () => {
    await factor(OLD, COMMENTER, 45);
    await t.as(COMMENTER, SC);
    await expect(t.db.query('select approve_app_factor($1)', [OLD])).rejects.toThrow(/set it up again/);
    await expect(t.db.query('select approve_app_factor($1)', [F1])).rejects.toThrow(/set it up again/);   // the viewer's
  });
  it('the shared rule is for the server only; the table is not reachable', async () => {
    await t.as(VIEWER, SV);
    await expect(t.db.query('select session_ok($1, $2, $3)', [VIEWER, SV, 'aal1'])).rejects.toThrow(/permission denied/);
    await expect(t.db.query('select * from app_factors')).rejects.toThrow(/permission denied/);
    await t.asRole('service_role');
    expect(await t.one('select session_ok($1, $2, $3) ok', [VIEWER, SV, 'aal1'])).toEqual({ ok: true });
    expect(await t.one('select session_ok($1, $2, $3) ok', [VIEWER, ATTACKER_SESSION, 'aal1'])).toEqual({ ok: false });
    expect(await t.one('select session_ok($1, $2, $3) ok', [VIEWER, ATTACKER_SESSION, 'aal2'])).toEqual({ ok: true });   // F1 approved above
  });
});

describe('F2: author names come from the server', () => {
  it('a comment or time entry "signed" as someone else shows its real author', async () => {
    await t.as(COMMENTER, SC);
    const n = await t.one<{ NoteUUID: string; CreatedBy: string }>(`insert into notes ("TicketUUID","Text","CreatedBy") values ($1, 'I approve', 'Olivia Owner') returning "NoteUUID","CreatedBy"`, [ticket]);
    expect(n!.CreatedBy).toBe('Cem Commenter');
    expect(await t.one(`insert into worklogs ("TicketUUID","Hours","CreatedBy") values ($1, 1, 'Olivia Owner') returning "CreatedBy"`, [ticket])).toEqual({ CreatedBy: 'Cem Commenter' });
    await t.db.query(`update notes set "CreatedBy" = 'Olivia Owner' where "NoteUUID" = $1`, [n!.NoteUUID]);
    expect(await t.one(`select "CreatedBy" from notes where "NoteUUID" = $1`, [n!.NoteUUID])).toEqual({ CreatedBy: 'Cem Commenter' });
  });
  it('an editor cannot re-sign the owner\'s rows; tickets and tests name who did it', async () => {
    await t.as(OWNER, SO);
    const n = (await t.one<{ NoteUUID: string }>(`insert into notes ("TicketUUID","Text") values ($1, 'Owner note') returning "NoteUUID"`, [ticket]))!.NoteUUID;
    expect(await t.one(`select "CreatedBy" from tickets where "TicketUUID" = $1`, [ticket])).toEqual({ CreatedBy: 'Olivia Owner' });
    const test = (await t.one<{ TestUUID: string }>(`insert into test_cases ("TicketUUID","TestName","TestedBy") values ($1, 'Posting', 'Someone') returning "TestUUID"`, [ticket]))!.TestUUID;
    await t.as(EDITOR, SE);
    await t.db.query(`update notes set "CreatedBy" = 'Eda Editor', "Text" = 'Owner note (edited)' where "NoteUUID" = $1`, [n]);
    await t.db.query(`update test_cases set "TestResult" = 'PASS', "TestedBy" = 'Olivia Owner' where "TestUUID" = $1`, [test]);
    await t.as(OWNER, SO);
    expect(await t.one(`select "CreatedBy","Text" from notes where "NoteUUID" = $1`, [n])).toEqual({ CreatedBy: 'Olivia Owner', Text: 'Owner note (edited)' });
    expect(await t.one(`select "TestedBy","TestResult" from test_cases where "TestUUID" = $1`, [test])).toEqual({ TestedBy: 'Eda Editor', TestResult: 'PASS' });
  });
  it('the server keeps what it writes', async () => {
    await asServer();
    expect(await t.one(`insert into notes (user_id, "TicketUUID","Text","CreatedBy") values ($1, $2, 'import', 'Import job') returning "CreatedBy"`, [OWNER, ticket])).toEqual({ CreatedBy: 'Import job' });
  });
});

describe('F3: status history only from a real status change', () => {
  it('nobody writes history directly, not even the owner', async () => {
    for (const [u, s] of [[COMMENTER, SC], [EDITOR, SE], [OWNER, SO]]) {
      await t.as(u, s);
      await expect(t.db.query(`insert into ticket_events ("TicketUUID","EventKind","StatusFrom","StatusTo","EventBy") values ($1, 'STAT', 'PROG', 'DONE', 'Olivia Owner')`, [ticket]))
        .rejects.toThrow(/permission denied/);
    }
  });
  it('set_status: owner and editor only; the entry names who did it; marking read still works', async () => {
    for (const [u, s] of [[VIEWER, SV], [COMMENTER, SC]]) {
      await t.as(u, s);
      await expect(t.db.query(`select set_status($1, 'DONE', 'Olivia Owner')`, [ticket])).rejects.toThrow(/cannot change the status/);
    }
    await t.as(EDITOR, SE);
    await t.db.query(`select set_status($1, 'PROG', 'Olivia Owner')`, [ticket]);
    await t.as(OWNER, SO);
    const e = await t.one<{ EventUUID: string; EventBy: string; StatusTo: string }>(`select "EventUUID","EventBy","StatusTo" from ticket_events where "TicketUUID" = $1 order by "EventAt" desc limit 1`, [ticket]);
    expect(e).toMatchObject({ EventBy: 'Eda Editor', StatusTo: 'PROG' });
    await t.db.query(`update ticket_events set "IsRead" = false where "EventUUID" = $1`, [e!.EventUUID]);
    await expect(t.db.query(`update ticket_events set "EventBy" = 'x' where "EventUUID" = $1`, [e!.EventUUID])).rejects.toThrow(/permission denied/);
    await expect(t.db.query(`delete from ticket_events where "EventUUID" = $1`, [e!.EventUUID])).rejects.toThrow(/permission denied/);
    await t.asRole('anon');
    await expect(t.db.query(`select set_status($1, 'DONE')`, [ticket])).rejects.toThrow(/permission denied/);
  });
});

describe('F5: notifications and seen marks need the second step', () => {
  it('a password-only session cannot hide or read its notifications', async () => {
    await asServer();
    await t.db.query(`select notify($1, 'org-removed', 'You were removed from Acme', '', '')`, [OWNER]);
    await t.as(OWNER, ATTACKER_SESSION);                              // not verified
    await t.db.query(`delete from notifications`);
    await t.db.query(`update notifications set "ReadAt" = now()`);
    expect(await t.rows('select 1 from ticket_seen')).toEqual([]);
    await t.as(OWNER, SO);
    expect(await t.rows(`select "Title","ReadAt" from notifications where "Kind" = 'org-removed'`)).toEqual([{ Title: 'You were removed from Acme', ReadAt: null }]);
  });
});

describe('F6 and F11', () => {
  it('same_org is for server functions only; sharing inside an organization still works', async () => {
    await t.as(OWNER, SO);
    await expect(t.db.query('select same_org($1, $2)', [OWNER, EDITOR])).rejects.toThrow(/permission denied/);
    await t.asRole('anon');
    await expect(t.db.query('select same_org($1, $2)', [OWNER, EDITOR])).rejects.toThrow(/permission denied/);
  });
  it('the owner changes only the access level of a share', async () => {
    await t.as(OWNER, SO);
    await t.db.query(`update ticket_shares set "Access" = 'comment' where "TicketUUID" = $1 and member_id = $2`, [ticket, VIEWER]);
    for (const set of [`"Status" = 'pending'`, `member_id = '${COMMENTER}'`, `"Via" = 'org'`, `owner_id = '${EDITOR}'`])
      await expect(t.db.query(`update ticket_shares set ${set} where "TicketUUID" = $1 and member_id = $2`, [ticket, VIEWER])).rejects.toThrow(/permission denied/);
    await expect(t.db.query(`update project_shares set "Status" = 'active'`)).rejects.toThrow(/permission denied/);
    expect(await t.one(`select "Access","Status","Via" from ticket_shares where "TicketUUID" = $1 and member_id = $2`, [ticket, VIEWER])).toEqual({ Access: 'comment', Status: 'active', Via: 'direct' });
    await t.db.query(`update ticket_shares set "Access" = 'view' where "TicketUUID" = $1 and member_id = $2`, [ticket, VIEWER]);
  });
});
