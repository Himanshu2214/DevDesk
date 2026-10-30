// Account (standalone / Supabase mode): profile, password, sessions and deleting the account.
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { api } from '../api';
import { useStore } from '../store';
import { sb } from '../lib/supabase';
import { CALENDAR_RESULT, calendarCall, type CalendarStatus, connectGoogleCalendar, takeCalendarResult } from '../lib/calendar';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from '../components/Icons';
import { Empty, HoldButton, MenuSelect, Page } from '../components/ui';
import Input from '../components/smoothui/input';

export function Account() {
  if (api.kind !== 'supabase') return <Page crumb={<b>Account</b>}>
    <Empty icon="user" title="Managed outside SLATE·SPACE">{api.kind === 'sap' ? 'Your SAP user and password are managed in SAP.' : 'The sample data mode has no account.'}</Empty></Page>;
  return <CloudAccount />;
}

function CloudAccount() {
  const s = useStore();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { sb().auth.getUser().then(({ data }) => setUser(data.user)) }, []);
  if (!user) return <Page crumb={<b>Account</b>}><div className="acct"><div className="sk" style={{ height: 160, borderRadius: 14 }} /></div></Page>;
  const providers: string[] = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider ?? 'email'];
  return (
    <Page crumb={<b>Account</b>}>
      <div className="acct">
        <header className="acct-head"><h2>Account</h2><p className="muted">Your sign-in, sessions and data.</p></header>
        <Profile user={user} providers={providers} onSaved={() => s.reload()} />
        <Password hasPassword={providers.includes('email')} />
        <TwoStep />
        <DailyEmail />
        <GoogleCalendar />
        <Sessions user={user} />
        <DangerZone email={user.email ?? ''} />
      </div>
    </Page>
  );
}

function Section({ title, sub, children, danger }: { title: string; sub: string; children: React.ReactNode; danger?: boolean }) {
  return <section className={'panel acct-sec' + (danger ? ' danger' : '')}><div className="acct-sec-h"><h3>{title}</h3><p>{sub}</p></div><div className="acct-sec-b">{children}</div></section>;
}

function Profile({ user, providers, onSaved }: { user: User; providers: string[]; onSaved(): void }) {
  const s = useStore();
  const initial = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '');
  const [name, setName] = useState(initial), [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return s.toast('Enter a name', true);
    setBusy(true);
    const { error } = await sb().auth.updateUser({ data: { full_name: name.trim() } });
    setBusy(false);
    if (error) s.toast(error.message, true); else { s.toast('Name saved'); onSaved() }
  };
  return <Section title="Profile" sub="How you appear in SLATE·SPACE.">
    <form className="acct-form" onSubmit={save}>
      <label>Name<Input className="ss-input" value={name} autoComplete="name" onChange={e => setName(e.target.value)} /></label>
      <button className="btn primary" disabled={busy || name.trim() === initial} aria-busy={busy}>{busy && <Spinner />}Save name</button>
    </form>
    <dl className="acct-facts">
      <div><dt>Email</dt><dd>{user.email}</dd></div>
      <div><dt>Signs in with</dt><dd>{providers.map(p => p === 'google' ? 'Google' : p === 'email' ? 'Email and password' : p).join(' · ')}</dd></div>
      <div><dt>Member since</dt><dd>{fmtDate(user.created_at)} {user.created_at.slice(0, 4)}</dd></div>
      <div><dt>Last sign-in</dt><dd>{user.last_sign_in_at ? `${fmtDate(user.last_sign_in_at)} ${user.last_sign_in_at.slice(0, 4)}` : '—'}</dd></div>
    </dl>
  </Section>;
}

function Password({ hasPassword }: { hasPassword: boolean }) {
  const s = useStore();
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return s.toast('Use a password with at least 8 characters.', true);
    if (pw !== pw2) return s.toast('The two passwords do not match.', true);
    setBusy(true);
    const { error } = await sb().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) s.toast(error.message, true); else { s.toast(hasPassword ? 'Password changed' : 'Password set – you can now also sign in with email'); setPw(''); setPw2('') }
  };
  return <Section title="Password" sub={hasPassword ? 'Change the password you use with your email.' : 'You sign in with Google. Set a password to also sign in with your email.'}>
    <form className="acct-form" onSubmit={save}>
      <label>New password<Input className="ss-input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
      <label>Repeat password<Input className="ss-input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
      <button className="btn primary" disabled={busy || !pw} aria-busy={busy}>{busy && <Spinner />}{hasPassword ? 'Change password' : 'Set password'}</button>
    </form>
  </Section>;
}

/** Authenticator app (TOTP via Supabase MFA): set up with a QR code, then sign-ins ask for its code; the emailed code stays as fallback */
function TwoStep() {
  const s = useStore();
  const [factor, setFactor] = useState<{ id: string } | null | undefined>(undefined);   // undefined = loading
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const load = async () => { const { data } = await sb().auth.mfa.listFactors(); setFactor(data?.totp?.[0] ?? null) };
  useEffect(() => { load() }, []);
  const start = async () => {
    setBusy(true);
    // an earlier setup that was never confirmed would block a new one with the same name
    const { data: all } = await sb().auth.mfa.listFactors();
    for (const f of all?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await sb().auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SLATE·SPACE', issuer: 'SLATE·SPACE' });
    setBusy(false);
    if (error || !data) return s.toast(error?.message ?? 'The setup could not start. Try again.', true);
    setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const cancel = async () => { if (setup) await sb().auth.mfa.unenroll({ factorId: setup.id }); setSetup(null); setCode('') };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: setup.id, code });
    setBusy(false);
    if (error) { setCode(''); return s.toast('That code is not right. Type the current code from the app.', true) }
    setSetup(null); setCode(''); s.toast('Authenticator app is on – sign-ins now ask for its code'); load();
  };
  const remove = async () => {
    if (!factor) return;
    const { error } = await sb().auth.mfa.unenroll({ factorId: factor.id });
    if (error) return s.toast(/aal2|assurance/i.test(error.message) ? 'To remove it, sign out and sign in with a code from the app first.' : error.message, true);
    s.toast('Authenticator app removed – sign-ins use the emailed code again'); load();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(setup?.secret ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ } };
  return <Section title="Two-step verification" sub="Every new sign-in needs a second step. An authenticator app is faster than email and works offline; the emailed code stays available as a backup.">
    {factor === undefined ? <div className="sk" style={{ height: 40 }} /> : factor ? <>
      <p className="acct-status"><span className="acct-pill on"><Icon name="check" size={13} />Authenticator app is on</span></p>
      <p className="muted acct-note">Sign-ins ask for the 6-digit code from your app. Lost your phone? Choose “Use an emailed code” when signing in.</p>
      <HoldButton className="btn danger-btn" label="Remove authenticator app" onConfirm={remove}><Icon name="trash" size={14} />Hold to remove</HoldButton>
    </> : setup ? <form className="acct-totp" onSubmit={confirm}>
      <ol>
        <li>Open Google Authenticator (or Microsoft Authenticator, 1Password, Authy) and add a new account.</li>
        <li>Scan this code with the app:<img className="acct-qr" src={setup.qr} alt="QR code to add SLATE·SPACE to your authenticator app" width={176} height={176} /></li>
        <li>Can't scan? Enter this key instead:
          <span className="acct-secret"><code>{setup.secret}</code><button type="button" className="btn" onClick={copy}><Icon name={copied ? 'check' : 'file'} size={14} />{copied ? 'Copied' : 'Copy'}</button></span></li>
        <li>Type the 6-digit code the app shows:</li>
      </ol>
      <label className="acct-code"><Input className="ss-input auth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label="6-digit code from the app" /></label>
      <div className="acct-actions">
        <button className="btn primary" disabled={busy || code.length !== 6} aria-busy={busy}>{busy && <Spinner />}Turn on</button>
        <button type="button" className="btn" onClick={cancel}>Cancel</button>
      </div>
    </form> : <>
      <p className="acct-status"><span className="acct-pill">Using the emailed code</span></p>
      <button className="btn primary" onClick={start} disabled={busy} aria-busy={busy}>{busy ? <Spinner /> : <Icon name="plus" size={14} />}Set up authenticator app</button>
    </>}
  </Section>;
}

/** Daily email digest (edge function daily-digest, called by a scheduled job): on/off, hour and time zone */
const ZONES = ['Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'America/New_York', 'America/Los_Angeles'];
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function DailyEmail() {
  const s = useStore();
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const [saved, setSaved] = useState<{ on: boolean; hour: number; zone: string } | null>(null);
  const [on, setOn] = useState(false), [hour, setHour] = useState(8), [zone, setZone] = useState(browserZone);
  const [busy, setBusy] = useState(false), [testing, setTesting] = useState(false);
  useEffect(() => {
    sb().from('user_settings').select('"DigestEnabled","DigestHour","TimeZone"').maybeSingle().then(({ data, error }) => {
      if (error) return setSaved({ on: false, hour: 8, zone: browserZone });         // table not created yet: shows the defaults
      const v = { on: !!data?.DigestEnabled, hour: data?.DigestHour ?? 8, zone: data?.TimeZone ?? browserZone };
      setSaved(v); setOn(v.on); setHour(v.hour); setZone(v.zone);
    });
  }, [browserZone]);
  const dirty = !!saved && (saved.on !== on || saved.hour !== hour || saved.zone !== zone);
  const save = async () => {
    setBusy(true);
    const { error } = await sb().from('user_settings').upsert({ DigestEnabled: on, DigestHour: hour, TimeZone: zone }, { onConflict: 'user_id' });
    setBusy(false);
    if (error) return s.toast(/user_settings/.test(error.message) ? 'The daily email is not set up yet (setup guide, step 11).' : error.message, true);
    setSaved({ on, hour, zone }); s.toast(on ? `Daily email on – every day at ${hourLabel(hour)}` : 'Daily email off');
  };
  const test = async () => {
    setTesting(true);
    const { error } = await sb().functions.invoke('daily-digest', { body: {} });
    setTesting(false);
    if (error) {
      const ctx = (error as { context?: Response }).context;
      return s.toast(ctx?.status === 404 ? 'The daily-digest function is not deployed yet (setup guide, step 11).' : (await ctx?.json().catch(() => null))?.error || 'The email could not be sent.', true);
    }
    s.toast('Test email sent – check your inbox');
  };
  return <Section title="Daily email" sub="A short email each morning: what is overdue, due today and tomorrow, what is in progress and the hours you logged yesterday.">
    {!saved ? <div className="sk" style={{ height: 40 }} /> : <>
      <label className="acct-switch"><input type="checkbox" role="switch" checked={on} onChange={e => setOn(e.target.checked)} /><span aria-hidden="true" />Send me the daily email</label>
      <div className="acct-row">
        <label>Time<MenuSelect label="Time" value={String(hour)} onChange={v => setHour(Number(v))} options={[...Array(24)].map((_, h) => ({ value: String(h), label: hourLabel(h) }))} /></label>
        <label>Time zone<MenuSelect label="Time zone" value={zone} onChange={setZone} options={[...new Set([zone, browserZone, ...ZONES])].map(z => ({ value: z, label: z.replace(/_/g, ' ') }))} /></label>
      </div>
      <div className="acct-actions">
        <button className="btn primary" disabled={busy || !dirty} aria-busy={busy} onClick={save}>{busy && <Spinner />}Save</button>
        <button className="btn" disabled={testing} aria-busy={testing} onClick={test}>{testing ? <Spinner /> : <Icon name="chat" size={14} />}Send a test email now</button>
      </div>
    </>}
  </Section>;
}

const GoogleG = () => <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

/** Calendar: "Connect Google Calendar" (one click, Google asks for read-only permission), or a pasted iCal link for
 *  Outlook / Apple. Read by the calendar-feed function for the Calendar page. */
function GoogleCalendar() {
  const s = useStore();
  const [st, setSt] = useState<CalendarStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'connect' | 'check' | 'save'>('');
  const [showLink, setShowLink] = useState(false);
  const [saved, setSaved] = useState(''), [url, setUrl] = useState(''), [found, setFound] = useState('');
  const load = () => calendarCall<CalendarStatus>({ action: 'status' }).then(setSt).catch(() => setSt({ google: null, googleReady: false, ics: false }));
  useEffect(() => {
    const r = takeCalendarResult();
    if (r && CALENDAR_RESULT[r]) s.toast(...CALENDAR_RESULT[r]);
    load();
    sb().from('user_settings').select('"CalendarUrl"').maybeSingle().then(({ data }) => { const v = (data as { CalendarUrl?: string } | null)?.CalendarUrl ?? ''; setSaved(v); setUrl(v); if (v) setShowLink(true) });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => { setBusy('connect'); try { await connectGoogleCalendar() } catch (e) { setBusy(''); s.toast((e as Error).message, true) } };
  const disconnect = async () => {
    try { await calendarCall({ action: 'disconnect' }); s.toast('Google Calendar disconnected'); load() } catch (e) { s.toast((e as Error).message, true) }
  };
  const check = async (): Promise<boolean> => {
    setBusy('check'); setFound('');
    try {
      const r = await calendarCall<{ events: unknown[] }>({ test: url.trim(), from: new Date().toISOString(), to: new Date(Date.now() + 14 * 864e5).toISOString() });
      const n = r.events.length;
      setFound(n ? `Found ${n} meeting${n === 1 ? '' : 's'} in the next 2 weeks.` : 'The calendar works – no meetings in the next 2 weeks.');
      return true;
    } catch (e) { s.toast((e as Error).message, true); return false } finally { setBusy('') }
  };
  const saveLink = async (value: string | null) => {
    if (value && !(await check())) return;
    setBusy('save');
    const { error } = await sb().from('user_settings').upsert({ CalendarUrl: value }, { onConflict: 'user_id' });
    setBusy('');
    if (error) return s.toast(/CalendarUrl|user_settings/.test(error.message) ? 'The calendar connection is not set up yet (setup guide, step 15).' : error.message, true);
    setSaved(value ?? ''); if (!value) { setUrl(''); setFound('') }
    s.toast(value ? 'Calendar link saved – meetings now show in Calendar' : 'Calendar link removed');
  };

  return <Section title="Calendar" sub="Show your meetings – including ones others invite you to – in the Calendar page, next to your ticket due dates. Read-only: SLATE·SPACE never changes your calendar.">
    {st === null ? <div className="sk" style={{ height: 40 }} /> : <>
      {st.google ? <div className="gcal-on">
        <span className="gcal-badge"><GoogleG /></span>
        <span className="gcal-who"><b>Google Calendar connected</b><small>{st.google || 'Your Google account'}</small></span>
        <HoldButton className="btn" label="Disconnect Google Calendar" onConfirm={disconnect}><Icon name="x" size={14} />Hold to disconnect</HoldButton>
      </div> : <div className="gcal-off">
        <button className="btn gcal-connect" onClick={connect} disabled={!!busy} aria-busy={busy === 'connect'}>{busy === 'connect' ? <Spinner /> : <GoogleG />}Connect Google Calendar</button>
        <p className="muted acct-note">Google asks once for permission to <b>see</b> your calendar. If it shows “Google hasn't verified this app”, choose <b>Advanced → Go to SLATE·SPACE</b> – the app is yours.</p>
      </div>}

      <button className="acct-more" aria-expanded={showLink} onClick={() => setShowLink(v => !v)}><Icon name={showLink ? 'down' : 'right'} size={13} />Use a calendar link instead (Outlook, Apple, other)</button>
      {showLink && <div className="acct-link-box">
        <label className="acct-confirm">Calendar link (iCal / ICS)
          <Input className="ss-input" type="url" placeholder="https://…/calendar.ics" value={url} onChange={e => { setUrl(e.target.value); setFound('') }} spellCheck={false} autoComplete="off" /></label>
        <p className="muted acct-note">Outlook: Settings → Calendar → Shared calendars → Publish a calendar → ICS link. Google: Settings → your calendar → Integrate calendar → Secret address in iCal format. Keep it private.</p>
        {found && <p className="muted acct-note">{found}</p>}
        <div className="acct-actions">
          <button className="btn primary" disabled={!!busy || !url.trim() || url.trim() === saved} aria-busy={busy === 'save'} onClick={() => saveLink(url.trim())}>{busy === 'save' && <Spinner />}{saved ? 'Save new link' : 'Save link'}</button>
          <button className="btn" disabled={!!busy || !url.trim()} onClick={check}>{busy === 'check' && <Spinner />}Check</button>
          {saved && <HoldButton className="btn danger-btn" label="Remove the calendar link" onConfirm={() => saveLink(null)}><Icon name="x" size={14} />Hold to remove</HoldButton>}
        </div>
      </div>}
    </>}
  </Section>;
}

function Sessions({ user }: { user: User }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const others = async () => {
    setBusy(true);
    const { error } = await sb().auth.signOut({ scope: 'others' });
    setBusy(false);
    if (error) s.toast(error.message, true); else s.toast('Signed out on all other devices');
  };
  return <Section title="Sessions" sub="Each new sign-in needs the emailed code. Lost a device? Sign it out here.">
    <div className="acct-actions">
      <button className="btn" onClick={others} disabled={busy} aria-busy={busy}>{busy ? <Spinner /> : <Icon name="logout" size={14} />}Sign out all other devices</button>
      <button className="btn" onClick={async () => { await sb().auth.signOut(); location.reload() }}><Icon name="logout" size={14} />Sign out here</button>
    </div>
    <p className="muted acct-note">Signed in as {user.email}.</p>
  </Section>;
}

function DangerZone({ email }: { email: string }) {
  const s = useStore();
  const [typed, setTyped] = useState(''), [busy, setBusy] = useState(false);
  const ready = !!email && typed.trim().toLowerCase() === email.toLowerCase();
  const remove = async () => {
    setBusy(true);
    const { error } = await sb().functions.invoke('delete-account', { body: {} });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const msg = ctx?.status === 404 ? 'Account deletion is not set up yet: deploy the delete-account function (setup guide).' : (await ctx?.json().catch(() => null))?.error;
      setBusy(false); return s.toast(msg || 'The account could not be deleted. Try again.', true);
    }
    await sb().auth.signOut({ scope: 'local' });
    location.reload();
  };
  return <Section danger title="Delete account" sub="Removes your account and everything in it – tickets, time, transports, objects, articles and files. This cannot be undone.">
    <label className="acct-confirm">Type <b>{email}</b> to confirm
      <Input className="ss-input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} /></label>
    {ready
      ? <HoldButton className="btn danger-btn" label="Delete my account" onConfirm={remove}>{busy ? <Spinner /> : <Icon name="trash" size={14} />}Hold to delete my account</HoldButton>
      : <button className="btn" disabled><Icon name="trash" size={14} />Delete my account</button>}
  </Section>;
}
