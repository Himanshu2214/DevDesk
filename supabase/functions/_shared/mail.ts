// Sending email from the edge functions: Mailjet when MAILJET_API_KEY / MAILJET_SECRET_KEY are set (free plan: 200 a day,
// to any address once the sender address is verified in Mailjet), otherwise Resend (RESEND_API_KEY; without a verified
// domain Resend only delivers to its account owner). The sender is MAIL_FROM: "SLATE·SPACE <you@gmail.com>".

export interface Mail { to: string; subject: string; text: string; html: string }
export interface MailResult { ok: boolean; service: 'mailjet' | 'resend'; status: number; reason: string }
type Env = (k: string) => string;

/** "Name <a@b.c>" or "a@b.c" → parts */
export function parseFrom(from: string): { name: string; email: string } {
  const m = from.trim().match(/^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+)\s*>\s*$/);
  return m ? { name: m[1].trim(), email: m[2] } : { name: '', email: from.trim() };
}

/** the request for the chosen service – kept apart from sending so it can be tested */
export function buildRequest(mail: Mail, env: Env): { service: MailResult['service']; url: string; init: RequestInit } {
  const from = env('MAIL_FROM');
  if (env('MAILJET_API_KEY') && env('MAILJET_SECRET_KEY')) {
    const { name, email } = parseFrom(from);
    return {
      service: 'mailjet', url: 'https://api.mailjet.com/v3.1/send',
      init: {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${env('MAILJET_API_KEY')}:${env('MAILJET_SECRET_KEY')}`), 'Content-Type': 'application/json' },
        body: JSON.stringify({ Messages: [{ From: { Email: email, ...(name ? { Name: name } : {}) }, To: [{ Email: mail.to }], Subject: mail.subject, TextPart: mail.text, HTMLPart: mail.html }] }),
      },
    };
  }
  return {
    service: 'resend', url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
    },
  };
}

/** the service's own explanation of a failure, from its JSON answer */
export function failureReason(service: MailResult['service'], body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (service === 'resend') return String(b.message ?? '');
  // Mailjet: { ErrorMessage } for auth problems, or { Messages: [{ Status: 'error', Errors: [{ ErrorMessage }] }] }
  const msgs = (b.Messages as { Errors?: { ErrorMessage?: string }[] }[] | undefined) ?? [];
  return String(b.ErrorMessage ?? msgs.flatMap(m => m.Errors ?? []).map(e => e.ErrorMessage).filter(Boolean).join('; ') ?? '');
}

const env0: Env = k => (Deno.env.get(k) ?? '').trim();

export async function sendMail(mail: Mail, env: Env = env0): Promise<MailResult> {
  const { service, url, init } = buildRequest(mail, env);
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    // Mailjet answers 200 per request even when a message failed – the message's own status counts
    const ok = res.ok && (service !== 'mailjet' || ((body as { Messages?: { Status?: string }[] } | null)?.Messages ?? []).every(m => m.Status === 'success'));
    return { ok, service, status: res.status, reason: ok ? '' : failureReason(service, body) || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, service, status: 0, reason: (e as Error).message };
  }
}

/** a message for the person signing in when the email could not be sent */
export function explainFailure(r: MailResult, to: string): string {
  if (r.service === 'resend' && r.status === 403 && /own email|verify a domain|testing emails/i.test(r.reason))
    return `The email could not be sent to ${to}: Resend only delivers to its owner's address until a domain is verified. Set up Mailjet (setup guide, step 22) or use your authenticator app.`;
  if (r.service === 'mailjet' && /sender|not (been )?validated|unauthorized|not allowed/i.test(r.reason))
    return `The email could not be sent: Mailjet has not accepted the sender yet (${r.reason}). Verify the MAIL_FROM address in Mailjet → Senders (setup guide, step 22).`;
  if (r.service === 'mailjet' && r.status === 401) return 'The email could not be sent: the Mailjet keys are not right (setup guide, step 22).';
  return `The email could not be sent${r.reason ? ` (${r.reason})` : ''}. Try again in a moment.`;
}
