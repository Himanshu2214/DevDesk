// Email budget and sign-in limits (migration 20261116000000_auth_limits) – server-side only.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './db';
import { redactAddresses } from '../../supabase/functions/_shared/mail';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let t: Awaited<ReturnType<typeof freshDb>>;
const slot = async (kind: string, user: string, to = 'h1', limit = 200, reserve = 60) =>
  (await t.one<{ ok: boolean; reason: string; slot: string | null }>('select * from take_mail_slot($1, $2, $3, $4, $5)', [kind, user, to, limit, reserve]))!;

beforeEach(async () => {
  t = await freshDb();
  await t.user(A); await t.user(B);
  await t.asRole('service_role');
}, 60_000);

describe('email budget', () => {
  it('sign-in codes: 8 per hour per account, released when the email failed', async () => {
    for (let i = 0; i < 8; i++) expect((await slot('code', A)).ok).toBe(true);
    const ninth = await slot('code', A);
    expect(ninth).toMatchObject({ ok: false, reason: 'user-hour' });
    expect((await slot('code', B)).ok).toBe(true);                               // other accounts are not affected
    const { slot: last } = (await t.one<{ slot: string }>(`select "MailUUID" as slot from mail_log where user_id = $1 order by "CreatedAt" desc limit 1`, [A]))!;
    await t.db.query('select release_mail_slot($1)', [last]);
    expect((await slot('code', A)).ok).toBe(true);
  });

  it('sign-in codes: 20 per day, counting earlier hours', async () => {
    await t.db.query(`insert into mail_log ("Kind", user_id, "CreatedAt") select 'code', $1, now() - interval '3 hours' from generate_series(1, 20)`, [A]);
    expect(await slot('code', A)).toMatchObject({ ok: false, reason: 'user-day' });
  });

  it('share emails stop at the reserve; sign-in codes may use it', async () => {
    await t.db.query(`insert into mail_log ("Kind", user_id) select 'notify', $1, from generate_series(1, 9)`.replace(', from', ' from'), [B]);
    expect(await slot('notify', A, 'x', 12, 3)).toMatchObject({ ok: false, reason: 'quota' });   // 9 of 12 used, 3 reserved
    expect(await slot('digest', A, 'x', 12, 3)).toMatchObject({ ok: false, reason: 'quota' });
    expect((await slot('code', A, 'x', 12, 3)).ok).toBe(true);
    expect((await slot('code', A, 'x', 12, 3)).ok).toBe(true);
    expect((await slot('code', A, 'x', 12, 3)).ok).toBe(true);
    expect(await slot('code', A, 'x', 12, 3)).toMatchObject({ ok: false, reason: 'quota' });       // the provider limit itself
  });

  it('share emails: 3 a day to the same person, 30 a day per sender', async () => {
    for (let i = 0; i < 3; i++) expect((await slot('notify', A, 'same')).ok).toBe(true);
    expect(await slot('notify', A, 'same')).toMatchObject({ ok: false, reason: 'pair-day' });
    for (let i = 0; i < 27; i++) expect((await slot('notify', A, 'p' + i)).ok).toBe(true);
    expect(await slot('notify', A, 'another')).toMatchObject({ ok: false, reason: 'user-day' });
  });

  it('daily email: once a day per person', async () => {
    expect((await slot('digest', A)).ok).toBe(true);
    expect(await slot('digest', A)).toMatchObject({ ok: false, reason: 'user-day' });
  });

  it('is not reachable from the app', async () => {
    await t.verify(SA, A);
    await t.as(A, SA);
    await expect(t.db.query(`select * from take_mail_slot('code', $1, 'x')`, [A])).rejects.toThrow(/permission denied/);
    await expect(t.db.query('select * from mail_log')).rejects.toThrow(/permission denied/);
    await expect(t.db.query('select login_paused($1)', [A])).rejects.toThrow(/permission denied/);
  });
});

describe('wrong sign-in codes', () => {
  it('10 within 15 minutes pause code sign-in; success clears it', async () => {
    for (let i = 0; i < 9; i++) await t.db.query('select record_login_failure($1)', [A]);
    expect(await t.one('select login_paused($1) as p', [A])).toEqual({ p: false });
    await t.db.query('select record_login_failure($1)', [A]);
    expect(await t.one('select login_paused($1) as p', [A])).toEqual({ p: true });
    expect(await t.one('select login_paused($1) as p', [B])).toEqual({ p: false });
    await t.reset(); await t.db.query(`update login_failures set "CreatedAt" = now() - interval '16 minutes'`); await t.asRole('service_role');   // time passes (test only)
    expect(await t.one('select login_paused($1) as p', [A])).toEqual({ p: false });   // the pause ends by itself
    await t.db.query('select clear_login_failures($1)', [A]);
    expect(await t.one('select count(*)::int n from login_failures')).toEqual({ n: 0 });
  });
});

describe('logs', () => {
  it('never contain an email address from the email service', () => {
    expect(redactAddresses('Recipient asha.k@gmail.com rejected; sender me@x.io not validated')).toBe('Recipient <email> rejected; sender <email> not validated');
  });
});
