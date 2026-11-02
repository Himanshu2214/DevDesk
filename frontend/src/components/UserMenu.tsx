// Top-right user menu: who you are, appearance (SmoothUI Theme Toggle), avatar, account, shortcuts and sign out.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useStore } from '../store';
import { getMode, type Mode, setMode } from '../lib/theme';
import ThemeToggle from './smoothui/theme-toggle';
import { AVATAR_LOOKS, saveAvatar } from '../lib/avatar';
import { Icon } from './Icons';
import { Avatar, go, MeAvatar } from './ui';
import { signOut } from './Auth';

export function UserMenu() {
  const s = useStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setM] = useState<Mode>(getMode);
  const root = useRef<HTMLDivElement>(null);
  const name = s.user.fullName || s.user.id || 'You';

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } };
    addEventListener('pointerdown', away); addEventListener('keydown', esc, true);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc, true) };
  }, [open]);
  useEffect(() => { const sync = () => setM(getMode()); addEventListener('devdesk-theme', sync); return () => removeEventListener('devdesk-theme', sync) }, []);
  useEffect(() => { const close = () => setOpen(false); addEventListener('hashchange', close); return () => removeEventListener('hashchange', close) }, []);

  const pickAvatar = async (choice: string) => {
    try { await saveAvatar(choice); await qc.invalidateQueries({ queryKey: ['user'] }); qc.setQueryData(['user'], (u: object | undefined) => (u ? { ...u, avatar: choice } : u)) }
    catch (e) { s.toast((e as Error).message, true) }
  };
  const looks = [...(s.user.photo ? ['photo'] : []), 'initials', ...AVATAR_LOOKS.map(a => a.id)];
  const current = s.user.avatar || (s.user.photo ? 'photo' : 'initials');

  return (
    <div className="um" ref={root}>
      <button className={'um-btn' + (open ? ' on' : '')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)} title={name}>
        <MeAvatar size={26} /><span className="um-name">{name}</span><Icon name="down" size={13} />
      </button>
      <AnimatePresence>{open && (
        <m.div className="um-panel" role="dialog" aria-label="Account and appearance"
          initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .98, transition: { duration: .12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 38 }}>
          <div className="um-head"><MeAvatar size={42} />
            <div className="um-who"><b>{name}</b><small>{s.user.email || (api.kind === 'sap' ? 'SAP user ' + s.user.id : 'Sample data in this browser')}</small></div>
            <span className="um-env">{api.kind === 'supabase' ? 'CLOUD' : api.kind === 'sap' ? 'SAP' : 'MOCK'}</span></div>

          <div className="um-sec um-row"><span className="um-lbl">Appearance</span>
            <ThemeToggle variant="pill" size="sm" showSystem theme={mode} onThemeChange={setMode} /></div>

          <div className="um-sec"><span className="um-lbl">Avatar</span>
            <div className="um-avs" role="radiogroup" aria-label="Avatar">{looks.map(l =>
              <button key={l} role="radio" aria-checked={current === l} aria-label={l === 'photo' ? 'Google photo' : l === 'initials' ? 'Initials' : 'Colour avatar ' + l.slice(1)}
                className={'um-av' + (current === l ? ' on' : '')} onClick={() => pickAvatar(l)}>
                <Avatar name={name} size={30} photo={l === 'photo' ? s.user.photo : undefined} look={l === 'photo' ? 'photo' : l === 'initials' ? 'none' : l} /></button>)}</div></div>

          <div className="um-links">
            <button onClick={() => { setOpen(false); go('account') }}><Icon name="user" size={15} />Account settings</button>
            <button onClick={() => { setOpen(false); go('lists') }}><Icon name="list" size={15} />Lists: types, areas, tech</button>
            <button onClick={() => { setOpen(false); dispatchEvent(new Event('devdesk-help')) }}><Icon name="list" size={15} />Keyboard shortcuts<kbd>?</kbd></button>
            {api.kind === 'supabase' && <button className="um-out" onClick={signOut}><Icon name="logout" size={15} />Sign out</button>}
          </div>
        </m.div>)}</AnimatePresence>
    </div>
  );
}
