// Line icons (Lucide, mapped to the short names used across the app), status and priority icons.
import { useEffect, useId, useRef } from 'react';
import {
  ArrowRight, Bell, Eye, EyeOff, BookOpen, Box, Bug, Calendar, ChartColumnBig, ChartGantt, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDashed, Clock, Columns3, Download, FileText, Folder,
  House, Inbox, Link2, List, LoaderCircle, LogOut, MessageSquare, Monitor, Moon, Network, PanelLeftClose, PanelLeftOpen, Play, Plus, RefreshCw, Search, SignalHigh, Square, SquarePen, Sun,
  Smartphone, Tag, Timer, Trash2, TriangleAlert, Truck, Upload, User, Users, X, type LucideIcon,
} from 'lucide-react';
import type { Status } from '../api';

const ICONS: Record<string, LucideIcon> = {
  home: House, inbox: Inbox, bell: Bell, my: CircleDashed, truck: Truck, cube: Box, book: BookOpen, clock: Clock, timer: Timer, chart: ChartColumnBig, gantt: ChartGantt,
  priority: SignalHigh, move: ArrowRight, plus: Plus, chat: MessageSquare, alert: TriangleAlert, list: List, board: Columns3, play: Play, stop: Square,
  up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight, cal: Calendar, user: User, tag: Tag, check: Check, search: Search, x: X, folder: Folder, env: Monitor, moon: Moon,
  sun: Sun, edit: SquarePen, trash: Trash2, refresh: RefreshCw, link: Link2, bug: Bug, graph: Network, file: FileText, download: Download,
  upload: Upload, users: Users, loader: LoaderCircle, eye: Eye, 'eye-off': EyeOff, logout: LogOut, 'panel-close': PanelLeftClose, 'panel-open': PanelLeftOpen, phone: Smartphone,
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
/** SLATE·SPACE mark: a hexagon split into an S – silver top, blue middle, light bottom band. Gradient ids are unique per
 *  instance: a shared id breaks every other copy while the first one is hidden (e.g. the sidebar on phones). */
export function LogoMark({ size = 18 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id={id + 't'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--lg-top-a)' }} /><stop offset="1" style={{ stopColor: 'var(--lg-top-b)' }} /></linearGradient>
        <linearGradient id={id + 'm'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--lg-bot-a)' }} /><stop offset="1" style={{ stopColor: 'var(--lg-bot-b)' }} /></linearGradient>
        <linearGradient id={id + 'b'} x1="1" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--lg-top-b)' }} /><stop offset="1" style={{ stopColor: 'var(--lg-top-a)' }} /></linearGradient>
      </defs>
      <path fill={`url(#${id}t)`} d="M12 1.6 L21.6 7.1 L21.6 10.5 L12 5 L5.6 8.7 L5.6 12.2 L2.4 12.2 L2.4 7.1 Z" />
      <path fill={`url(#${id}m)`} d="M2.4 13.2 L12 7.7 L21.6 13.2 L21.6 16.6 L12 11.1 L5.6 14.8 L2.4 16.6 Z" />
      <path fill={`url(#${id}b)`} d="M21.6 12.4 L21.6 16.9 L12 22.4 L2.4 16.9 L2.4 16.6 L5.6 14.8 L5.6 15 L12 18.7 L18.4 15 L18.4 14.2 Z" />
    </svg>
  );
}
