// Due date with presets (Today, Tomorrow, End of week, Next Monday, In 2 weeks) and a custom date.
import { useRef } from 'react';
import { DAY, fmtDate, isoDate, today } from '../lib/format';
import { Icon } from './Icons';
import { useMenu } from './ui';

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

export function DuePicker({ value, onChange, className = 'pv' }: { value: string | null; onChange(v: string): void; className?: string }) {
  const menu = useMenu();
  const input = useRef<HTMLInputElement>(null);
  const open = (e: React.MouseEvent<HTMLButtonElement>) => menu(e.currentTarget,
    [...presets().map(p => ({ ...p, checked: p.value === value })), { label: 'Pick a date…', value: 'custom' }],
    v => {
      if (v !== 'custom') return onChange(v);
      const el = input.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      if (el?.showPicker) el.showPicker(); else el?.focus();
    }, false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={className} onClick={open}><Icon name="cal" size={14} style={{ color: 'var(--muted)' }} />{value ? fmtDate(value) + ' ' + value.slice(0, 4) : 'Set due date'}</button>
      <input ref={input} type="date" aria-label="Due date" value={value ?? ''} onChange={e => e.target.value && onChange(e.target.value)}
        style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
    </span>
  );
}
