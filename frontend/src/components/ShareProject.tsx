// Teams (standalone): share one of your projects with other SLATE·SPACE accounts, or leave a project shared with you.
import { useEffect, useId, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { api } from '../api';
import type { AccessLevel, Project, ProjectMember } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from './Icons';
import { Avatar, go } from './ui';
import { Modal } from './Dialogs';
import { AvatarGroup } from './AvatarGroup';
import { useQuery } from '@tanstack/react-query';
import Input from './smoothui/input';
import { ConfirmButton } from './ConfirmButton';
import { fuzzyFilter } from '../lib/fuzzy';

export const ACCESS_LABEL: Record<AccessLevel, string> = { view: 'Can view', comment: 'Can comment', edit: 'Can edit' };
/** the access level picker of the share dialogs (projects and tickets) */
export function AccessSelect({ value, onChange, label }: { value: AccessLevel; onChange(v: AccessLevel): void; label: string }) {
  return <select className="acc-sel" value={value} onChange={e => onChange(e.target.value as AccessLevel)} aria-label={label}
    title="View: read only · Comment: also comments and their own time · Edit: change everything except delete">
    {(Object.keys(ACCESS_LABEL) as AccessLevel[]).map(k => <option key={k} value={k}>{ACCESS_LABEL[k]}</option>)}</select>;
}

/** The email field of the share dialogs: while typing, people you already share with are suggested (fuzzy: name or
 *  email, any part); ↑ ↓ choose, Enter / click takes one. Someone new is still added by typing their full email. */
export function ContactInput({ value, onChange, exclude = [] }: { value: string; onChange(v: string): void; exclude?: string[] }) {
  const contacts = useQuery({ queryKey: ['share-contacts'], queryFn: () => api.shareContacts!(), enabled: !!api.shareContacts, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false), [sel, setSel] = useState(0);
  const listId = useId();
  const skip = new Set(exclude.map(e => e.toLowerCase()));
  const pool = (contacts.data ?? []).filter(c => !skip.has(c.email.toLowerCase()));
  const shown = value.trim() ? fuzzyFilter(pool, value, c => `${c.name} ${c.email}`) : pool.slice(0, 6);
  const visible = open && shown.length > 0 && !shown.some(c => c.email.toLowerCase() === value.trim().toLowerCase());
  useEffect(() => { setSel(0) }, [value]);
  const take = (email: string) => { onChange(email); setOpen(false) };
  return <div className="contact-in">
    <Input className="ss-input" type="email" placeholder="Name or email" autoFocus autoComplete="off" value={value} aria-label="Email of the person to share with"
      role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
      onChange={e => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onKeyDown={e => {
        if (!visible) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(shown.length - 1, i + 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(0, i - 1)) }
        else if (e.key === 'Enter' || e.key === 'Tab') { if (shown[sel]) { e.preventDefault(); take(shown[sel].email) } }
        else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
      }} />
    {visible && <ul className="contact-list" id={listId} role="listbox">{shown.map((c, i) =>
      <li key={c.email} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseDown={e => { e.preventDefault(); take(c.email) }} onMouseEnter={() => setSel(i)}>
        <Avatar name={c.name || c.email} size={22} /><span className="contact-who"><b>{c.name || c.email}</b>{c.name && <small>{c.email}</small>}</span></li>)}</ul>}
  </div>;
}

/** Header of a project page: the people on it (avatar group, when shared) and "Share" / "Shared by …" */
export function ShareButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const shared = !!project.SharedBy || !!project.Members;
  const people = useQuery({ queryKey: ['people', project.Project, project.Members], queryFn: () => api.projectPeople!(project.Project), enabled: shared && !!api.projectPeople, staleTime: 60_000 });
  if (!api.shareProject) return null;
  return <>
    {shared && (people.data?.length ?? 0) > 1 && <AvatarGroup people={people.data!.map(p => ({ name: p.name, email: p.email, photo: p.photo, owner: p.is_owner }))} size={26} />}
    <button className="btn share-btn" onClick={() => setOpen(true)}>
      <Icon name="users" size={14} />{project.SharedBy ? `Shared by ${project.SharedBy.split(' ')[0]}` : project.Members ? `Shared · ${project.Members}` : 'Share'}</button>
    <AnimatePresence>{open && <ShareDialog key="share" project={project} close={() => setOpen(false)} />}</AnimatePresence>
  </>;
}

function ShareDialog({ project, close }: { project: Project; close(): void }) {
  const s = useStore();
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [access, setAccess] = useState<AccessLevel>('edit');
  const mine = !project.SharedBy;
  const load = () => api.projectMembers!(project.Project).then(setMembers).catch(e => { setMembers([]); s.toast((e as Error).message, true) });
  const level = async (m: ProjectMember, v: AccessLevel) => {
    if (await s.run(() => api.setProjectAccess!(project.Project, m.member_id, v), { ok: `${m.name || m.email}: ${ACCESS_LABEL[v].toLowerCase()}` })) load();
  };
  useEffect(() => { if (mine) load() }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    let name = '';
    const ok = await s.run(async () => { name = await api.shareProject!(project.Project, email.trim(), access) });
    setBusy(false);
    if (ok) {
      const to = email.trim();
      s.toast(name === 'pending' ? `Invitation sent to ${to} – they are outside your organization and accept it first` : `${project.Name} shared with ${to}`);
      api.notifyEmail?.({ kind: 'project', ref: project.Project, email: to });
      setEmail(''); load()
    }
  };
  const remove = async (m: ProjectMember) => {
    if (await s.run(() => api.unshareProject!(project.Project, m.member_id), { ok: `${m.name || m.email} removed` })) load();
  };
  const leave = async () => {
    if (await s.run(() => api.leaveProject!(project.Project), { ok: `You left ${project.Name}` })) { close(); go('home') }
  };

  return (
    <Modal close={close} width={520} label={`Share ${project.Name}`}>
      <div className="top"><Icon name="users" size={15} /><span>{mine ? 'Share' : 'Shared project'} · {project.Name}</span><span className="sp" />
        <button className="ib" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
      {mine ? <div className="share-body">
        <p className="muted share-note">Members see this project's tickets with their time, notes, tests, files and transports. With <b>Can edit</b> they also change
          them and create tickets in it; <b>Can comment</b> adds comments and their own time; <b>Can view</b> only reads. Only you can delete tickets. Your other projects stay private.</p>
        <form className="share-add" onSubmit={add}>
          <ContactInput value={email} onChange={setEmail} exclude={(members ?? []).map(m => m.email)} />
          <AccessSelect value={access} onChange={setAccess} label="Access for the new person" />
          <button className="btn primary" disabled={!email.trim() || busy} aria-busy={busy}>{busy ? <Spinner /> : <Icon name="plus" size={14} />}Share</button>
        </form>
        <ul className="share-list">
          {members === null ? <li><div className="sk" style={{ height: 32, width: '100%' }} /></li>
            : members.length === 0 ? <li className="muted">Not shared yet. They need a SLATE·SPACE account first.</li>
            : members.map(m => <li key={m.member_id}><Avatar name={m.name || m.email} size={26} />
              <span className="share-who"><b>{m.name || m.email}</b><small>{m.email} · {m.status === 'pending' ? <span className="share-wait">invited · waiting to accept</span> : <>since {fmtDate(m.since)}</>}</small></span>
              {api.setProjectAccess && <AccessSelect value={m.access ?? 'edit'} onChange={v => level(m, v)} label={`Access for ${m.name || m.email}`} />}
              <ConfirmButton className="btn" label={`Remove ${m.name || m.email}`} onConfirm={() => remove(m)}><Icon name="x" size={13} />Remove</ConfirmButton></li>)}
        </ul>
      </div> : <div className="share-body">
        <p className="share-note"><b>{project.SharedBy}</b> shared this project with you. You can see and edit its tickets and create new ones; your own projects stay private.</p>
        <div className="acct-actions"><ConfirmButton className="btn danger-btn" label={`Leave ${project.Name}`} onConfirm={leave}><Icon name="logout" size={14} />Leave project</ConfirmButton></div>
      </div>}
    </Modal>
  );
}
