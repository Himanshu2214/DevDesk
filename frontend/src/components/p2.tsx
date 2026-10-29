// Shared pieces of the phase 2 screens: object type badge, side panel, auto-saving fields, pickers, impact map, files.
import { useEffect, useRef, useState } from 'react';
import type { Status, TechObject, Ticket, Transport } from '../api';
import { useStore } from '../store';
import { fmtDate } from '../lib/format';
import { Icon, StatusIcon } from './Icons';
import { useMenu } from './ui';

export function ObjType({ type, small }: { type: string; small?: boolean }) {
  const s = useStore();
  return <span className="otype" title={s.text('OBJTYPE', type)}
    style={{ color: s.color('OBJTYPE', type), ...(small ? { height: 16, fontSize: 9.5, padding: '0 4px' } : {}) }}>{type}</span>;
}

/** Slide-in panel on the right (transport details, create forms); Esc closes it */
export function SidePanel({ head, close, children }: { head: React.ReactNode; close(): void; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id) }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.menu.on, .modal.on')) close() };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [close]);
  return (
    <aside className={'side-panel' + (on ? ' on' : '')} style={{ display: 'flex', flexDirection: 'column' }} role="dialog">
      <div className="sh">{head}<span className="sp" /><button className="ib" onClick={close} title="Close (Esc)" aria-label="Close"><Icon name="x" /></button></div>
      <div className="sb">{children}</div>
    </aside>
  );
}

/** Multi-line text that saves on blur; does not overwrite what you type when the data refreshes */
export function Area({ value, onSave, placeholder, mono, rows = 3 }: { value: string; onSave(v: string): unknown; placeholder?: string; mono?: boolean; rows?: number }) {
  const [v, setV] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value ?? '') }, [value]);
  return <textarea className={'box' + (mono ? ' mono' : '')} rows={rows} value={v} placeholder={placeholder} spellCheck={!mono}
    style={{ width: '100%', resize: 'vertical', display: 'block', font: mono ? undefined : 'inherit', ...(mono ? { fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)' } : {}) }}
    onFocus={() => { focused.current = true }} onChange={e => setV(e.target.value)}
    onBlur={() => { focused.current = false; if (v !== (value ?? '')) onSave(v) }} />;
}

/** One-line text that saves on blur or Enter; `clear` empties it afterwards (inputs that add an entry) */
export function Line({ value, onSave, placeholder, mono, upper, clear, style }: { value: string; onSave(v: string): unknown; placeholder?: string; mono?: boolean; upper?: boolean; clear?: boolean; style?: React.CSSProperties }) {
  const [v, setV] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value ?? '') }, [value]);
  return <input className={'line-in' + (mono ? ' mono' : '')} value={v} placeholder={placeholder} style={style}
    onFocus={() => { focused.current = true }} onChange={e => setV(upper ? e.target.value.toUpperCase() : e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    onBlur={() => { focused.current = false; const x = v.trim(); if (x !== (value ?? '')) onSave(x); if (clear) setV('') }} />;
}

/** Searchable menus to pick an object or a ticket */
export function usePickers() {
  const s = useStore();
  const menu = useMenu();
  return {
    object: (anchor: Element, objects: TechObject[], pick: (o: TechObject) => void) =>
      menu(anchor, objects.map(o => ({ label: `${o.ObjectName} · ${o.ObjectType}`, value: o.ObjectUUID, icon: <ObjType type={o.ObjectType} small /> })),
        v => { const o = objects.find(x => x.ObjectUUID === v); if (o) pick(o) }),
    ticket: (anchor: Element, tickets: Ticket[], pick: (t: Ticket) => void) =>
      menu(anchor, tickets.map(t => ({ label: `${t.TicketId} ${t.Title}`, value: t.TicketUUID, icon: <StatusIcon status={t.Status as Status} /> })),
        v => { const t = s.tickets.find(x => x.TicketUUID === v); if (t) pick(t) }),
  };
}

/* ---------- transports ---------- */
export const PHASE_LABEL: Record<string, string> = { DEV: 'Development', QA: 'Quality (QA)', PRD: 'Production', FAILED: 'Failed' };
/** Card edge: green in PRD, red when an import failed, orange for warnings, blue when released */
export function trEdge(x: Transport) {
  if (x.PrdImportedAt) return x.PrdRc > 4 ? 'var(--danger)' : 'var(--ok)';
  if (x.QaImportedAt) return x.QaRc > 4 ? 'var(--danger)' : x.QaRc > 0 ? 'var(--urgent)' : 'var(--st-test)';
  return x.ReleasedOn ? 'var(--st-todo)' : 'var(--border-2)';
}
export function trState(x: Transport): React.ReactNode {
  const rc = x.PrdImportedAt ? x.PrdRc : x.QaImportedAt ? x.QaRc : null;
  if (rc !== null && rc > 4) return <span className="fail">RC {rc}</span>;
  if (rc !== null) return <span className="muted num" style={{ fontSize: 12 }}>{x.PrdImportedAt ? 'PRD' : 'QA'} · RC {rc}</span>;
  return <span className="muted" style={{ fontSize: 12 }}>{x.ReleasedOn ? `released ${fmtDate(x.ReleasedOn)}` : 'modifiable'}</span>;
}

/* ---------- impact map ---------- */
interface Edge { from: string; to: string }
/** All objects the given one depends on (up) and all objects that break when it changes (down) */
export function related(id: string, edges: Edge[]) {
  const up = new Set<string>(), down = new Set<string>();
  const walk = (n: string, set: Set<string>, dir: boolean) => edges.forEach(d => {
    const a = dir ? d.from : d.to, b = dir ? d.to : d.from;
    if (a === n && !set.has(b) && b !== id) { set.add(b); walk(b, set, dir) }
  });
  walk(id, down, true); walk(id, up, false);
  return { up, down };
}
/** edges "from uses to" (arrow from the used object to the dependent one, like the mockup) */
export const depEdges = (objects: TechObject[]): Edge[] =>
  objects.flatMap(o => o._Dependency.map(d => ({ from: d.UsesObjectUUID, to: o.ObjectUUID })));

export function ImpactMap({ id, objects, onPick }: { id: string; objects: TechObject[]; onPick(uuid: string): void }) {
  const s = useStore();
  const byId = new Map(objects.map(o => [o.ObjectUUID, o]));
  const all = depEdges(objects).filter(e => byId.has(e.from) && byId.has(e.to));
  const { up, down } = related(id, all);
  const nodes = [id, ...up, ...down];
  const inUp = (n: string) => n === id || up.has(n), inDown = (n: string) => n === id || down.has(n);
  const edges = all.filter(e => (inUp(e.from) && inUp(e.to)) || (inDown(e.from) && inDown(e.to)));
  if (nodes.length === 1) return <div className="muted" style={{ padding: '18px 16px' }}>No dependencies yet. Add what this object uses below, and the map shows what a change affects.</div>;
  // layers: longest path from the roots (cycles are cut after n rounds)
  const rank: Record<string, number> = Object.fromEntries(nodes.map(n => [n, 0]));
  for (let i = 0; i < nodes.length; i++) edges.forEach(e => { if (rank[e.from] + 1 > rank[e.to] && rank[e.from] < nodes.length) rank[e.to] = rank[e.from] + 1 });
  const rows: string[][] = [];
  nodes.forEach(n => { (rows[rank[n]] ??= []).push(n) });
  const W = 200, H = 54, GX = 30, GY = 56;
  const width = Math.max(...rows.filter(Boolean).map(r => r.length * (W + GX) - GX), W) + 40;
  const pos: Record<string, { x: number; y: number }> = {};
  rows.forEach((r, ri) => {
    if (!r) return;
    if (ri > 0) r.sort((a, b) => {
      const px = (n: string) => { const ps = edges.filter(e => e.to === n).map(e => pos[e.from]?.x ?? 0); return ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : 0 };
      return px(a) - px(b);
    });
    const x0 = (width - (r.length * (W + GX) - GX)) / 2;
    r.forEach((n, i) => { pos[n] = { x: x0 + i * (W + GX), y: 20 + ri * (H + GY) } });
  });
  const height = 20 + rows.length * (H + GY) - GY + 20;
  const isDown = (e: Edge) => down.has(e.to) && inDown(e.from);
  const path = (e: Edge) => {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) return '';
    const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y - 6;
    return `M${x1} ${y1} C${x1} ${y1 + GY / 2},${x2} ${y2 - GY / 2},${x2} ${y2}`;
  };
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  return (
    <div className="graph">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Impact map">
        <defs>
          <marker id="arG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--ok)" /></marker>
          <marker id="arU" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--muted)" /></marker>
        </defs>
        {edges.map((e, i) => <path key={i} d={path(e)} fill="none" stroke={isDown(e) ? 'var(--ok)' : 'var(--muted)'} strokeWidth={1.6}
          markerEnd={`url(#${isDown(e) ? 'arG' : 'arU'})`} opacity={isDown(e) ? 1 : .7} />)}
        {nodes.map(n => {
          const o = byId.get(n)!, p = pos[n], c = s.color('OBJTYPE', o.ObjectType);
          return <g key={n} className={'gnode' + (n === id ? ' me' : '')} transform={`translate(${p.x},${p.y})`} onClick={() => onPick(n)}>
            <title>{`${o.ObjectType} ${o.ObjectName}${o.Description ? ' – ' + o.Description : ''}`}</title>
            <rect className="b" width={W} height={H} rx={8} /><rect width={3} height={H - 12} y={6} x={0} rx={1.5} fill={c} />
            <text x={14} y={20} fontSize={10.5} fontWeight={700} fill={c} fontFamily="Cascadia Mono,Consolas,monospace">{o.ObjectType}</text>
            <text x={14} y={38} fontSize={12} fill="var(--text)" fontFamily="Cascadia Mono,Consolas,monospace">{cut(o.ObjectName, 24)}</text></g>;
        })}
      </svg>
    </div>
  );
}

/* ---------- files ---------- */
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
/** File content as plain base64 (without the data: prefix) */
export const readBase64 = (f: File) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => fail(r.error);
  r.readAsDataURL(f);
});
export function saveBlob(b: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
