// Second step of the sign-in for the caller's current session. On success the session is marked verified, which
// unlocks the data (row level security calls public.session_verified()). Body:
//   { code }                 the 6-digit emailed code; success also returns a token that trusts this browser for 24 h
//   { trust }                such a token: a new session of the same account on the same browser needs no code
//   { issueTrust: true }     after the authenticator app (the session is AAL2 already): a token for this browser
//   { revokeTrust: true, keep } "Sign out all other devices": every trust of the account but this browser's ends
// Tokens are random; only their salted hash is stored (trusted_browsers, migration 20261118000000).
import { admin, caller, cors, hashCode, json, MAX_ATTEMPTS, sameText, sessionOk } from '../_shared/login-code.ts';

const TRUST_HOURS = 24;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const trustHash = (token: string) => hashCode(token, 'trusted-browser');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const body = await req.json().catch(() => ({})) as { code?: unknown; trust?: unknown; issueTrust?: unknown; revokeTrust?: unknown; keep?: unknown };
  const db = admin();

  /** a new token for this browser (best effort: without the migration the sign-in simply works as before) */
  const newTrust = async () => {
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const expires = new Date(Date.now() + TRUST_HOURS * 3600_000).toISOString();
    const { error } = await db.from('trusted_browsers').insert({ token_hash: await trustHash(token), user_id: user.id, expires_at: expires });
    return error ? {} : { trust: token, trustExpiresAt: expires };
  };
  const markVerified = async () => (await db.from('verified_sessions').upsert({ session_id: sessionId, user_id: user.id })).error;

  if (typeof body.trust === 'string') {
    const { data: t } = await db.from('trusted_browsers').select('expires_at').eq('token_hash', await trustHash(body.trust)).eq('user_id', user.id).maybeSingle();
    if (!t || Date.parse(t.expires_at) < Date.now()) return json(404, { error: 'This browser is not trusted any more. Enter a code.' });
    if (await markVerified()) return json(500, { error: 'Could not finish sign-in. Try again.' });
    return json(200, { verified: true });
  }

  if (body.issueTrust === true) {
    // after the authenticator app: only an app confirmed from a verified session (aal2 alone is not enough – F1)
    if (!(await sessionOk(db, user.id, sessionId, aal))) return json(403, { error: 'Finish the 2-step sign-in first.' });
    return json(200, await newTrust());
  }

  if (body.revokeTrust === true) {
    if (!(await sessionOk(db, user.id, sessionId, aal))) return json(403, { error: 'Finish the 2-step sign-in first.' });
    let q = db.from('trusted_browsers').delete().eq('user_id', user.id);
    if (typeof body.keep === 'string' && body.keep) q = q.neq('token_hash', await trustHash(body.keep));
    await q;
    return json(200, { revoked: true });
  }

  const code = String(body.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return json(400, { error: 'Enter the 6-digit code from the email.' });
  // many wrong codes for this account (across sessions) pause code sign-in for 15 minutes; a missing function
  // (migration not run yet) answers with an error and does not pause anything
  const { data: paused } = await db.rpc('login_paused', { p_user: user.id });
  if (paused === true) return json(429, { error: 'Too many wrong codes for this account. Wait 15 minutes, or sign in with your authenticator app.' });
  const { data: row } = await db.from('login_codes').select('*').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) return json(400, { error: 'This code has expired. Send a new one.' });
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.from('login_codes').delete().eq('session_id', sessionId);
    return json(429, { error: 'Too many wrong codes. Send a new one.' });
  }
  if (!sameText(await hashCode(code, sessionId), row.code_hash)) {
    await db.from('login_codes').update({ attempts: row.attempts + 1 }).eq('session_id', sessionId);
    await db.rpc('record_login_failure', { p_user: user.id });
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return json(400, { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Send a new one.' });
  }
  if (await markVerified()) return json(500, { error: 'Could not finish sign-in. Try again.' });
  await db.from('login_codes').delete().eq('session_id', sessionId);
  await db.rpc('clear_login_failures', { p_user: user.id });
  return json(200, { verified: true, ...(await newTrust()) });
});
