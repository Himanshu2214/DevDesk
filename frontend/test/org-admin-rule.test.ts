// The database itself keeps an admin in every organization that has members – whatever code makes the change, and
// even if two admins act at the same moment (the later commit fails).
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './db';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let t: Awaited<ReturnType<typeof freshDb>>;

beforeEach(async () => {
  t = await freshDb();
  await t.user(A, 'a@team.io', 'Asha'); await t.user(B, 'b@team.io', 'Ben');
  await t.verify(SA, A); await t.verify(SB, B);
  await t.as(A, SA);
  await t.db.query(`select create_org('Team')`);
  await t.db.query(`select invite_to_org('b@team.io', 'admin')`);
  await t.acceptAll(B, SB);
  await t.reset();
}, 60_000);

describe('an organization always keeps an admin', () => {
  it('rejects a commit that leaves members without an admin', async () => {
    // what two admins demoting each other at the same moment would end in, written directly
    await expect(t.db.exec(`begin; update org_members set "Role" = 'member'; commit;`)).rejects.toThrow(/at least one admin/);
    await t.db.exec('rollback').catch(() => {});
    expect(await t.rows(`select "Role" from org_members order by user_id`)).toEqual([{ Role: 'admin' }, { Role: 'admin' }]);
  });

  it('rejects removing the last admin while members remain', async () => {
    await t.db.query(`update org_members set "Role" = 'member' where user_id = $1`, [B]);
    await expect(t.db.query('delete from org_members where user_id = $1', [A])).rejects.toThrow(/at least one admin/);
  });

  it('allows normal changes: hand over first, the last person leaving, the organization being removed', async () => {
    await t.db.exec(`begin; update org_members set "Role" = 'member' where user_id = '${A}'; commit;`);   // B stays admin
    await t.db.query('delete from org_members where user_id = $1', [A]);
    await t.db.query('delete from org_members where user_id = $1', [B]);                                   // nobody left: fine
    await t.db.query(`delete from organizations`);
    expect(await t.one('select count(*)::int n from org_members')).toEqual({ n: 0 });
  });
});
