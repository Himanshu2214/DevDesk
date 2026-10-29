// Shared UI pieces: hash router, popover menu, page frame, small labels.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Status, Ticket } from '../api';
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

/* ---------- Popover menu ---------- */
export interface MenuItem { label: string; value: string; icon?: React.ReactNode; checked?: boolean }
interface MenuState { rect: DOMRect; items: MenuItem[]; pick: (v: string) => void; search: boolean }
const MenuCtx = createContext<(anchor: Element, items: MenuItem[], pick: (v: string) => void, search?: boolean) => void>(() => {});
export const useMenu = () => useContext(MenuCtx);

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState<MenuState | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const open = useCallback((anchor: Element, items: MenuItem[], pick: (v: string) => void, search = true) => {
    setM({ rect: anchor.getBoundingClientRect(), items, pick, search }); setQ(''); setSel(Math.max(0, items.findIndex(i => i.checked)));
  }, []);
  const vis = m ? m.items.filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase())) : [];
  useLayoutEffect(() => {
    if (!m || !ref.current) return;
    const h = ref.current.offsetHeight, w = ref.current.offsetWidth, r = m.rect;
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - w - 8)), top: r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4 });
  }, [m]);
  useEffect(() => {
    if (!m) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setM(null) };
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [m]);
  const choose = (v: string) => { const p = m!.pick; setM(null); p(v) };
  return (
    <MenuCtx.Provider value={open}>
      {children}
      {m && <div className="menu on" ref={ref} style={pos}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { setSel(s => (s + 1) % vis.length); e.preventDefault() }
          if (e.key === 'ArrowUp') { setSel(s => (s - 1 + vis.length) % vis.length); e.preventDefault() }
          if (e.key === 'Enter' && vis[sel]) { choose(vis[sel].value); e.preventDefault() }
          if (e.key === 'Escape') { setM(null); e.stopPropagation() }
        }}>
        {m.search ? <input autoFocus placeholder="Change to…" value={q} onChange={e => { setQ(e.target.value); setSel(0) }} /> : <input autoFocus style={{ position: 'absolute', opacity: 0, height: 0, padding: 0, border: 0 }} readOnly />}
        {vis.map((it, i) => <div key={it.value} className={'mi' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => choose(it.value)}>
          {it.icon}<span>{it.label}</span>{it.checked && <span className="ck"><Icon name="check" /></span>}</div>)}
        {!vis.length && <div className="mi muted">No match</div>}
      </div>}
    </MenuCtx.Provider>
  );
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
  const { lastSync } = useStore();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(id) }, []);
  const age = (Date.now() - lastSync) / 1000;
  return (
    <section className="main">
      <header className="bar1">
        <button className="ib nav-btn" aria-label="Open navigation" onClick={() => dispatchEvent(new Event('devdesk-nav'))}><Icon name="list" /></button>
        <div className="crumb">{crumb}</div><span className="sp" />
        <span className="live" title="Changes are fetched every 30 seconds"><i />{age < 45 ? 'Up to date' : `Updated ${Math.round(age / 60)}m ago`}</span>
        {right}
        <button className="ib" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => dispatchEvent(new Event('devdesk-help'))}><span style={{ fontWeight: 600 }}>?</span></button>
      </header>
      {bar2 && <div className="bar2">{bar2}</div>}
      <div className="body" ref={bodyRef}>{children}</div>
    </section>
  );
}

/* ---------- Labels ---------- */
export function Due({ t, short }: { t: Pick<Ticket, 'DueDate' | 'Status'>; short?: boolean }) {
  if (t.Status === 'DONE' || !t.DueDate) return <span className="due muted">{fmtDate(t.DueDate)}</span>;
  const d = daysUntil(t.DueDate)!;
  if (d < 0) return <span className="due over" title="Overdue"><Icon name="alert" size={13} />{-d}d late</span>;
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

/** True while the user types in a field or a dialog/menu is open (keyboard shortcuts are ignored then) */
export const isTyping = (e: KeyboardEvent) => {
  const el = e.target instanceof Element ? e.target : null;
  return !!el?.closest('input,textarea,select,[contenteditable],.modal,.menu') || !!document.querySelector('.modal.on');
};
