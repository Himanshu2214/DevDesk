// Database rules of the standalone (Supabase) backend: numbering, business rules, privacy between users and the 2-step lock.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let t: Awaited<ReturnType<typeof freshDb>>;
let ticketA = '';

beforeAll(async () => {
  t = await freshDb();
  await t.user(A); await t.user(B);
  await t.verify(SA, A); await t.verify(SB, B);
  await t.as(A, SA);
  ticketA = (await t.one<{ TicketUUID: string }>(`insert into tickets ("Title","Project","Priority","DueDate") values ('First','GEN','2', current_date - 2) returning "TicketUUID"`))!.TicketUUID;
}, 60_000);

describe('new users', () => {
  it('get the default lists and a General project', async () => {
    await t.as(A, SA);
    expect(Number((await t.one<{ n: number }>('select count(*)::int n from value_items'))!.n)).toBeGreaterThan(20);
    expect(await t.rows('select "Project" from projects')).toEqual([{ Project: 'GEN' }]);
  });
});

describe('business rules', () => {
  it('numbers tickets per user from TK-1001', async () => {
    await t.as(A, SA);
    expect(await t.one('select "TicketId" from tickets_v where "TicketUUID" = $1', [ticketA])).toEqual({ TicketId: 'TK-1001' });
    await t.as(B, SB);
    expect(await t.one(`insert into tickets ("Title") values ('B first') returning "TicketId"`)).toEqual({ TicketId: 'TK-1001' });
  });
  it('writes a history event on status change', async () => {
    await t.as(A, SA);
    await t.db.query(`select set_status($1, 'PROG', 'A')`, [ticketA]);
    expect(await t.rows('select "StatusFrom","StatusTo" from ticket_events where "TicketUUID" = $1', [ticketA])).toContainEqual({ StatusFrom: 'BACKLOG', StatusTo: 'PROG' });
  });
  it('rounds the timer to quarter hours', async () => {
    await t.reset(); await t.db.query(`update tickets set "TimerStartedAt" = now() - interval '40 minutes' where "TicketUUID" = $1`, [ticketA]);
    await t.as(A, SA);
    await t.db.query(`select stop_timer($1, 'A')`, [ticketA]);
    expect(await t.one('select "Hours"::float8 h from worklogs where "TicketUUID" = $1 order by "CreatedAt" desc limit 1', [ticketA])).toEqual({ h: 0.75 });
  });
  it('rejects more than 24 hours and malformed transport numbers', async () => {
    await t.as(A, SA);
    await expect(t.db.query('insert into worklogs ("TicketUUID","Hours") values ($1, 30)', [ticketA])).rejects.toThrow();
    await expect(t.db.query(`insert into transports ("TrKorr") values ('ABC')`)).rejects.toThrow();
  });
  it('derives overdue and logged hours in the list view', async () => {
    await t.as(A, SA);
    expect(await t.one('select "IsOverdue", "LoggedHours"::float8 h from tickets_v where "TicketUUID" = $1', [ticketA])).toEqual({ IsOverdue: true, h: 0.75 });
  });
});

describe('privacy between users', () => {
  it('hides other users\' rows and blocks changes to them', async () => {
    await t.as(B, SB);
    expect(await t.rows('select 1 from tickets_v where "TicketUUID" = $1', [ticketA])).toEqual([]);
    expect(await t.rows(`update tickets set "Title" = 'hacked' where "TicketUUID" = $1 returning 1`, [ticketA])).toEqual([]);
    // a forged owner is replaced by the signed-in user
    expect(await t.one(`insert into tickets (user_id, "Title") values ($1, 'forged') returning user_id`, [A])).toEqual({ user_id: B });
  });
  it('gives anonymous visitors nothing', async () => {
    await t.asRole('anon');
    await expect(t.db.query('select * from tickets')).rejects.toThrow(/permission denied/);
  });
  it('keeps templates private and unique by name per user', async () => {
    await t.as(A, SA);
    await t.db.query(`insert into ticket_templates ("Name","Data") values ('GST bug', '{"Priority":"1"}')`);
    await expect(t.db.query(`insert into ticket_templates ("Name") values ('gst BUG ')`)).rejects.toThrow(/duplicate/);
    await t.as(B, SB);
    expect(await t.rows('select 1 from ticket_templates')).toEqual([]);
    await t.db.query(`insert into ticket_templates ("Name") values ('GST bug')`);           // same name is fine for another user
  });
  it('keeps the 2-step code tables away from users', async () => {
    await t.as(A, SA);
    await expect(t.db.query('select * from login_codes')).rejects.toThrow(/permission denied/);
  });
});

describe('daily digest', () => {
  it('keeps settings private, checks the time zone and protects the last-sent date', async () => {
    await t.as(A, SA);
    await expect(t.db.query(`insert into user_settings ("TimeZone") values ('Mars/Base')`)).rejects.toThrow(/Unknown time zone/);
    await t.db.query(`insert into user_settings ("DigestEnabled","DigestHour","TimeZone","DigestLastSent") values (true, 0, 'UTC', '2030-01-01')`);
    expect(await t.one('select "DigestLastSent" from user_settings')).toEqual({ DigestLastSent: null });
    await t.as(B, SB);
    expect(await t.rows('select 1 from user_settings')).toEqual([]);
  });
  it('lists users whose hour has come and who had none today – for the service role only', async () => {
    await t.as(A, SA);
    await expect(t.db.query('select * from digest_due()')).rejects.toThrow(/permission denied/);
    await t.asRole('service_role');
    expect((await t.rows<{ user_id: string }>('select user_id from digest_due()')).map(r => r.user_id)).toEqual([A]);
    await t.db.query(`update user_settings set "DigestLastSent" = (now() at time zone 'UTC')::date where user_id = $1`, [A]);
    expect(await t.rows('select 1 from digest_due()')).toEqual([]);
    expect((await t.rows('select 1 from tickets_v')).length).toBeGreaterThan(0);              // digest reads tickets
  });
  it('publishes the parent tables for live updates', async () => {
    await t.reset();
    expect((await t.rows<{ t: string }>(`select tablename t from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).map(r => r.t))
      .toEqual(['articles', 'tech_objects', 'ticket_templates', 'tickets', 'transports']);
  });
});

describe('2-step lock', () => {
  it('shows nothing to a session that has not passed the second step', async () => {
    await t.as(A, 'cccccccc-cccc-cccc-cccc-cccccccccccc', { aal: 'aal1' });
    expect(await t.rows('select 1 from tickets_v')).toEqual([]);
    await expect(t.db.query(`insert into tickets ("Title") values ('x')`)).rejects.toThrow(/row-level security/);
  });
  it('unlocks a session verified with the authenticator app (aal2)', async () => {
    await t.as(A, 'dddddddd-dddd-dddd-dddd-dddddddddddd', { aal: 'aal2' });
    expect((await t.rows('select 1 from tickets_v')).length).toBe(1);
  });
});
