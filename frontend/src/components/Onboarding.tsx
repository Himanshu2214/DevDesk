// First-run setup for new standalone accounts (SmoothUI Animated Stepper): name and role, first project, look and avatar,
// daily email, Google Calendar. Shown once – finishing or skipping marks the account as onboarded.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store';
import { sb } from '../lib/supabase';
import { getMode, type Mode, setMode } from '../lib/theme';
import { AVATAR_LOOKS, saveAvatar } from '../lib/avatar';
import { connectGoogleCalendar } from '../lib/calendar';
import AnimatedStepper from './smoothui/animated-stepper';
import FloatInput from './smoothui/float-input';
import ThemeToggle from './smoothui/theme-toggle';
import { Icon, Spinner } from './Icons';
import { Avatar } from './ui';
import { Modal } from './Dialogs';

const ROLES = ['ABAP developer', 'Functional consultant', 'Tech lead', 'Something else'];
const COLORS = ['#4C7DFF', '#4CB782', '#F2994A', '#BB87FC', '#26B5CE', '#EB5757'];
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const codeOf = (name: string) => name.normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 6)
  || name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);

export function Onboarding({ close }: { close(): void }) {
  const s = useStore();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.user.fullName && s.user.fullName !== s.user.email ? s.user.fullName : '');
  const [role, setRole] = useState('');
  const [project, setProject] = useState(''), [color, setColor] = useState(COLORS[0]);
  const [mode, setM] = useState<Mode>(getMode);
  const [look, setLook] = useState(s.user.avatar || (s.user.photo ? 'photo' : 'initials'));
  const [digest, setDigest] = useState(true), [hour, setHour] = useState(8);
  const [busy, setBusy] = useState(false);
  const code = codeOf(project);

  async function finish(thenCalendar: boolean) {
    setBusy(true);
    try {
      const { error } = await sb().auth.updateUser({ data: { full_name: name.trim() || s.user.fullName, role, onboarded: true } });
      if (error) throw error;
      if (project.trim() && code && !s.projects.some(p => p.Project === code))
        await sb().from('projects').insert({ Project: code, Name: project.trim(), Color: color, SortOrder: 0 });
      await saveAvatar(look).catch(() => { /* optional */ });
      await sb().from('user_settings').upsert({ DigestEnabled: digest, DigestHour: hour, TimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' }, { onConflict: 'user_id' });
      await qc.invalidateQueries();
      s.toast(`Welcome to SLATE·SPACE${name.trim() ? ', ' + name.trim().split(' ')[0] : ''}!`);
      if (thenCalendar) await connectGoogleCalendar(); else close();
    } catch (e) { s.toast((e as Error).message, true); setBusy(false) }
  }
  const skip = async () => { await sb().auth.updateUser({ data: { onboarded: true } }); close() };

  const looks = [...(s.user.photo ? ['photo'] : []), 'initials', ...AVATAR_LOOKS.slice(0, 9).map(a => a.id)];
  const steps = [
    { label: 'You', description: 'Name and role', content: <div className="ob-body">
      <h3>Welcome! What should we call you?</h3>
      <FloatInput label="Your name" value={name} onChange={setName} className="fi" inputClassName="fi-in" labelClassName="fi-lb" inputProps={{ autoComplete: 'name', autoFocus: true }} />
      <p className="ob-q">What do you mostly do?</p>
      <div className="ob-chips">{ROLES.map(r => <button key={r} type="button" className={'ob-chip' + (role === r ? ' on' : '')} aria-pressed={role === r} onClick={() => setRole(r)}>{r}</button>)}</div>
    </div> },
    { label: 'Project', description: 'Your first project', content: <div className="ob-body">
      <h3>What are you working on?</h3>
      <p className="muted">Tickets are grouped by project. You can add more later – or skip and use “General”.</p>
      <FloatInput label="Project name, e.g. GST e-invoicing" value={project} onChange={setProject} className="fi" inputClassName="fi-in" labelClassName="fi-lb" />
      {project.trim() && <p className="muted ob-code">Short code <b>{code || '–'}</b> – shown on ticket chips</p>}
      <div className="ob-colors" role="radiogroup" aria-label="Project colour">{COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={'Colour ' + c}
        className={'ob-color' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
    </div> },
    { label: 'Look', description: 'Theme and avatar', content: <div className="ob-body">
      <h3>Make it yours</h3>
      <div className="ob-row"><span>Appearance</span><ThemeToggle variant="pill" size="sm" showSystem theme={mode} onThemeChange={m => { setM(m); setMode(m) }} /></div>
      <p className="ob-q">Avatar</p>
      <div className="ob-avs">{looks.map(l => <button key={l} type="button" className={'um-av' + (look === l ? ' on' : '')} aria-pressed={look === l} onClick={() => setLook(l)}
        aria-label={l === 'photo' ? 'Google photo' : l === 'initials' ? 'Initials' : 'Colour avatar'}>
        <Avatar name={name || s.user.fullName || 'You'} size={36} photo={l === 'photo' ? s.user.photo : undefined} look={l === 'photo' ? 'photo' : l === 'initials' ? 'none' : l} /></button>)}</div>
    </div> },
    { label: 'Email', description: 'Daily summary', content: <div className="ob-body">
      <h3>A short email each morning?</h3>
      <p className="muted">What is overdue, due today and tomorrow, and the hours you logged yesterday – in one table.</p>
      <label className="acct-switch"><input type="checkbox" role="switch" checked={digest} onChange={e => setDigest(e.target.checked)} /><span aria-hidden="true" />Send me the daily email</label>
      {digest && <div className="ob-chips">{[7, 8, 9, 10].map(h => <button key={h} type="button" className={'ob-chip' + (hour === h ? ' on' : '')} aria-pressed={hour === h} onClick={() => setHour(h)}>{hourLabel(h)}</button>)}</div>}
    </div> },
    { label: 'Calendar', description: 'Meetings', content: <div className="ob-body">
      <h3>See your meetings next to your tickets</h3>
      <p className="muted">Connect Google Calendar to see meetings in Calendar and create new ones (with a Meet link) from SLATE·SPACE. You can do this later in Account.</p>
      <div className="ob-cal"><Icon name="cal" size={28} /><span>Google asks once for permission. If it says “hasn't verified this app”, choose <b>Advanced → Go to SLATE·SPACE</b>.</span></div>
    </div> },
  ];
  const last = step === steps.length - 1;
  return (
    <Modal close={skip} width={640} label="Set up SLATE·SPACE">
      <div className="top"><span className="chip">SLATE·SPACE</span><span>›</span><span>Getting started</span><span className="sp" />
        <button className="btn ob-skip" onClick={skip} disabled={busy}>Skip</button></div>
      <div className="ob"><AnimatedStepper steps={steps} currentStep={step} onStepChange={setStep} allowClickNavigation /></div>
      <div className="ft">
        {step > 0 && <button className="btn" onClick={() => setStep(x => x - 1)} disabled={busy}><Icon name="move" size={14} className="flip" />Back</button>}
        <span className="sp" />
        {last ? <>
          <button className="btn" onClick={() => finish(false)} disabled={busy}>{busy && <Spinner />}Finish</button>
          <button className="btn primary" onClick={() => finish(true)} disabled={busy}><Icon name="cal" size={14} />Finish & connect Google Calendar</button></>
          : <button className="btn primary" onClick={() => setStep(x => x + 1)} disabled={step === 0 && !name.trim()}>Next<Icon name="move" size={14} /></button>}
      </div>
    </Modal>
  );
}
