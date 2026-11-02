// Account → Organization (standalone): create one, invite people by email (they accept in their Inbox), roles, the
// "only share inside the organization" switch, leaving. Inside an organization sharing needs no invitation.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Organization as Org, OrgMember } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from './Icons';
import { Avatar } from './ui';
import { ConfirmButton } from './ConfirmButton';

export function OrganizationSection({ Section }: { Section: React.ComponentType<{ title: string; sub: string; children: React.ReactNode }> }) {
  const s = useStore();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['org'], queryFn: () => api.myOrg!(), enabled: !!api.myOrg });
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [role, setRole] = useState<'member' | 'admin'>('member'), [busy, setBusy] = useState('');
  if (!api.myOrg) return null;
  const org = q.data;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['org'] }), qc.invalidateQueries({ queryKey: ['share-contacts'] })]);
  const run = async (what: string, f: () => Promise<unknown>, ok: string) => {
    setBusy(what);
    const done = await s.run(f, { ok });
    setBusy('');
    if (done) await refresh();
    return done;
  };

  const create = async (e: React.FormEvent) => { e.preventDefault(); if (name.trim() && await run('create', () => api.createOrg!(name.trim()), `${name.trim()} created – invite your team`)) setName('') };
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = email.trim().toLowerCase();
    if (!to) return;
    let result = 'invited' as 'invited' | 'no-account';   // set inside run() below
    const ok = await run('invite', async () => { result = await api.inviteToOrg!(to, role) },
      'Invitation sent');
    if (!ok) return;
    setEmail('');
    api.notifyEmail?.({ kind: 'org', email: to });
    if (result === 'no-account') s.toast(`${to} has no account yet – the email asks them to create one, then accept in their Inbox.`);
  };
  const leave = (m: OrgMember) => run(m.userId, () => api.removeOrgMember!(m.userId), m.me ? `You left ${org?.name}` : `${m.name || m.email} removed`);

  return <Section title="Organization" sub="Your team. Inside it, tickets and projects are shared without invitations and the share dialogs suggest every member. Sharing with anyone outside starts as an invitation they accept.">
    {q.isLoading ? <div className="sk" style={{ height: 40 }} /> : !org ? <>
      <p className="muted acct-note">You are not in an organization. Create one, or accept an invitation in your Inbox.</p>
      <form className="acct-form org-create" onSubmit={create}>
        <input className="ss-input" placeholder="Organization name, e.g. SAP team" value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label="Organization name" />
        <button className="btn primary" disabled={!name.trim() || !!busy} aria-busy={busy === 'create'}>{busy === 'create' ? <Spinner /> : <Icon name="plus" size={14} />}Create organization</button>
      </form>
    </> : <OrgView org={org} busy={busy} run={run} leave={leave} invite={invite} email={email} setEmail={setEmail} role={role} setRole={setRole} />}
  </Section>;
}

function OrgView({ org, busy, run, leave, invite, email, setEmail, role, setRole }: {
  org: Org; busy: string; run(what: string, f: () => Promise<unknown>, ok: string): Promise<boolean>; leave(m: OrgMember): void;
  invite(e: React.FormEvent): void; email: string; setEmail(v: string): void; role: 'member' | 'admin'; setRole(v: 'member' | 'admin'): void;
}) {
  const [rename, setRename] = useState(org.name);
  return <>
    <div className="org-head">
      {org.admin ? <input className="ss-input org-name" value={rename} maxLength={80} aria-label="Organization name" onChange={e => setRename(e.target.value)}
        onBlur={() => { if (rename.trim() && rename.trim() !== org.name) run('name', () => api.setOrgSettings!(rename.trim(), org.onlyInternal), 'Renamed'); else setRename(org.name) }} />
        : <b className="org-name-ro">{org.name}</b>}
      <span className="acct-pill on">{org.admin ? 'Admin' : 'Member'}</span>
    </div>
    <label className={'org-switch' + (org.admin ? '' : ' ro')}>
      <input type="checkbox" checked={org.onlyInternal} disabled={!org.admin || !!busy}
        onChange={e => run('only', () => api.setOrgSettings!(org.name, e.target.checked), e.target.checked ? 'Sharing outside the organization is off' : 'Sharing outside the organization is allowed again (as invitations)')} />
      <span><b>Only share inside the organization</b><small>{org.onlyInternal ? 'Nobody in it can share with outside emails. Existing outside shares stay until removed.' : 'Members may invite outside people; they accept before they see anything.'}{!org.admin && ' Only an admin changes this.'}</small></span>
    </label>

    <h4 className="org-h">Members <span className="muted num">{org.members.length}</span></h4>
    <ul className="share-list org-list">{org.members.map(m => <li key={m.userId}>
      <Avatar name={m.name || m.email} size={26} />
      <span className="share-who"><b>{m.name || m.email}{m.me && <span className="muted"> · you</span>}</b><small>{m.email} · since {fmtDate(m.since)}</small></span>
      {org.admin ? <select className="acc-sel" value={m.role} disabled={!!busy} aria-label={`Role of ${m.name || m.email}`}
        onChange={e => run(m.userId, () => api.setOrgMember!(m.userId, e.target.value as 'admin' | 'member'), 'Role changed')}>
        <option value="member">Member</option><option value="admin">Admin</option></select> : <span className="tag">{m.role === 'admin' ? 'Admin' : 'Member'}</span>}
      {(m.me || org.admin) && <ConfirmButton className="btn" label={m.me ? `Leave ${org.name}` : `Remove ${m.name || m.email}`} onConfirm={() => leave(m)}
        description={m.me ? 'Shares made inside the organization stay; new ones to its members will need an invitation.' : 'They stay on tickets already shared with them; new shares will need an invitation.'}>
        {busy === m.userId ? <Spinner /> : <Icon name={m.me ? 'logout' : 'x'} size={13} />}{m.me ? 'Leave' : 'Remove'}</ConfirmButton>}
    </li>)}</ul>

    {org.admin && <>
      {org.invites.length > 0 && <><h4 className="org-h">Invited <span className="muted num">{org.invites.length}</span></h4>
        <ul className="share-list org-list">{org.invites.map(i => <li key={i.email}>
          <Avatar name={i.email} size={26} /><span className="share-who"><b>{i.email}</b><small>Waiting to accept · {i.role} · {fmtDate(i.since)}</small></span>
          <button className="btn" disabled={!!busy} onClick={() => run('c' + i.email, () => api.cancelOrgInvite!(i.email), 'Invitation withdrawn')}><Icon name="x" size={13} />Withdraw</button>
        </li>)}</ul></>}
      <form className="share-add org-invite" onSubmit={invite}>
        <input className="ss-input" type="email" placeholder="Email to invite" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email to invite" />
        <select className="acc-sel" value={role} onChange={e => setRole(e.target.value as 'member' | 'admin')} aria-label="Role"><option value="member">Member</option><option value="admin">Admin</option></select>
        <button className="btn primary" disabled={!email.trim() || !!busy} aria-busy={busy === 'invite'}>{busy === 'invite' ? <Spinner /> : <Icon name="plus" size={14} />}Invite</button>
      </form>
    </>}
  </>;
}
