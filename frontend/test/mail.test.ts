// Email sending from the edge functions: Mailjet when its keys are set, Resend otherwise, and readable failures.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildRequest, explainFailure, failureReason, parseFrom } from '../../supabase/functions/_shared/mail';

const mail = { to: 'friend@example.com', subject: '123456 is your code', text: 'code', html: '<b>code</b>' };
const env = (vars: Record<string, string>) => (k: string) => vars[k] ?? '';

describe('mail', () => {
  it('reads the sender name and address', () => {
    expect(parseFrom('SLATE·SPACE <me@gmail.com>')).toEqual({ name: 'SLATE·SPACE', email: 'me@gmail.com' });
    expect(parseFrom('"SLATE SPACE" <me@gmail.com>')).toEqual({ name: 'SLATE SPACE', email: 'me@gmail.com' });
    expect(parseFrom('me@gmail.com')).toEqual({ name: '', email: 'me@gmail.com' });
  });

  it('uses Mailjet when both keys are set', () => {
    const r = buildRequest(mail, env({ MAILJET_API_KEY: 'pub', MAILJET_SECRET_KEY: 'priv', RESEND_API_KEY: 're', MAIL_FROM: 'SLATE·SPACE <me@gmail.com>' }));
    expect(r.service).toBe('mailjet');
    expect(r.url).toBe('https://api.mailjet.com/v3.1/send');
    expect((r.init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('pub:priv'));
    expect(JSON.parse(String(r.init.body))).toEqual({ Messages: [{ From: { Email: 'me@gmail.com', Name: 'SLATE·SPACE' }, To: [{ Email: 'friend@example.com' }],
      Subject: '123456 is your code', TextPart: 'code', HTMLPart: '<b>code</b>' }] });
  });

  it('falls back to Resend without Mailjet keys', () => {
    const r = buildRequest(mail, env({ MAILJET_API_KEY: 'pub', RESEND_API_KEY: 're', MAIL_FROM: 'me@gmail.com' }));
    expect(r.service).toBe('resend');
    expect(JSON.parse(String(r.init.body))).toMatchObject({ from: 'me@gmail.com', to: 'friend@example.com' });
  });

  it('turns failures into instructions', () => {
    expect(failureReason('mailjet', { Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'Sender is not authorized' }] }] })).toBe('Sender is not authorized');
    expect(failureReason('mailjet', { ErrorMessage: 'API key authentication/authorization failure' })).toMatch(/authentication/);
    expect(failureReason('resend', { message: 'You can only send testing emails to your own email address' })).toMatch(/own email/);
    expect(explainFailure({ ok: false, service: 'resend', status: 403, reason: 'You can only send testing emails to your own email address' }, 'friend@example.com'))
      .toMatch(/Resend only delivers to its owner.*Mailjet/);
    expect(explainFailure({ ok: false, service: 'mailjet', status: 200, reason: 'Sender is not authorized' }, 'x')).toMatch(/Verify the MAIL_FROM address in Mailjet/);
    expect(explainFailure({ ok: false, service: 'mailjet', status: 401, reason: '' }, 'x')).toMatch(/keys are not right/);
  });
});
