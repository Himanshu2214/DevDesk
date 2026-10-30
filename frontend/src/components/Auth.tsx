// Sign-in for the standalone (Supabase) backend: email + password or Google (with an invisible Turnstile bot check),
// email confirmation, password reset by link, and the second step that unlocks the data for this session:
// a code from an authenticator app (Supabase MFA, AAL2) or, as fallback, a code sent by email.
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { appUrl, getRemember, sb, setRemember, supabaseConfigured } from '../lib/supabase';
import { Icon, LogoMark, Spinner } from './Icons';
import Input from './smoothui/input';
import { RibbonArt } from './RibbonArt';
import { useTurnstile } from './Turnstile';

type Stage = 'loading' | 'signed-out' | 'recovery' | 'app-code' | 'code' | 'ready';
type View = 'signin' | 'register' | 'forgot' | 'sent';

/** Shows the app only for a signed-in user whose session has passed the second step */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [hasApp, setHasApp] = useState(false);
  const decide = async (s: Session | null) => {
    if (!s) return setStage('signed-out');
    const { data } = await sb().rpc('session_verified');
    if (data) return setStage('ready');
    // an enrolled authenticator app means the session can be raised to AAL2: ask for its code first
    const { data: aal } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
    const app = aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2';
    setHasApp(app);
    setStage(app ? 'app-code' : 'code');
  };
  const decideNow = async () => decide((await sb().auth.getSession()).data.session);
  useEffect(() => {
    if (!supabaseConfigured) return;
    sb().auth.getSession().then(({ data }) => decide(data.session));
    const { data: sub } = sb().auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') return setStage('recovery');
      if (event === 'SIGNED_OUT') return setStage('signed-out');
      if (event === 'SIGNED_IN') decide(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  // the static boot screen in index.html stays until we know what to show; the app's own preloader removes it otherwise
  useEffect(() => { if (stage !== 'loading' && stage !== 'ready') document.getElementById('boot')?.remove() }, [stage]);

  if (!supabaseConfigured) return <AuthCard title="Setup needed"><p className="auth-note">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.supabase.local</code> (see docs/SUPABASE-SETUP.md).</p></AuthCard>;
  if (stage === 'ready') return <>{children}</>;
  if (stage === 'loading') return null;
  if (stage === 'recovery') return <NewPassword onDone={decideNow} />;
  if (stage === 'app-code') return <AppCodeStep onVerified={() => setStage('ready')} onUseEmail={() => setStage('code')} />;
  if (stage === 'code') return <CodeStep onVerified={() => setStage('ready')} onUseApp={hasApp ? () => setStage('app-code') : undefined} />
  return <SignedOut />;
}

/** Window shell: a dark rounded window on a graphite backdrop – form on the left, animated ribbon artwork on the right */
function AuthCard({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return <div className="auth-page">
    <main className="auth-window">
      <span className="auth-dots" aria-hidden="true"><i /><i /><i /></span>
      <div className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span className="auth-mark"><LogoMark size={20} /></span><span className="auth-word">SLATE<span className="brand-dot">·</span>SPACE</span></div>
        <h1 id="auth-title">{title}</h1>{sub && <p className="auth-sub">{sub}</p>}{children}
      </div>
      <aside className="auth-art" aria-hidden="true"><RibbonArt /><span className="auth-art-tag">Work. Without friction.</span></aside>
    </main>
  </div>;
}

/** Input with a floating label: the label sits inside the field and glides up on focus or when filled */
type FieldProps = { label: string; value: string; onChange(v: string): void; trailing?: React.ReactNode; className?: string; type?: string }
  & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'className' | 'placeholder' | 'type'>;
function Field({ label, value, onChange, trailing, className = '', type = 'text', ...rest }: FieldProps) {
  const id = useId();
  return <div className={'fl' + (trailing ? ' has-trailing' : '')}>
    <Input {...rest} id={id} type={type} placeholder=" " className={'fl-in ' + className} value={value} onChange={e => onChange(e.target.value)} />
    <label htmlFor={id}>{label}</label>{trailing}
  </div>;
}

/** Password field with a show / hide toggle */
function PasswordField(p: Omit<FieldProps, 'type' | 'trailing'>) {
  const [show, setShow] = useState(false);
  return <Field {...p} type={show ? 'text' : 'password'} trailing={
    <button type="button" className="fl-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
      <Icon name={show ? 'eye-off' : 'eye'} size={16} /></button>} />;
}

/** Error line; re-keyed per message so a new error shakes once */
const AuthError = ({ text }: { text: string }) => text ? <p key={text} className="auth-err" role="alert">{text}</p> : null;

/** Turns Supabase auth errors into instructions */
function say(e: { message?: string } | null): string {
  const m = e?.message ?? '';
  if (/invalid login credentials/i.test(m)) return 'Email or password is not right.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first – open the link we sent you.';
  if (/already registered|already exists/i.test(m)) return 'An account with this email exists. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password with at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/captcha/i.test(m)) return 'The bot check did not pass. Reload the page and try again.';
  return m || 'Something went wrong. Try again.';
}

/** Whether the Google provider is enabled in the Supabase project (public auth settings endpoint) */
async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY) } });
    return !!(await res.json())?.external?.google;
  } catch { return true }   // if the check itself fails, let Supabase answer
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    // ask Supabase first, so a disabled provider shows a message here instead of Supabase's raw error page
    if (!(await googleEnabled())) { setErr('Google sign-in is not switched on for this workspace yet. Use email and password for now.'); setBusy(false); return }
    const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) { setErr(say(error)); setBusy(false) }
  };
  return <>
    <button type="button" className="btn auth-google" onClick={go} disabled={busy} aria-busy={busy}>
      {busy ? <Spinner /> : <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>}
      Continue with Google</button>
    <AuthError text={err} />
  </>;
}

function SignedOut() {
  const [view, setView] = useState<View>('signin');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [remember, setRem] = useState(getRemember);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [sentText, setSentText] = useState<React.ReactNode>('');
  const bot = useTurnstile();
  const to = (v: View) => { setView(v); setErr('') };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (view === 'register' && pw !== pw2) return setErr('The two passwords do not match.');
    if (view === 'register' && pw.length < 8) return setErr('Use a password with at least 8 characters.');
    if (!bot.ready) return setErr('One moment – checking that you are not a bot.');
    setBusy(true);
    const captchaToken = bot.token;                      // undefined when no bot check is configured
    if (view === 'signin') {
      setRemember(remember);                           // decides where the session is kept (see lib/supabase.ts)
      const { error } = await sb().auth.signInWithPassword({ email, password: pw, options: { captchaToken } });
      if (error) setErr(say(error));                     // success: AuthGate moves on to the second step
    } else if (view === 'register') {
      const { data, error } = await sb().auth.signUp({ email, password: pw, options: { emailRedirectTo: appUrl(), data: { full_name: name.trim() }, captchaToken } });
      if (error) setErr(say(error));
      else if (!data.session) { setSentText(<>We sent a confirmation link to <b>{email}</b>. Open it to activate your account, then sign in.</>); to('sent') }
    } else if (view === 'forgot') {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: appUrl(), captchaToken });
      if (error) setErr(say(error));
      else { setSentText(<>If an account exists for <b>{email}</b>, a link to set a new password is on its way.</>); to('sent') }
    }
    bot.reset();                                          // Turnstile tokens are single-use
    setBusy(false);
  };
  if (view === 'sent') return <AuthCard title="Check your email" sub={sentText}>
    <button type="button" className="btn auth-wide" onClick={() => to('signin')}><Icon name="move" size={14} />Back to sign in</button></AuthCard>;
  const title = { signin: 'Welcome Back!', register: 'Create your account', forgot: 'Reset your password' }[view];
  const sub = { signin: 'Enter your info to sign in to your workspace.', register: 'Free to use. Your data stays private to you.', forgot: 'We will email you a link to set a new password.' }[view];
  const action = { signin: busy ? 'Signing in…' : 'Sign in', register: busy ? 'Creating account…' : 'Create account', forgot: busy ? 'Sending…' : 'Send reset link' }[view];
  return <AuthCard title={title} sub={sub}>
    <form className="auth-form" onSubmit={submit} noValidate>
      {view === 'register' && <Field label="Name" autoComplete="name" value={name} onChange={setName} />}
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
      {view !== 'forgot' && <PasswordField label="Password" autoComplete={view === 'signin' ? 'current-password' : 'new-password'} required value={pw} onChange={setPw} />}
      {view === 'register' && <PasswordField label="Repeat password" autoComplete="new-password" required value={pw2} onChange={setPw2} />}
      {view === 'signin' && <div className="auth-row">
        <label className="auth-check"><input type="checkbox" checked={remember} onChange={e => setRem(e.target.checked)} /><span className="auth-box" aria-hidden="true"><Icon name="check" size={12} /></span>Remember me</label>
        <button type="button" className="auth-link" onClick={() => to('forgot')}>Forgot password?</button></div>}
      {bot.widget}
      <AuthError text={err || bot.error} />
      <button className="btn primary auth-wide auth-submit" disabled={busy || !email || (view !== 'forgot' && !pw)} aria-busy={busy}>
        {busy && <Spinner />}{action}{!busy && <Icon name="move" size={15} />}</button>
    </form>
    {view !== 'forgot' && <><div className="auth-or"><span>or</span></div><GoogleButton /></>}
    <p className="auth-switch">{view === 'signin'
      ? <>New here? <button type="button" className="auth-link" onClick={() => to('register')}>Create an account</button></>
      : <>Have an account? <button type="button" className="auth-link" onClick={() => to('signin')}>Sign in</button></>}</p>
  </AuthCard>;
}

/** Opened from the reset email: set a new password, then continue to the 2-step code */
function NewPassword({ onDone }: { onDone(): void }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) return setErr('Use a password with at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    setBusy(true);
    const { error } = await sb().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(say(error)); else onDone();
  };
  return <AuthCard title="Set a new password" sub="Choose a password with at least 8 characters.">
    <form className="auth-form" onSubmit={submit} noValidate>
      <PasswordField label="New password" autoComplete="new-password" autoFocus value={pw} onChange={setPw} />
      <PasswordField label="Repeat password" autoComplete="new-password" value={pw2} onChange={setPw2} />
      <AuthError text={err} />
      <button className="btn primary auth-wide auth-submit" disabled={busy || !pw} aria-busy={busy}>{busy && <Spinner />}{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  </AuthCard>;
}

/** Second step: a 6-digit code emailed for this session (edge functions send-login-code / verify-login-code) */
/** Second step with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, …): raises the session to AAL2 */
function AppCodeStep({ onVerified, onUseEmail }: { onVerified(): void; onUseEmail(): void }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { data: f, error: listErr } = await sb().auth.mfa.listFactors();
    const factor = f?.totp?.[0];
    if (listErr || !factor) { setBusy(false); return setErr('No authenticator app is set up for this account. Use the emailed code.') }
    const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) { setErr(/invalid|expired/i.test(error.message) ? 'That code is not right or has expired. Use the current code from the app.' : say(error)); setCode(''); return }
    onVerified();
  };
  return <AuthCard title="Enter the code from your app" sub="Open your authenticator app and type the 6-digit code for SLATE·SPACE.">
    <form className="auth-form" onSubmit={verify} noValidate>
      <Field label="6-digit code" className="auth-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
        value={code} onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))} />
      <AuthError text={err} />
      <button className="btn primary auth-wide auth-submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy && <Spinner />}{busy ? 'Verifying…' : 'Verify'}</button>
    </form>
    <p className="auth-switch"><button type="button" className="auth-link" onClick={onUseEmail}>Lost your phone? Use an emailed code</button>
      <span aria-hidden="true"> · </span><button type="button" className="auth-link" onClick={() => sb().auth.signOut()}>Use another account</button></p>
  </AuthCard>;
}

function CodeStep({ onVerified, onUseApp }: { onVerified(): void; onUseApp?(): void }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState('');
  const [wait, setWait] = useState(0), [email, setEmail] = useState('');
  const sentOnce = useRef(false);
  const errorOf = async (e: unknown) => {
    const ctx = (e as { context?: Response }).context;
    if (ctx?.status === 404) return 'Sign-in codes are not set up yet: the code functions are not deployed (setup guide, step 6).';
    try { return (await ctx?.json())?.error as string } catch { return '' }
  };
  const send = async () => {
    setErr(''); setInfo('');
    const { error } = await sb().functions.invoke('send-login-code', { body: {} });
    if (error) setErr((await errorOf(error)) || 'The code could not be sent. Try again.');
    else { setInfo('We sent a 6-digit code to your email. It is valid for 10 minutes.'); setWait(60) }
  };
  useEffect(() => {
    sb().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    if (!sentOnce.current) { sentOnce.current = true; send() }
  }, []);
  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(id) }, [wait]);
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    setBusy(true);
    const { error } = await sb().functions.invoke('verify-login-code', { body: { code } });
    setBusy(false);
    if (error) { setErr((await errorOf(error)) || 'That did not work. Try again.'); return }
    onVerified();
  };
  return <AuthCard title="Enter your sign-in code" sub={<>Second step for <b>{email || 'your account'}</b>. Check your inbox (and spam).</>}>
    <form className="auth-form" onSubmit={verify} noValidate>
      <Field label="6-digit code" className="auth-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
        value={code} onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))} />
      {info && !err && <p className="auth-info" role="status">{info}</p>}
      <AuthError text={err} />
      <button className="btn primary auth-wide auth-submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy && <Spinner />}{busy ? 'Verifying…' : 'Verify'}</button>
    </form>
    <p className="auth-switch"><button type="button" className="auth-link" disabled={wait > 0} onClick={send}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
      {onUseApp && <><span aria-hidden="true"> · </span><button type="button" className="auth-link" onClick={onUseApp}>Use your authenticator app</button></>}
      <span aria-hidden="true"> · </span><button type="button" className="auth-link" onClick={() => sb().auth.signOut()}>Use another account</button></p>
  </AuthCard>;
}

export const signOut = async () => { await sb().auth.signOut(); location.reload() };
