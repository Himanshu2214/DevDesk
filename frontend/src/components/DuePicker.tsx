// Date fields: a compact FullCalendar month in a Base UI popover (plus a typed-date field for keyboard users). The due date adds presets
// (Today, Tomorrow, End of week, Next Monday, In 2 weeks) in a dropdown, with "Pick a date…" opening the calendar.
import { lazy, Suspense, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { DAY, fmtDate, isoDate, parseDate, today } from '../lib/format';
import { Icon } from './Icons';
import { useMenu } from './ui';

// FullCalendar loads the first time a picker opens, not with the app
const MiniCal = lazy(() => import('./MiniCal'));

function presets(): { label: string; value: string }[] {
  const t = today(), wd = t.getDay();
  const add = (n: number) => isoDate(new Date(t.getTime() + n * DAY));
  const friday = (5 - wd + 7) % 7 || 7, monday = (8 - wd) % 7 || 7;
  return [
    { label: 'Today', value: add(0) },
    { label: 'Tomorrow', value: add(1) },
    { label: `End of week (Fri ${fmtDate(add(wd === 5 ? 0 : friday))})`, value: add(wd === 5 ? 0 : friday) },
    { label: `Next Monday (${fmtDate(add(monday))})`, value: add(monday) },
    { label: `In 2 weeks (${fmtDate(add(14))})`, value: add(14) },
  ];
}

/** Button showing the date; opens a calendar (or first a preset menu when `withPresets`) */
export function DatePicker({ value, onChange, label, placeholder = 'Pick a date', max, withPresets, className = 'pv' }: {
  value: string | null; onChange(v: string): void; label: string; placeholder?: string; max?: string; withPresets?: boolean; className?: string;
}) {
  const menu = useMenu();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (d: string) => { if (!d || (max && d > max)) return; onChange(d); setOpen(false) };
  const dayAfter = (d: string) => isoDate(new Date(parseDate(d)!.getTime() + DAY));
  const click = () => {
    if (!withPresets) return setOpen(true);
    menu(btn.current!, [...presets().map(p => ({ ...p, checked: p.value === value })), { label: 'Pick a date…', value: 'custom' }],
      v => v === 'custom' ? setTimeout(() => setOpen(true), 0) : onChange(v), false);
  };
  return <>
    <button ref={btn} type="button" className={className} aria-label={`${label}: ${value ? fmtDate(value) : 'not set'}`} aria-haspopup="dialog" onClick={click}>
      <Icon name="cal" size={14} style={{ color: 'var(--muted)' }} />{value ? fmtDate(value) + ' ' + value.slice(0, 4) : placeholder}</button>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Portal>
        <Popover.Positioner anchor={btn} side="bottom" align="start" sideOffset={6} className="cal-pos">
          <Popover.Popup className="cal-pop" aria-label={label}>
            <div className="mini-cal">
              <Suspense fallback={<div className="sk" style={{ height: 250 }} />}>
                <MiniCal value={value} end={max ? dayAfter(max) : undefined} onPick={pick} /></Suspense>
            </div>
            <label className="cal-type"><span>Or type a date</span>
              <input type="date" value={value ?? ''} max={max} onChange={e => pick(e.target.value)} /></label>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </>;
}

export const DuePicker = ({ value, onChange, className }: { value: string | null; onChange(v: string): void; className?: string }) =>
  <DatePicker value={value} onChange={onChange} label="Due date" placeholder="Set due date" withPresets className={className} />;
