// Phone approval: who may register devices and see requests (PGlite), and the VAPID signature the push services check.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { freshDb } from './db';
import { b64url, unb64url, vapidJwt, vapidKey } from '../../supabase/functions/_shared/webpush';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-0000-0000-0000-000000000001', SA2 = 'aaaaaaaa-0000-0000-0000-000000000002', SB = 'bbbbbbbb-0000-0000-0000-000000000001';
const device = (ep: string) => `insert into push_devices (endpoint, p256dh, auth, label) values ('https://push.example/${ep}', 'k', 'a', 'Phone')`;

describe('push_devices and login_approvals', () => {
  it('only a verified session registers and sees its own devices', async () => {
    const t = await freshDb();
    await t.user(A); await t.user(B);
    await t.verify(SA, A); await t.verify(SB, B);

    await t.as(A, SA2);                                     // signed in, second step not done yet
    await expect(t.db.exec(device('a-new'))).rejects.toThrow(/row-level security/);

    await t.as(A, SA);
    await t.db.exec(device('a-phone'));
    await t.as(B, SB);
    await t.db.exec(device('b-phone'));
    expect((await t.rows<{ label: string }>('select endpoint from push_devices')).length).toBe(1);   // B sees only B's
    await t.db.exec(`delete from push_devices where endpoint = 'https://push.example/a-phone'`);   // cannot touch A's
    await t.as(A, SA);
    expect(await t.rows('select 1 from push_devices')).toHaveLength(1);
    await expect(t.db.exec(`insert into push_devices (endpoint, p256dh, auth) values ('http://insecure', 'k', 'a')`)).rejects.toThrow(/check/);
  }, 60000);

  it('approval requests are invisible to signed-in users', async () => {
    const t = await freshDb();
    await t.user(A); await t.verify(SA, A);
    await t.asRole('service_role');
    await t.db.query(`insert into login_approvals (session_id, user_id, number, choices, expires_at) values ($1, $2, 47, '{12,47,83}', now() + interval '2 minutes')`, [SA2, A]);
    await t.as(A, SA);
    await expect(t.db.query('select number from login_approvals')).rejects.toThrow(/permission denied/);
  }, 60000);
});

describe('VAPID', () => {
  it('signs a token the push service can verify with the public key', async () => {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)));
    const d = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d!;

    const jwt = await vapidJwt('https://fcm.googleapis.com/fcm/send/abc', 'mailto:me@example.com', await vapidKey(pub, d), Date.UTC(2026, 10, 2));
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(unb64url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(unb64url(p)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: Date.UTC(2026, 10, 2) / 1000 + 43200, sub: 'mailto:me@example.com' });
    const ok = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64url(sig), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it('rejects a key that is not a P-256 public key', async () => {
    await expect(vapidKey(b64url(new Uint8Array(32)), 'x')).rejects.toThrow(/VAPID_PUBLIC_KEY/);
  });
});
