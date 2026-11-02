// Web Push without a payload: the server only wakes the device's service worker (signed with the VAPID key),
// and the app then asks the push-approve function what to show. No message encryption is needed that way, and the
// notification never carries anything sensitive. Plain WebCrypto, so it runs in Deno and in the tests (Node).
// Keys: `npx web-push generate-vapid-keys` → VAPID_PUBLIC_KEY (65-byte point) and VAPID_PRIVATE_KEY (32-byte d), base64url.

export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

/** VAPID private key as a WebCrypto signing key (built from the public point and d) */
export async function vapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = unb64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not a P-256 public key');
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)), d: privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** The signed token the push service checks: audience = the push service's origin, valid for 12 hours */
export async function vapidJwt(endpoint: string, subject: string, key: CryptoKey, now = Date.now()): Promise<string> {
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Wakes one device. 'gone' means the subscription no longer exists (app removed, permission withdrawn) */
export async function wake(endpoint: string, publicKey: string, subject: string, key: CryptoKey): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${await vapidJwt(endpoint, subject, key)}, k=${publicKey}`, TTL: '120', Urgency: 'high', 'Content-Length': '0' },
    });
    await res.body?.cancel();
    return res.ok ? 'sent' : res.status === 404 || res.status === 410 ? 'gone' : 'failed';
  } catch { return 'failed' }
}
