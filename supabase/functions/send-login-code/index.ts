// Sends the 6-digit 2-step code for the caller's current session by email (Mailjet, or Resend – see _shared/mail.ts).
// Secrets: MAILJET_API_KEY + MAILJET_SECRET_KEY (or RESEND_API_KEY), MAIL_FROM ("SLATE·SPACE <you@gmail.com>"), CODE_PEPPER, optional APP_ORIGIN.
import { admin, caller, CODE_TTL_MIN, cors, hashCode, json, RESEND_AFTER_S } from '../_shared/login-code.ts';
import { explainFailure, redactAddresses, sendMail } from '../_shared/mail.ts';
import { releaseMailSlot, takeMailSlot } from '../_shared/limits.ts';

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

  // email budget: at most 8 codes an hour and 20 a day per account; the authenticator app stays open
  const slot = await takeMailSlot(db, 'code', user.id, user.email ?? '');
  if (!slot.ok) return json(429, { error: slot.reason === 'quota'
    ? 'The email service has reached its daily limit. Use your authenticator app, or try again later.'
    : `You asked for many codes in the last ${slot.reason === 'user-hour' ? 'hour' : '24 hours'}. Use the latest code we sent or your authenticator app – or try again later.` });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { error: saveErr } = await db.from('login_codes').upsert({
    session_id: sessionId, user_id: user.id, code_hash: await hashCode(code, sessionId),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(), attempts: 0, sent_at: new Date().toISOString(),
  });
  if (saveErr) { await releaseMailSlot(db, slot.slot); return json(500, { error: 'Could not create a code. Try again.' }) }

  const sent = await sendMail({
    to: user.email!, subject: `${code} is your SLATE·SPACE sign-in code`,
    text: `Your SLATE·SPACE sign-in code is ${code}.\nIt expires in ${CODE_TTL_MIN} minutes. If you did not try to sign in, change your password.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0f1218">
      <p style="font-size:13px;letter-spacing:.09em;font-weight:600;margin:0 0 18px">SLATE<span style="color:#2f5fe0">·</span>SPACE</p>
      <p style="margin:0 0 8px">Your sign-in code:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:.2em;margin:0 0 16px">${code}</p>
      <p style="color:#626a76;font-size:13px;margin:0">It expires in ${CODE_TTL_MIN} minutes. If you did not try to sign in, change your password.</p></div>`,
  });
  if (!sent.ok) {
    // a code that never arrived must not block "Send a new code" for 60 seconds
    await db.from('login_codes').delete().eq('session_id', sessionId);
    await releaseMailSlot(db, slot.slot);                                       // an email that never went out does not count
    console.error('send-login-code', sent.service, sent.status, redactAddresses(sent.reason));
    return json(502, { error: explainFailure(sent, user.email ?? 'your address') });
  }
  return json(200, { sent: true, expiresInMinutes: CODE_TTL_MIN });
});
