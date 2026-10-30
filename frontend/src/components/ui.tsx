// Shared UI pieces: hash router, popover menu, page frame, small labels.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { animate, AnimatePresence, m, useMotionValue, useTransform } from 'motion/react';
import type { Status, Ticket } from '../api';
import DropdownMenu from './smoothui/dropdown-menu';
import Tooltip from './smoothui/tooltip';
import { useStore } from '../store';
import { daysUntil, fmtDate, PRIORITY_NAME, STATUS_ORDER } from '../lib/format';
import { Dot, Icon, PriorityIcon, StatusIcon } from './Icons';

/* ---------- Router (hash based, works inside the BSP without server config) ---------- */
export function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || 'home');
  useEffect(() => {
    const on = () => setH(location.hash.slice(1) || 'home');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return h;
}
export const go = (h: string) => { location.hash = h };

/* ---------- Dropdown menu (SmoothUI DropdownMenu on Base UI Menu) ----------
   Opened from code with an anchor element, so every dropdown in the app goes through this one provider.
   Keyboard: arrows / Home / End, type-ahead, Enter, Esc (Base UI); long lists get a filter box. */
export interface MenuItem { label: string; value: string; icon?: React.ReactNode; checked?: boolean }
interface MenuState { id: number; anchor: Element; items: MenuItem[]; pick: (v: string) => void; search: boolean }
const MenuCtx = createContext<(anchor: Element, items: MenuItem[], pick: (v: string) => void, search?: boolean) => void>(() => {});
export const useMenu = () => useContext(MenuCtx);
/** True while a dropdown is open (dialogs and global shortcuts leave Esc and keys to it) */
export const menuOpen = () => !!document.querySelector('.dd-menu[data-open]');
const FILTER_FROM = 8;

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState<MenuState | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((anchor: Element, items: MenuItem[], pick: (v: string) => void, search = true) => {
    setM(prev => ({ id: (prev?.id ?? 0) + 1, anchor, items, pick, search })); setOpen(true);
  }, []);
  // the anchor reports its state to assistive tech, and CSS turns its chevron while the menu is open
  useEffect(() => {
    if (!m || !open) return;
    m.anchor.setAttribute('aria-expanded', 'true');
    return () => m.anchor.setAttribute('aria-expanded', 'false');
  }, [m, open]);
  return (
    <MenuCtx.Provider value={show}>
      {children}
      {m && <DropdownMenu key={m.id} anchor={m.anchor} open={open} onOpenChange={setOpen} className="dd-menu" sideOffset={4}
        filter={m.search && m.items.length >= FILTER_FROM} filterPlaceholder="Filter…"
        items={m.items.map(it => ({ key: it.value, label: it.label, icon: it.icon, checked: it.checked, onSelect: () => m.pick(it.value) }))} />}
    </MenuCtx.Provider>
  );
}

/** Select field rendered as a SmoothUI dropdown: a button showing the current option (long lists get a filter box) */
export function MenuSelect({ value, options, onChange, label, id, className = 'sel-btn' }: {
  value: string; options: { value: string; label: string; icon?: React.ReactNode }[]; onChange(v: string): void; label: string; id?: string; className?: string;
}) {
  const menu = useMenu();
  const cur = options.find(o => o.value === value);
  return <button type="button" id={id} className={className} aria-haspopup="menu" aria-label={`${label}: ${cur?.label ?? 'none'}`}
    onClick={e => menu(e.currentTarget, options.map(o => ({ ...o, checked: o.value === value })), onChange)}>
    {cur?.icon}<span className="sel-v">{cur?.label ?? 'Select…'}</span><Icon name="down" size={14} /></button>;
}

/** Menu items for the ticket properties; values are the backend codes */
export function useFieldMenus() {
  const s = useStore();
  const list = (type: string) => s.values.filter(v => v.ListType === type);
  return {
    status: (t: { Status: Status }): MenuItem[] => STATUS_ORDER.map(k => ({ label: s.text('STATUS', k), value: k, icon: <StatusIcon status={k} />, checked: t.Status === k })),
    Priority: (t: { Priority: string }): MenuItem[] => ['1', '2', '3', '4'].map(p => ({ label: PRIORITY_NAME[p], value: p, icon: <PriorityIcon priority={p} />, checked: t.Priority === p })),
    Project: (t: { Project: string }): MenuItem[] => s.projects.map(p => ({ label: p.Name, value: p.Project, icon: <Dot color={p.Color} />, checked: t.Project === p.Project })),
    Area: (t: { Area: string }): MenuItem[] => list('AREA').map(v => ({ label: `${v.Code} · ${v.Text}`, value: v.Code, icon: <Icon name="folder" size={14} />, checked: t.Area === v.Code })),
    Tech: (t: { Tech: string }): MenuItem[] => list('TECH').map(v => ({ label: v.Text, value: v.Code, icon: <Dot color={v.Color || 'var(--muted)'} />, checked: t.Tech === v.Code })),
    TicketType: (t: { TicketType: string }): MenuItem[] => list('TYPE').map(v => ({ label: v.Text, value: v.Code, icon: <Icon name="tag" size={14} />, checked: t.TicketType === v.Code })),
    Environment: (t: { Environment: string }): MenuItem[] => ['DEV', 'QA', 'PRD'].map(x => ({ label: x, value: x, icon: <Icon name="env" size={14} />, checked: t.Environment === x })),
  };
}

/* ---------- Page frame: header bars + scrolling body ---------- */
export function Page({ crumb, bar2, right, children, bodyRef }: { crumb: React.ReactNode; bar2?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; bodyRef?: React.Ref<HTMLDivElement> }) {
  return (
    <section className="main">
      <header className="bar1">
        <button className="ib nav-btn" aria-label="Open navigation" onClick={() => dispatchEvent(new Event('devdesk-nav'))}><Icon name="list" /></button>
        <div className="crumb">{crumb}</div><span className="sp" />
        <SyncBadge />
        {right}
        <button className="ib" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => dispatchEvent(new Event('devdesk-help'))}><span style={{ fontWeight: 600 }}>?</span></button>
      </header>
      {bar2 && <div className="bar2">{bar2}</div>}
      <m.div className="body" ref={bodyRef} layoutScroll>{children}</m.div>
    </section>
  );
}

/* ---------- States ---------- */
/** Empty / error state: icon tile, title, one line of help and an optional action */
export function Empty({ icon = 'inbox', title, children, action, error }: { icon?: string; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; error?: boolean }) {
  return <div className="empty-st" role={error ? 'alert' : undefined}>
    <span className={'ico' + (error ? ' err' : '')}><Icon name={icon} size={18} /></span><b>{title}</b>{children && <p>{children}</p>}{action}</div>;
}

/** Number that counts to its new value when it changes; the first render shows the value as-is (instant for reduced motion) */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, end = value;
    if (start === end || matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(end); from.current = end; return }
    const t0 = performance.now(), dur = 520;
    let id = requestAnimationFrame(function step(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setShown(start + (end - start) * e);
      if (p < 1) id = requestAnimationFrame(step); else from.current = end;
    });
    return () => { cancelAnimationFrame(id); from.current = end };
  }, [value]);
  return <>{shown.toFixed(decimals)}</>;
}

/** SmoothUI (Base UI) tooltip; renders the child unchanged when disabled */
export function Tip({ label, side = 'top', disabled, children }: { label: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; disabled?: boolean; children: React.ReactElement }) {
  return disabled ? children : <Tooltip content={label} side={side} sideOffset={8} delay={350} className="tip">{children}</Tooltip>;
}

/** Briefly highlights an element when a value changes after the first render (status, transport phase, …) */
export function useChangeFlash<T extends Element>(value: unknown) {
  const ref = useRef<T | null>(null), prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ref.current?.animate?.([{ boxShadow: '0 0 0 2px var(--accent-soft), var(--shadow-sm)' }, { boxShadow: '0 0 0 0 transparent, var(--shadow-sm)' }], { duration: 900, easing: 'cubic-bezier(.2,0,0,1)' });
  }, [value]);
  return ref;
}

/* ---------- Labels ---------- */
export function Due({ t, short }: { t: Pick<Ticket, 'DueDate' | 'Status'>; short?: boolean }) {
  if (t.Status === 'DONE' || !t.DueDate) return <span className="due muted">{fmtDate(t.DueDate)}</span>;
  const d = daysUntil(t.DueDate)!;
  // overdue severity: a few days late is a warning, two weeks or more is serious
  if (d < 0) return <span className={'due over sev-' + (d >= -3 ? 1 : d >= -14 ? 2 : 3)} title={`Due ${fmtDate(t.DueDate)} · ${-d} day${d === -1 ? '' : 's'} overdue`}><Icon name="alert" size={13} />{-d}d late</span>;
  if (d === 0) return <span className="due soon">Today</span>;
  if (d <= 3) return <span className="due soon">{short ? '' : 'in '}{d}d</span>;
  return <span className="due">{fmtDate(t.DueDate)}</span>;
}
export function TechTag({ code }: { code: string }) {
  const s = useStore(); const c = s.color('TECH', code);
  return <span className="tag" style={{ background: c + '26', color: c }}>{s.text('TECH', code)}</span>;
}
export function ProjectChip({ code }: { code: string }) {
  const p = useStore().project(code);
  return p ? <span className="chip"><i style={{ background: p.Color }} />{p.Name}</span> : null;
}
export const Avatar = ({ name, size = 20 }: { name: string; size?: number }) => {
  const initials = name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <span className="av" style={{ width: size, height: size, fontSize: size * .45 }}>{initials}</span>;
};

/** Icon button whose label slides open on hover/focus; `open` keeps it expanded (active view, applied filter) */
export function XBtn({ icon, label, open, on, indicator, className = '', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: React.ReactNode; open?: boolean; on?: boolean; indicator?: string }) {
  return <button {...rest} className={`xb ${className}${open ? ' open' : ''}${on ? ' on' : ''}`}>
    {on && indicator && <TabIndicator id={indicator} />}<Icon name={icon} size={14} /><span className="xl"><span>{label}</span></span></button>;
}

/** True while the user types in a field or a dialog/menu is open (keyboard shortcuts are ignored then) */
export const isTyping = (e: KeyboardEvent) => {
  const el = e.target instanceof Element ? e.target : null;
  return !!el?.closest('input,textarea,select,[contenteditable],.modal,[role=menu]') || !!document.querySelector('.modal.on') || menuOpen();
};

/* ---------- Motion patterns (motion.dev examples, rebuilt with Motion for React) ---------- */

/** Hold to confirm: destructive actions run only after the button is held (pointer, Enter or Space) for `duration` ms.
 *  One progress value drives the fill sweep and a slight squeeze; letting go early rewinds it. */
export function HoldButton({ onConfirm, label, className = 'ib', duration = 1100, children }: {
  onConfirm(): void; label: string; className?: string; duration?: number; children: React.ReactNode;
}) {
  const p = useMotionValue(0);
  const scale = useTransform(p, [0, 1], [1, 0.94]);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const start = () => {
    if (run.current) return;
    run.current = animate(p, 1, { duration: (1 - p.get()) * duration / 1000, ease: 'linear' });
    run.current.then(() => { if (p.get() >= 1) { run.current = null; p.set(0); onConfirm() } });
  };
  const cancel = () => {
    if (!run.current) return;
    run.current.stop(); run.current = null;
    animate(p, 0, { type: 'spring', stiffness: 420, damping: 32 });
  };
  return <Tip label={`Hold to ${label.toLowerCase()}`}>
    <m.button type="button" className={className + ' hold-btn'} aria-label={`${label} (press and hold)`} style={{ scale }}
      onPointerDown={e => { if (e.button === 0) start() }} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start() } }}
      onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') cancel() }} onBlur={cancel} onContextMenu={e => e.preventDefault()}>
      <m.span className="hold-fill" aria-hidden="true" style={{ scaleX: p }} />{children}
    </m.button></Tip>;
}

/** Tab select: the selected background/underline is one shared element that slides between options */
export const TabIndicator = ({ id, line }: { id: string; line?: boolean }) =>
  <m.span layoutId={id} className={'tab-ind' + (line ? ' line' : '')} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />;

/** Characters remaining: counts down to a field's limit; turns amber, then red, and springs as the limit nears */
export function CharCount({ value, max }: { value: string; max: number }) {
  const left = max - value.length;
  const ref = useRef<HTMLSpanElement>(null), prev = useRef(left);
  useEffect(() => {
    if (left < prev.current && left <= 10 && ref.current && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      animate(ref.current, { scale: [left <= 3 ? 1.35 : 1.18, 1] }, { type: 'spring', stiffness: 600, damping: 14 });
    prev.current = left;
  }, [left]);
  return <span ref={ref} className={'char-left num' + (left <= 3 ? ' crit' : left <= 10 ? ' warn' : '')} aria-live="polite"
    aria-label={`${left} characters left`}>{left}</span>;
}

/** Multi-state badge for the sync status: idle → processing → success / error, the width and content morph between states */
export function SyncBadge() {
  const { lastSync, reload, live } = useStore();
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [manual, setManual] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(id) }, []);
  const age = (Date.now() - lastSync) / 1000;
  const state = manual !== 'idle' ? manual : fetching ? 'processing' : 'idle';
  const refresh = async () => {
    if (manual === 'processing') return;
    setManual('processing');
    await reload();
    const failed = qc.getQueryCache().getAll().some(q => q.state.status === 'error');
    setManual(failed ? 'error' : 'success');
    setTimeout(() => setManual('idle'), failed ? 4000 : 1600);
  };
  const look = {
    idle: { icon: <i className="dot" />, text: live ? 'Live' : age < 45 ? 'Up to date' : `Updated ${Math.round(age / 60)}m ago` },
    processing: { icon: <Icon name="refresh" size={12} className="spin" />, text: 'Syncing…' },
    success: { icon: <Icon name="check" size={12} />, text: 'Synced' },
    error: { icon: <Icon name="alert" size={12} />, text: 'Sync failed – retry' },
  }[state];
  return <m.button layout className={'live sync-' + state} onClick={refresh} aria-live="polite"
    title="Changes are fetched every 30 seconds – click to refresh now" transition={{ type: 'spring', stiffness: 500, damping: 38 }}>
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span key={state + look.text} className="sync-in" initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}>{look.icon}{look.text}</m.span>
    </AnimatePresence>
  </m.button>;
}
