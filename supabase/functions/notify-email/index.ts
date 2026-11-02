// Emails the person you just shared with (or invited to your organization), next to the in-app notification.
// Body: { kind: 'ticket', ref: <TicketUUID>, email } | { kind: 'project', ref: <project code>, email } | { kind: 'org', email }.
// It only sends for a share or invitation the caller made in the last 10 minutes, so it cannot be used to mail anyone.
// Secrets: as send-login-code (Mailjet or Resend, MAIL_FROM), APP_URL for the link.
import { admin, caller, cors, json } from '../_shared/login-code.ts';
import { sendMail } from '../_shared/mail.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RECENT_MS = 10 * 60_000;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const db = admin();
  if (aal !== 'aal2' && !(await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle()).data)
    return json(403, { error: 'Finish the 2-step sign-in first.' });

  const body = await req.json().catch(() => ({})) as { kind?: string; ref?: string; email?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) return json(400, { error: 'No email' });
  const from = String(user.user_metadata?.full_name || user.email);
  const app = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
  const recent = (iso: string) => Date.now() - Date.parse(iso) < RECENT_MS;
  const memberId = async () => ((await db.rpc('user_id_by_email', { p_email: email })).data as string | null) ?? null;

  let subject = '', line = '', detail = '', link = app + '/#inbox', button = 'Open your Inbox';
  if (body.kind === 'ticket' || body.kind === 'project') {
    const m = await memberId();
    if (!m) return json(404, { error: 'No account for this email' });
    if (body.kind === 'ticket') {
      const { data: s } = await db.from('ticket_shares').select('"Status","CreatedAt"').eq('TicketUUID', body.ref ?? '').eq('owner_id', user.id).eq('member_id', m).maybeSingle();
      const { data: tk } = await db.from('tickets').select('"TicketId","Title"').eq('TicketUUID', body.ref ?? '').eq('user_id', user.id).maybeSingle();
      if (!s || !tk || !recent(s.CreatedAt)) return json(404, { error: 'No recent share' });
      const pending = s.Status === 'pending';
      subject = pending ? `${from} wants to share ${tk.TicketId} with you` : `${from} shared ${tk.TicketId} with you`;
      line = `${tk.TicketId} · ${tk.Title}`;
      detail = pending ? 'This comes from outside your organization. Open your Inbox to accept or decline it – until you accept, you do not see it.' : 'You can open it now.';
      if (!pending) { link = `${app}/#ticket/${encodeURIComponent(tk.TicketId)}`; button = `Open ${tk.TicketId}` }
    } else {
      const { data: s } = await db.from('project_shares').select('"Status","CreatedAt"').eq('owner_id', user.id).eq('Project', body.ref ?? '').eq('member_id', m).maybeSingle();
      const { data: p } = await db.from('projects').select('"Name"').eq('user_id', user.id).eq('Project', body.ref ?? '').maybeSingle();
      if (!s || !p || !recent(s.CreatedAt)) return json(404, { error: 'No recent share' });
      const pending = s.Status === 'pending';
      subject = pending ? `${from} invites you to the project ${p.Name}` : `${from} shared the project ${p.Name} with you`;
      line = p.Name;
      detail = pending ? 'This comes from outside your organization. Open your Inbox to accept or decline it.' : 'It is now in your sidebar.';
      if (!pending) { link = app + '/#list/active'; button = 'Open SLATE·SPACE' }
    }
  } else if (body.kind === 'org') {
    const { data: me } = await db.from('org_members').select('"OrgUUID","Role"').eq('user_id', user.id).maybeSingle();
    if (!me || me.Role !== 'admin') return json(403, { error: 'Only an admin invites' });
    const { data: inv } = await db.from('org_invites').select('"CreatedAt"').eq('OrgUUID', me.OrgUUID).eq('email', email).maybeSingle();
    const { data: org } = await db.from('organizations').select('"Name"').eq('OrgUUID', me.OrgUUID).maybeSingle();
    if (!inv || !org || !recent(inv.CreatedAt)) return json(404, { error: 'No recent invitation' });
    const hasAccount = !!(await memberId());
    subject = `${from} invites you to join ${org.Name} on SLATE·SPACE`;
    line = org.Name;
    detail = hasAccount ? 'Open your Inbox to accept. Inside the organization, tickets and projects are shared without extra steps.'
      : `Create a free account with this email address (${email}), then accept the invitation in your Inbox.`;
    if (!hasAccount) { link = app + '/'; button = 'Create your account' }
  } else return json(400, { error: 'Unknown kind' });

  const sent = await sendMail({
    to: email, subject,
    text: `${subject}\n\n${line}\n${detail}\n\n${button}: ${link}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f1218">
      <p style="font-size:13px;letter-spacing:.09em;font-weight:600;margin:0 0 18px">SLATE<span style="color:#2f5fe0">·</span>SPACE</p>
      <p style="font-size:17px;font-weight:600;margin:0 0 10px">${esc(subject)}</p>
      <p style="margin:0 0 6px;padding:10px 12px;border-radius:8px;background:#f2f4f8">${esc(line)}</p>
      <p style="color:#626a76;font-size:14px;margin:12px 0 20px">${esc(detail)}</p>
      ${app ? `<a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2f5fe0;color:#fff;text-decoration:none;font-weight:600">${esc(button)}</a>` : ''}</div>`,
  });
  if (!sent.ok) { console.error('notify-email', sent.service, sent.status, sent.reason); return json(502, { error: 'The notification email could not be sent.' }) }
  return json(200, { sent: true });
});
