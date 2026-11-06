// Recurring tickets (migration 20261122000000_recurring_tickets): rules create tickets when due, privately.
// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', UNVERIFIED = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
let t: Awaited<ReturnType<typeof freshDb>>;
const today = async () => (await t.one<{ d: string }>(`select to_char(current_date, 'YYYY-MM-DD') d`))!.d;
const plus = async (n: number) => (await t.one<{ d: string }>(`select to_char(current_date + $1::int, 'YYYY-MM-DD') d`, [n]))!.d;

beforeAll(async () => {
  t = await freshDb();
  await t.user(A, 'a@test.io', 'Ann'); await t.user(B, 'b@test.io', 'Ben');
  await t.verify(SA, A); await t.verify(SB, B);
}, 60_000);

describe('recurring tickets', () => {
  it('a due rule creates one ticket (fields copied, due date offset) and moves to its next date', async () => {
    await t.as(A, SA);
    const d0 = await today();
    await t.db.query(`insert into recurring_tickets ("Title","Data","Every","NextRun","DueInDays") values ('Weekly transport review', $1, 'week', current_date - 21, 2)`,
      [JSON.stringify({ Description: 'Check the queue', Priority: '2', Project: 'GEN', Tech: 'ABAP', EstimateHours: 1 })]);
    expect(await t.one('select run_recurring() n')).toEqual({ n: 1 });                       // three missed weeks: one ticket, not three
    expect(await t.one(`select "Title","Description","Status","Priority","Tech","EstimateHours"::text e, to_char("DueDate",'YYYY-MM-DD') due from tickets where "Title" = 'Weekly transport review'`))
      .toEqual({ Title: 'Weekly transport review', Description: 'Check the queue', Status: 'TODO', Priority: '2', Tech: 'ABAP', e: '1.00', due: await plus(2) });
    expect((await t.one<{ d: string }>(`select to_char("NextRun",'YYYY-MM-DD') d from recurring_tickets`))!.d > d0).toBe(true);
    expect(await t.one('select run_recurring() n')).toEqual({ n: 0 });                       // not again today
  });
  it('workdays skip the weekend; months keep the day', async () => {
    await t.reset();
    expect(await t.rows(`select to_char(recurring_next('2026-11-06', 'workday'),'YYYY-MM-DD') fri, to_char(recurring_next('2026-11-07', 'workday'),'YYYY-MM-DD') sat,
      to_char(recurring_next('2026-11-04', 'workday'),'YYYY-MM-DD') wed, to_char(recurring_next('2026-01-31', 'month'),'YYYY-MM-DD') jan`))
      .toEqual([{ fri: '2026-11-09', sat: '2026-11-09', wed: '2026-11-05', jan: '2026-02-28' }]);
  });
  it('paused rules wait; rules and their tickets are private', async () => {
    await t.as(A, SA);
    await t.db.query(`insert into recurring_tickets ("Title","Every","NextRun","Active") values ('Paused one', 'workday', current_date, false)`);
    expect(await t.one('select run_recurring() n')).toEqual({ n: 0 });
    await t.as(B, SB);
    expect(await t.rows('select * from recurring_tickets')).toEqual([]);
    expect(await t.one('select run_recurring() n')).toEqual({ n: 0 });
    await t.db.query(`update recurring_tickets set "Active" = true`);
    await t.as(A, SA);
    expect((await t.rows(`select 1 from recurring_tickets where "Active" = false`)).length).toBe(1);
  });
  it('needs the second step and a plausible date', async () => {
    await t.as(A, UNVERIFIED);
    expect(await t.one('select run_recurring() n')).toEqual({ n: 0 });
    await t.as(A, SA);
    await expect(t.db.query(`select run_recurring(current_date + 30)`)).rejects.toThrow(/Unexpected date/);
    await t.asRole('anon');
    await expect(t.db.query('select run_recurring()')).rejects.toThrow(/permission denied/);
  });
});
