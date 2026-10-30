// Checks the 6-digit code for the caller's current session; on success the session is marked verified,
// which unlocks the data (row level security calls public.session_verified()).
import { admin, caller, cors, hashCode, json, MAX_ATTEMPTS, sameText } from '../_shared/login-code.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId } = who;
  const code = String((await req.json().catch(() => ({}))).code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return json(400, { error: 'Enter the 6-digit code from the email.' });

  const db = admin();
  const { data: row } = await db.from('login_codes').select('*').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) return json(400, { error: 'This code has expired. Send a new one.' });
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.from('login_codes').delete().eq('session_id', sessionId);
    return json(429, { error: 'Too many wrong codes. Send a new one.' });
  }
  if (!sameText(await hashCode(code, sessionId), row.code_hash)) {
    await db.from('login_codes').update({ attempts: row.attempts + 1 }).eq('session_id', sessionId);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return json(400, { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Send a new one.' });
  }
  const { error } = await db.from('verified_sessions').upsert({ session_id: sessionId, user_id: user.id });
  if (error) return json(500, { error: 'Could not finish sign-in. Try again.' });
  await db.from('login_codes').delete().eq('session_id', sessionId);
  return json(200, { verified: true });
});
