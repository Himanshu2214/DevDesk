// Sends the 6-digit 2-step code for the caller's current session by email (Resend).
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "SLATE·SPACE <login@yourdomain.com>"), CODE_PEPPER, optional APP_ORIGIN.
import { admin, caller, CODE_TTL_MIN, cors, hashCode, json, RESEND_AFTER_S } from '../_shared/login-code.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId } = who;
  const db = admin();

  const { data: last } = await db.from('login_codes').select('sent_at').eq('session_id', sessionId).maybeSingle();
  if (last && Date.now() - Date.parse(last.sent_at) < RESEND_AFTER_S * 1000)
    return json(429, { error: `A code was just sent. You can ask for a new one in ${RESEND_AFTER_S} seconds.` });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { error: saveErr } = await db.from('login_codes').upsert({
    session_id: sessionId, user_id: user.id, code_hash: await hashCode(code, sessionId),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(), attempts: 0, sent_at: new Date().toISOString(),
  });
  if (saveErr) return json(500, { error: 'Could not create a code. Try again.' });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM'), to: user.email, subject: `${code} is your SLATE·SPACE sign-in code`,
      text: `Your SLATE·SPACE sign-in code is ${code}.\nIt expires in ${CODE_TTL_MIN} minutes. If you did not try to sign in, change your password.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0f1218">
        <p style="font-size:13px;letter-spacing:.09em;font-weight:600;margin:0 0 18px">SLATE<span style="color:#2f5fe0">·</span>SPACE</p>
        <p style="margin:0 0 8px">Your sign-in code:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:.2em;margin:0 0 16px">${code}</p>
        <p style="color:#626a76;font-size:13px;margin:0">It expires in ${CODE_TTL_MIN} minutes. If you did not try to sign in, change your password.</p></div>`,
    }),
  });
  if (!res.ok) return json(502, { error: 'The email could not be sent. Try again in a moment.' });
  return json(200, { sent: true, expiresInMinutes: CODE_TTL_MIN });
});
