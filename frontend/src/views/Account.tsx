// Account (standalone / Supabase mode): profile, password, sessions and deleting the account.
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { api } from '../api';
import { useStore } from '../store';
import { sb } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from '../components/Icons';
import { Empty, HoldButton, Page } from '../components/ui';
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
