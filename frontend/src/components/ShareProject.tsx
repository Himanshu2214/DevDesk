// Teams (standalone): share one of your projects with other SLATE·SPACE accounts, or leave a project shared with you.
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { api } from '../api';
import type { Project, ProjectMember } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { Icon, Spinner } from './Icons';
import { Avatar, go, HoldButton } from './ui';
import { Modal } from './Dialogs';
import Input from './smoothui/input';

/** Header button on a project page: "Share" for your projects, "Shared by …" with Leave for projects shared with you */
export function ShareButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  if (!api.shareProject) return null;
  return <>
    <button className="btn share-btn" onClick={() => setOpen(true)}>
      <Icon name="users" size={14} />{project.SharedBy ? `Shared by ${project.SharedBy.split(' ')[0]}` : project.Members ? `Shared · ${project.Members}` : 'Share'}</button>
    <AnimatePresence>{open && <ShareDialog key="share" project={project} close={() => setOpen(false)} />}</AnimatePresence>
  </>;
}

function ShareDialog({ project, close }: { project: Project; close(): void }) {
  const s = useStore();
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false);
  const mine = !project.SharedBy;
  const load = () => api.projectMembers!(project.Project).then(setMembers).catch(e => { setMembers([]); s.toast((e as Error).message, true) });
  useEffect(() => { if (mine) load() }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    let name = '';
    const ok = await s.run(async () => { name = await api.shareProject!(project.Project, email.trim()) });
    setBusy(false);
    if (ok) { s.toast(`${project.Name} shared with ${name || email.trim()}`); setEmail(''); load() }
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
        <p className="muted share-note">Members see and edit this project's tickets – with their time, notes, tests, files and transports – and can create tickets in it.
          Only you can delete tickets. Your other projects stay private.</p>
        <form className="share-add" onSubmit={add}>
          <Input className="ss-input" type="email" placeholder="Their SLATE·SPACE email" autoFocus value={email} onChange={e => setEmail(e.target.value)} aria-label="Email of the person to share with" />
          <button className="btn primary" disabled={!email.trim() || busy} aria-busy={busy}>{busy ? <Spinner /> : <Icon name="plus" size={14} />}Share</button>
        </form>
        <ul className="share-list">
          {members === null ? <li><div className="sk" style={{ height: 32, width: '100%' }} /></li>
            : members.length === 0 ? <li className="muted">Not shared yet. They need a SLATE·SPACE account first.</li>
            : members.map(m => <li key={m.member_id}><Avatar name={m.name || m.email} size={26} />
              <span className="share-who"><b>{m.name || m.email}</b><small>{m.email} · since {fmtDate(m.since)}</small></span>
              <HoldButton className="btn" label={`Remove ${m.name || m.email}`} onConfirm={() => remove(m)}><Icon name="x" size={13} />Remove</HoldButton></li>)}
        </ul>
      </div> : <div className="share-body">
        <p className="share-note"><b>{project.SharedBy}</b> shared this project with you. You can see and edit its tickets and create new ones; your own projects stay private.</p>
        <div className="acct-actions"><HoldButton className="btn danger-btn" label={`Leave ${project.Name}`} onConfirm={leave}><Icon name="logout" size={14} />Hold to leave</HoldButton></div>
      </div>}
    </Modal>
  );
}
