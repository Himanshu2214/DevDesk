// Line icons (Lucide, mapped to the short names used across the app), status and priority icons.
import { useEffect, useRef } from 'react';
import {
  ArrowRight, Bell, BookOpen, Box, Bug, Calendar, ChartColumnBig, Check, ChevronDown, ChevronRight, ChevronUp, CircleDashed, Clock, Columns3, Download, FileText, Folder,
  House, Inbox, Link2, List, LoaderCircle, MessageSquare, Monitor, Moon, Network, PanelLeftClose, PanelLeftOpen, Play, Plus, RefreshCw, Search, SignalHigh, Square, SquarePen, Sun,
  Tag, Timer, Trash2, TriangleAlert, Truck, Upload, User, X, type LucideIcon,
} from 'lucide-react';
import type { Status } from '../api';

const ICONS: Record<string, LucideIcon> = {
  home: House, inbox: Inbox, bell: Bell, my: CircleDashed, truck: Truck, cube: Box, book: BookOpen, clock: Clock, timer: Timer, chart: ChartColumnBig,
  priority: SignalHigh, move: ArrowRight, plus: Plus, chat: MessageSquare, alert: TriangleAlert, list: List, board: Columns3, play: Play, stop: Square,
  up: ChevronUp, down: ChevronDown, right: ChevronRight, cal: Calendar, user: User, tag: Tag, check: Check, search: Search, x: X, folder: Folder, env: Monitor, moon: Moon,
  sun: Sun, edit: SquarePen, trash: Trash2, refresh: RefreshCw, link: Link2, bug: Bug, graph: Network, file: FileText, download: Download,
  upload: Upload, loader: LoaderCircle, 'panel-close': PanelLeftClose, 'panel-open': PanelLeftOpen,
};

/** Stroke width comes from CSS (svg.i), so every icon reads equally heavy at any size; data-icon lets CSS animate specific icons */
export function Icon({ name, size = 16, style, className }: { name: string; size?: number; style?: React.CSSProperties; className?: string }) {
  const C = ICONS[name];
  return C ? <C className={'i' + (className ? ' ' + className : '')} data-icon={name} size={size} style={style} aria-hidden /> : null;
}
export const Spinner = ({ size = 14 }: { size?: number }) => <Icon name="loader" size={size} className="spin" />;

const STATUS_COLOR: Record<Status, string> = { BACKLOG: 'var(--st-backlog)', TODO: 'var(--st-todo)', PROG: 'var(--st-prog)', TEST: 'var(--st-test)', BLOCK: 'var(--st-block)', DONE: 'var(--st-done)' };
function pie(f: number) {
  if (f >= 1) return <circle cx="7" cy="7" r="3.6" fill="currentColor" />;
  const a = f * 2 * Math.PI, x = 7 + 3.6 * Math.sin(a), y = 7 - 3.6 * Math.cos(a);
  return <path d={`M7 7 L7 3.4 A3.6 3.6 0 ${f > .5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" />;
}
export function StatusIcon({ status }: { status: Status }) {
  // a short settle animation only when the status of an already-rendered icon changes, never on first render
  const prev = useRef(status), ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (prev.current === status) return;
    prev.current = status;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ref.current?.animate?.([{ transform: 'scale(.6)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,0,0,1)' });
  }, [status]);
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
  return <svg ref={ref} className="si" viewBox="0 0 14 14" style={{ color: STATUS_COLOR[status] }}>{body}</svg>;
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

/** SLATE·SPACE mark: two offset, rounded slate layers; colours come from the theme (--lg-*), so it works on dark and light */
export const LogoMark = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="logo-mark">
    <defs>
      <linearGradient id="ss-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--lg-top-a)' }} /><stop offset="1" style={{ stopColor: 'var(--lg-top-b)' }} /></linearGradient>
      <linearGradient id="ss-bot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--lg-bot-a)' }} /><stop offset="1" style={{ stopColor: 'var(--lg-bot-b)' }} /></linearGradient>
    </defs>
    <rect x="4" y="4.9" width="16" height="6.4" rx="2.2" transform="rotate(-24 12 8.1)" fill="url(#ss-top)" />
    <rect x="5.6" y="12.3" width="16" height="6.4" rx="2.2" transform="rotate(-24 13.6 15.5)" fill="url(#ss-bot)" />
  </svg>
);
