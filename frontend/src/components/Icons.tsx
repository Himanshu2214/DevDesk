// Status, priority and line icons (same drawings as the mockup).
import type { Status } from '../api';

const PATHS: Record<string, string> = {
  home: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  my: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2.4"/><circle cx="12" cy="12" r="3"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  book: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M5 16a4 4 0 0 1 4-4h10"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  move: '<path d="M5 12h14m-5-5 5 5-5 5"/>', plus: '<path d="M12 5v14M5 12h14"/>', chat: '<path d="M4 5h16v11H8l-4 3z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  play: '<path d="M8 5v14l11-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.3"/>', check: '<path d="m5 12 4.5 4.5L19 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  env: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  edit: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
};

export function Icon({ name, size = 16, style }: { name: keyof typeof PATHS | string; size?: number; style?: React.CSSProperties }) {
  return <svg className="i" viewBox="0 0 24 24" style={{ width: size, height: size, ...style }} dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }} />;
}

const STATUS_COLOR: Record<Status, string> = { BACKLOG: 'var(--st-backlog)', TODO: 'var(--st-todo)', PROG: 'var(--st-prog)', TEST: 'var(--st-test)', BLOCK: 'var(--st-block)', DONE: 'var(--st-done)' };
function pie(f: number) {
  if (f >= 1) return <circle cx="7" cy="7" r="3.6" fill="currentColor" />;
  const a = f * 2 * Math.PI, x = 7 + 3.6 * Math.sin(a), y = 7 - 3.6 * Math.cos(a);
  return <path d={`M7 7 L7 3.4 A3.6 3.6 0 ${f > .5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" />;
}
export function StatusIcon({ status }: { status: Status }) {
  const ring = <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />;
  let body: React.ReactNode;
  switch (status) {
    case 'BACKLOG': body = <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" />; break;
    case 'TODO': body = ring; break;
    case 'PROG': body = <>{ring}{pie(.5)}</>; break;
    case 'TEST': body = <>{ring}{pie(.75)}</>; break;
    case 'BLOCK': body = <><circle cx="7" cy="7" r="7" fill="currentColor" /><path d="M3.8 7h6.4" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" /></>; break;
    default: body = <><circle cx="7" cy="7" r="7" fill="currentColor" /><path d="M4.2 7.2l1.9 1.9 3.8-4" fill="none" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>;
  }
  return <svg className="si" viewBox="0 0 14 14" style={{ color: STATUS_COLOR[status] }}>{body}</svg>;
}
export function PriorityIcon({ priority }: { priority: string }) {
  if (priority === '1') return (
    <svg className="pi" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3.5" fill="var(--urgent)" />
      <path d="M8 4.2v4.6M8 11.3v.2" stroke="var(--panel)" strokeWidth="1.8" strokeLinecap="round" /></svg>);
  const lv = ({ '2': 3, '3': 2, '4': 1 } as Record<string, number>)[priority] ?? 0;
  return <svg className="pi" viewBox="0 0 16 16">{[0, 1, 2].map(i =>
    <rect key={i} x={2 + i * 4.5} y={10 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < lv ? 'var(--text-2)' : 'var(--faint)'} />)}</svg>;
}
export const Dot = ({ color }: { color: string }) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', margin: '0 3px', flex: 'none' }} />;
