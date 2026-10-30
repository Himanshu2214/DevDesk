// Daily email digest: overdue tickets, what is due today and tomorrow, work in progress and yesterday's hours.
// Two ways in:
//  - the scheduled job (every 30 min) with header x-digest-secret = DIGEST_SECRET → every user whose digest hour has come
//  - a signed-in user (Account → "Send a test email") → that user only, right away
// Deploy with --no-verify-jwt (the scheduled job has no user token); both paths check access themselves.
// Secrets: RESEND_API_KEY, MAIL_FROM, DIGEST_SECRET, optional APP_URL (link in the email).
import { admin, caller, cors, json, sameText } from '../_shared/login-code.ts';

type Db = ReturnType<typeof admin>;
interface Due { user_id: string; email: string; full_name: string; time_zone: string; local_date: string }
interface T { TicketId: string; Title: string; Status: string; Priority: string; DueDate: string | null; ProjectName: string }

const STATUS: Record<string, string> = { BACKLOG: 'Backlog', TODO: 'To do', PROG: 'In progress', TEST: 'Testing', BLOCK: 'Blocked', DONE: 'Done' };
const PRIO: Record<string, string> = { '1': 'Urgent', '2': 'High', '3': 'Medium', '4': 'Low' };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

async function digestFor(db: Db, u: Due) {
  const today = u.local_date, tomorrow = addDays(today, 1), yesterday = addDays(today, -1);
  const [{ data: open, error }, { data: logged }] = await Promise.all([
    db.from('tickets_v').select('"TicketId","Title","Status","Priority","DueDate","ProjectName"').eq('user_id', u.user_id).neq('Status', 'DONE').order('Priority').order('DueDate', { nullsFirst: false }),
    db.from('worklogs').select('"Hours"').eq('user_id', u.user_id).eq('WorkDate', yesterday),
  ]);
  if (error) throw error;
  const list = (open ?? []) as T[];
  const sections: [string, T[]][] = [
    ['Overdue', list.filter(t => t.DueDate && t.DueDate < today)],
    ['Due today', list.filter(t => t.DueDate === today)],
    ['Due tomorrow', list.filter(t => t.DueDate === tomorrow)],
    ['In progress', list.filter(t => (t.Status === 'PROG' || t.Status === 'TEST' || t.Status === 'BLOCK') && !(t.DueDate && t.DueDate <= tomorrow))],
  ];
  const hours = Math.round((logged ?? []).reduce((a: number, w: { Hours: number }) => a + Number(w.Hours), 0) * 100) / 100;
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const link = (t: T) => appUrl ? `${appUrl.replace(/\/?$/, '/')}#ticket/${encodeURIComponent(t.TicketId)}` : '';
  const first = u.full_name.split(' ')[0];
  const overdue = sections[0][1].length, dueToday = sections[1][1].length;
  const subject = overdue ? `${overdue} overdue · ${dueToday} due today – SLATE·SPACE` : dueToday ? `${dueToday} due today – SLATE·SPACE` : `Your day in SLATE·SPACE – ${list.length} open`;

  const text = [`Good morning${first ? ', ' + first : ''} – ${nice(today)}`, '',
    ...sections.filter(([, l]) => l.length).flatMap(([h, l]) => [h.toUpperCase(), ...l.map(t => `- ${t.TicketId} ${t.Title} (${STATUS[t.Status] ?? t.Status}${t.DueDate ? ', due ' + t.DueDate : ''})${link(t) ? '\n  ' + link(t) : ''}`), '']),
    sections.every(([, l]) => !l.length) ? 'Nothing overdue or due soon. ' : '',
    `Yesterday you logged ${hours} h.`, `${list.length} open tickets in total.`, '',
    'You get this email because the daily digest is on (Account → Daily email).'].join('\n');

  const row = (t: T) => `<tr><td style="padding:7px 0;border-top:1px solid #eceef2;vertical-align:top;width:76px;color:#626a76;font-size:12px">${esc(t.TicketId)}</td>
    <td style="padding:7px 0;border-top:1px solid #eceef2"><a href="${esc(link(t))}" style="color:#0f1218;text-decoration:none;font-weight:600">${esc(t.Title)}</a>
    <div style="color:#626a76;font-size:12px">${esc(STATUS[t.Status] ?? t.Status)} · ${esc(PRIO[t.Priority] ?? '')} · ${esc(t.ProjectName)}${t.DueDate ? ' · due ' + esc(t.DueDate) : ''}</div></td></tr>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f1218">
    <p style="font-size:13px;letter-spacing:.09em;font-weight:600;margin:0 0 18px">SLATE<span style="color:#2f5fe0">·</span>SPACE</p>
    <h1 style="font-size:20px;margin:0 0 4px">Good morning${first ? ', ' + esc(first) : ''}</h1>
    <p style="color:#626a76;margin:0 0 20px">${nice(today)} · ${list.length} open tickets · ${hours} h logged yesterday</p>
    ${sections.filter(([, l]) => l.length).map(([h, l]) => `<h2 style="font-size:14px;margin:22px 0 6px;color:${h === 'Overdue' ? '#d92d20' : '#0f1218'}">${h} <span style="color:#626a76;font-weight:400">${l.length}</span></h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${l.slice(0, 15).map(row).join('')}</table>${l.length > 15 ? `<p style="color:#626a76;font-size:12px">and ${l.length - 15} more</p>` : ''}`).join('')}
    ${sections.every(([, l]) => !l.length) ? '<p>Nothing overdue or due soon – a calm day.</p>' : ''}
    ${appUrl ? `<p style="margin:24px 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#2f5fe0;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open SLATE·SPACE</a></p>` : ''}
    <p style="color:#8a909a;font-size:12px;margin-top:28px">You get this email because the daily digest is on. Turn it off in Account → Daily email.</p></div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: u.email, subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
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
  if (aal !== 'aal2') {
    const { data: v } = await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
    if (!v) return json(403, { error: 'Finish the 2-step sign-in first.' });
  }
  const { data: s } = await db.from('user_settings').select('"TimeZone"').eq('user_id', user.id).maybeSingle();
  const tz = (s as { TimeZone?: string } | null)?.TimeZone ?? 'Asia/Kolkata';
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try {
    await digestFor(db, { user_id: user.id, email: user.email ?? '', full_name: String(user.user_metadata?.full_name ?? ''), time_zone: tz, local_date: local });
  } catch { return json(502, { error: 'The email could not be sent. Try again in a moment.' }) }
  return json(200, { sent: true });
});
