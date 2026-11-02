// Approve a sign-in from your phone (like GitHub Mobile). Actions:
//   key      – the VAPID public key, so a device can subscribe (Account → Phone approval)
//   start    – new, not yet verified session: makes a 2-digit number and wakes the user's devices
//   status   – the new session asks whether it was approved (it polls every few seconds)
//   pending  – a verified device asks which request is waiting (after tapping the notification)
//   answer   – a verified device taps a number or Deny; the right number verifies the new session
//   test     – a verified device sends itself a notification
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT (mailto:you@… or https://your-site; defaults to APP_URL). Deploy with --no-verify-jwt is
// not needed: every action checks the caller's token itself.
import { admin, caller, cors, json } from '../_shared/login-code.ts';
import { vapidKey, wake } from '../_shared/webpush.ts';

const TTL_S = 120;
// tolerant of secrets pasted with quotes, brackets or spaces around them
const env = (k: string) => (Deno.env.get(k) ?? '').trim().replace(/^[<"']+|[>"']+$/g, '').trim();

/** "Chrome on Windows" from the user agent – shown on the phone so you can tell which sign-in it is */
function agentOf(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]] } return a };
const twoDigits = () => 10 + crypto.getRandomValues(new Uint32Array(1))[0] % 90;

// any unexpected failure still answers with CORS headers and the reason, so the app can show it
Deno.serve(async req => {
  try { return await handle(req) } catch (e) {
    console.error('push-approve', (e as Error).message);
    return json(500, { error: (e as Error).message || 'Phone approval failed. Try again.' });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const body = await req.json().catch(() => ({})) as { action?: string; exclude?: string; id?: string; choice?: number; deny?: boolean };
  const db = admin();
  const verified = async () => aal === 'aal2' || !!(await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle()).data;
  const publicKey = env('VAPID_PUBLIC_KEY');
  if (!publicKey || !env('VAPID_PRIVATE_KEY')) return json(404, { error: 'Phone approval is not set up yet (setup guide, step 19).' });

  /** wakes devices; drops subscriptions that no longer exist */
  const wakeAll = async (devices: { id: string; endpoint: string }[]) => {
    const key = await vapidKey(publicKey, env('VAPID_PRIVATE_KEY')).catch(e => {
      throw new Error(`The VAPID keys are not valid (${(e as Error).message}). Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY again from "npx web-push generate-vapid-keys" (setup guide, step 19).`);
    });
    // the push services' contact for this sender: VAPID_SUBJECT, else the app's address (APP_URL)
    const subject = env('VAPID_SUBJECT') || (/^https:\/\//.test(env('APP_URL')) ? env('APP_URL') : 'mailto:noreply@example.com');
    const results = await Promise.all(devices.map(d => wake(d.endpoint, publicKey, subject, key)));
    const gone = devices.filter((_, i) => results[i] === 'gone').map(d => d.id);
    if (gone.length) await db.from('push_devices').delete().in('id', gone);
    return results.filter(r => r === 'sent').length;
  };

  switch (body.action) {
    case 'key': return json(200, { publicKey });

    case 'start': {
      if (await verified()) return json(200, { verified: true });
      let q = db.from('push_devices').select('id, endpoint').eq('user_id', user.id);
      if (body.exclude) q = q.neq('endpoint', body.exclude);            // never ask the device that is signing in
      const { data: devices } = await q;
      if (!devices?.length) return json(200, { devices: 0 });
      const { data: open } = await db.from('login_approvals').select('*').eq('session_id', sessionId).maybeSingle();
      // while a request is open (a reload, or the tab regaining focus) the same number stays and no second notification goes out
      if (open?.status === 'pending' && Date.parse(open.expires_at) > Date.now())
        return json(200, { devices: devices.length, sent: devices.length, number: open.number, expiresAt: open.expires_at });
      const number = twoDigits(), choices = new Set([number]);
      while (choices.size < 3) choices.add(twoDigits());
      const expiresAt = new Date(Date.now() + TTL_S * 1000).toISOString();
      const { error } = await db.from('login_approvals').upsert({ session_id: sessionId, user_id: user.id, number, choices: shuffle([...choices]),
        agent: agentOf(req.headers.get('user-agent') ?? ''), status: 'pending', created_at: new Date().toISOString(), expires_at: expiresAt });
      if (error) return json(500, { error: 'Could not create the request. Try again.' });
      const sent = await wakeAll(devices);
      return json(200, { devices: devices.length, sent, number, expiresAt });
    }

    case 'status': {
      const { data: row } = await db.from('login_approvals').select('status, expires_at').eq('session_id', sessionId).maybeSingle();
      if (!row) return json(200, { status: 'none' });
      return json(200, { status: row.status === 'pending' && Date.parse(row.expires_at) < Date.now() ? 'expired' : row.status });
    }

    case 'pending': {
      if (!(await verified())) return json(403, { error: 'Finish signing in on this device first.' });
      const { data: row } = await db.from('login_approvals').select('session_id, choices, agent, created_at').eq('user_id', user.id)
        .eq('status', 'pending').gt('expires_at', new Date().toISOString()).neq('session_id', sessionId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      return json(200, { request: row ? { id: row.session_id, choices: row.choices, agent: row.agent, createdAt: row.created_at } : null });
    }

    case 'answer': {
      if (!(await verified())) return json(403, { error: 'Finish signing in on this device first.' });
      const { data: row } = await db.from('login_approvals').select('*').eq('session_id', body.id ?? '').eq('user_id', user.id).maybeSingle();
      if (!row || row.session_id === sessionId) return json(404, { error: 'This request no longer exists.' });
      if (row.status !== 'pending' || Date.parse(row.expires_at) < Date.now()) return json(410, { error: 'This request has expired or was already answered.' });
      // a wrong number denies the request (someone else may be trying to sign in), like GitHub does
      const ok = !body.deny && Number(body.choice) === row.number;
      if (ok) {
        const { error } = await db.from('verified_sessions').upsert({ session_id: row.session_id, user_id: user.id });
        if (error) return json(500, { error: 'Could not approve. Try again.' });
      }
      await db.from('login_approvals').update({ status: ok ? 'approved' : 'denied' }).eq('session_id', row.session_id);
      return json(200, { approved: ok, wrongNumber: !body.deny && !ok });
    }

    case 'test': {
      if (!(await verified())) return json(403, { error: 'Finish signing in on this device first.' });
      const { data: devices } = await db.from('push_devices').select('id, endpoint').eq('user_id', user.id);
      return json(200, { sent: await wakeAll(devices ?? []) });
    }

    default: return json(400, { error: 'Unknown action' });
  }
}
