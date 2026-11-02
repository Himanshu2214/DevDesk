// Web Push without a payload: the server only wakes the device's service worker (signed with the VAPID key),
// and the app then asks the push-approve function what to show. No message encryption is needed that way, and the
// notification never carries anything sensitive. Plain WebCrypto, so it runs in Deno and in the tests (Node).
// Keys: `npx web-push generate-vapid-keys` → VAPID_PUBLIC_KEY (65-byte point) and VAPID_PRIVATE_KEY (32-byte d), base64url.

export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => {
  const t = s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0));
};

/** VAPID private key as a WebCrypto signing key (built from the public point and d) */
export async function vapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = unb64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not a P-256 public key');
  // the private key may come padded ("="), in standard base64 ("+", "/") or a byte short (leading zero dropped):
  // normalise it to the exact 32-byte base64url form WebCrypto requires
  let d: Uint8Array;
  try { d = unb64url(privateKey.replace(/\s+/g, '').replace(/=+$/, '')) } catch { throw new Error('VAPID_PRIVATE_KEY is not base64') }
  if (d.length > 32 || d.length < 30) throw new Error(`VAPID_PRIVATE_KEY should be 32 bytes, it is ${d.length} – did you paste the public key into it?`);
  if (d.length < 32) d = Uint8Array.from([...new Uint8Array(32 - d.length), ...d]);
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)), d: b64url(d), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** The signed token the push service checks: audience = the push service's origin, valid for 12 hours */
export async function vapidJwt(endpoint: string, subject: string, key: CryptoKey, now = Date.now()): Promise<string> {
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Wakes one device. 'gone': the subscription no longer exists (app removed, permission withdrawn);
 *  'refused': the push service rejected the signature (keys not a pair, or changed since the device subscribed) */
export async function wake(endpoint: string, publicKey: string, subject: string, key: CryptoKey): Promise<'sent' | 'gone' | 'refused' | 'failed'> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${await vapidJwt(endpoint, subject, key)}, k=${publicKey}`, TTL: '120', Urgency: 'high', 'Content-Length': '0' },
    });
    await res.body?.cancel();
    return res.ok ? 'sent' : res.status === 404 || res.status === 410 ? 'gone' : res.status === 401 || res.status === 403 ? 'refused' : 'failed';
  } catch { return 'failed' }
}
