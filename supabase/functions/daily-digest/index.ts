// Daily email digest: overdue tickets, what is due today and tomorrow, work in progress and yesterday's hours.
// Two ways in:
//  - the scheduled job (every 30 min) with header x-digest-secret = DIGEST_SECRET → every user whose digest hour has come
//  - a signed-in user (Account → "Send a test email") → that user only, right away
// Deploy with --no-verify-jwt (the scheduled job has no user token); both paths check access themselves.
// Secrets: MAILJET_API_KEY + MAILJET_SECRET_KEY (or RESEND_API_KEY), MAIL_FROM, DIGEST_SECRET, optional APP_URL (link in the email).
import { admin, caller, cors, json, sameText, sessionOk } from '../_shared/login-code.ts';
import { type DigestTicket, digestEmail } from '../_shared/digest-email.ts';
import { redactAddresses, sendMail } from '../_shared/mail.ts';
import { releaseMailSlot, takeMailSlot } from '../_shared/limits.ts';

type Db = ReturnType<typeof admin>;
interface Due { user_id: string; email: string; full_name: string; time_zone: string; local_date: string }

/** test: "Send a test email now" – counted like a share email, so it never uses up the day's scheduled digest */
async function digestFor(db: Db, u: Due, test = false) {
  const slot = await takeMailSlot(db, test ? 'notify' : 'digest', u.user_id, u.email);
  if (!slot.ok) throw new Error(slot.reason === 'quota' ? 'the daily email budget is used up – it is kept for sign-in codes' : 'too many emails today, try again tomorrow');
  const yesterday = new Date(Date.parse(u.local_date + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  const [{ data: open, error }, { data: logged }] = await Promise.all([
    db.from('tickets_v').select('"TicketId","Title","Status","Priority","DueDate","ProjectName"').eq('user_id', u.user_id).neq('Status', 'DONE').order('Priority').order('DueDate', { nullsFirst: false }),
    db.from('worklogs').select('"Hours"').eq('user_id', u.user_id).eq('WorkDate', yesterday),
  ]);
  if (error) throw error;
  const hours = Math.round((logged ?? []).reduce((a: number, w: { Hours: number }) => a + Number(w.Hours), 0) * 100) / 100;
  const { subject, text, html } = digestEmail({ firstName: u.full_name.split(' ')[0], today: u.local_date, tickets: (open ?? []) as DigestTicket[],
    hoursYesterday: hours, appUrl: Deno.env.get('APP_URL') ?? '' });

  const sent = await sendMail({ to: u.email, subject, text, html });
  if (!sent.ok) { await releaseMailSlot(db, slot.slot); throw new Error(`${sent.service} ${sent.status}: ${redactAddresses(sent.reason)}`) }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const db = admin();
  const secret = Deno.env.get('DIGEST_SECRET') ?? '';
  const sent = req.headers.get('x-digest-secret') ?? '';

  // scheduled run: everyone who is due
  if (sent) {
    if (!secret || !sameText(sent, secret)) return json(401, { error: 'Wrong secret' });
    const { data, error } = await db.rpc('digest_due');
    if (error) return json(500, { error: error.message });
    let ok = 0, failed = 0;
    for (const u of (data ?? []) as Due[]) {
      try {
        await digestFor(db, u);
        await db.from('user_settings').update({ DigestLastSent: u.local_date }).eq('user_id', u.user_id);
        ok++;
      } catch (e) { failed++; console.error('digest failed', u.user_id, (e as Error).message) }
    }
    return json(200, { sent: ok, failed });
  }

  // test email for the signed-in user (verified session only)
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  if (!(await sessionOk(db, user.id, sessionId, aal))) return json(403, { error: 'Finish the 2-step sign-in first.' });
  const { data: s } = await db.from('user_settings').select('"TimeZone"').eq('user_id', user.id).maybeSingle();
  const tz = (s as { TimeZone?: string } | null)?.TimeZone ?? 'Asia/Kolkata';
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try {
    await digestFor(db, { user_id: user.id, email: user.email ?? '', full_name: String(user.user_metadata?.full_name ?? ''), time_zone: tz, local_date: local }, true);
  } catch (e) { console.error('digest test', (e as Error).message); return json(502, { error: `The email could not be sent (${(e as Error).message}). Try again in a moment.` }) }
  return json(200, { sent: true });
});
