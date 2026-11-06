// Recurring tickets (cloud): "Repeat" on your own ticket makes a rule that creates a copy every workday, week or month
// (migration 20261122000000_recurring_tickets). The app runs due rules when it opens (runRecurring); rules are listed,
// paused and deleted in Account → Recurring tickets.
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Ticket } from '../api';
import { sb } from '../lib/supabase';
import { isoDate } from '../lib/format';
import { useStore } from '../store';
import { Icon } from './Icons';
import { Modal } from './Dialogs';

type Every = 'workday' | 'week' | 'month';
interface Rule { RuleUUID: string; Title: string; Every: Every; NextRun: string; DueInDays: number; Active: boolean }
const EVERY: Record<Every, string> = { workday: 'Every workday', week: 'Every week', month: 'Every month' };
export const recurringAvailable = import.meta.env.VITE_BACKEND === 'supabase';

/** creates the tickets of due rules (when the app opens); how many were created */
export async function runRecurring(): Promise<number> {
  const { data, error } = await sb().rpc('run_recurring', { p_today: isoDate(new Date()) });
  if (error) return 0;                                  // e.g. the migration is not on this project yet
  return Number(data) || 0;
}

/** ticket page: "Repeat" (own tickets only) */
export function RepeatButton({ t }: { t: Ticket }) {
  const [open, setOpen] = useState(false);
  if (!recurringAvailable || t.SharedBy) return null;
  return <>
    <button className="btn" onClick={() => setOpen(true)} title="Create this ticket again every workday, week or month"><Icon name="refresh" size={14} /><span className="hide-narrow">Repeat</span></button>
    <AnimatePresence>{open && <RepeatDialog key="repeat" t={t} close={() => setOpen(false)} />}</AnimatePresence>
  </>;
}

function RepeatDialog({ t, close }: { t: Ticket; close(): void }) {
  const s = useStore();
  const [every, setEvery] = useState<Every>('week');
  const [start, setStart] = useState(isoDate(new Date(Date.now() + 7 * 864e5)));
  const [dueIn, setDueIn] = useState(2);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await sb().from('recurring_tickets').insert({
      Title: t.Title, Every: every, NextRun: start, DueInDays: dueIn,
      Data: { Description: t.Description ?? '', Priority: t.Priority, Project: t.Project, Area: t.Area, Tech: t.Tech, TicketType: t.TicketType, Environment: t.Environment, EstimateHours: t.EstimateHours },
    });
    setBusy(false);
    if (error) return s.toast(/recurring_tickets/.test(error.message) ? 'Recurring tickets are not set up on this workspace yet.' : error.message, true);
    s.toast(`${EVERY[every]} from ${start}: a new “${t.Title}” – manage it in Account`); close();
  };
  return <Modal close={close} width={440} label={`Repeat ${t.TicketId}`}>
    <div className="top"><Icon name="refresh" size={15} /><span>Repeat · {t.TicketId}</span><span className="sp" /><button className="ib" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
    <form className="rep-form" onSubmit={save}>
      <p className="muted">A new copy of “{t.Title}” (same project, priority, type and description) is created automatically.</p>
      <label>How often<select value={every} onChange={e => setEvery(e.target.value as Every)}>{(Object.keys(EVERY) as Every[]).map(k => <option key={k} value={k}>{EVERY[k]}</option>)}</select></label>
      <label>First copy on<input type="date" value={start} min={isoDate(new Date())} onChange={e => setStart(e.target.value)} required /></label>
      <label>Due<select value={dueIn} onChange={e => setDueIn(Number(e.target.value))}>{[0, 1, 2, 3, 5, 7, 14].map(n => <option key={n} value={n}>{n === 0 ? 'the same day' : `${n} day${n > 1 ? 's' : ''} later`}</option>)}</select></label>
      <div className="rep-actions"><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={busy}>Repeat</button></div>
    </form>
  </Modal>;
}

/** Account → Recurring tickets: every rule with its next date; pause, resume, delete */
export function RecurringSection({ Section }: { Section: (p: { title: string; sub: string; children: React.ReactNode }) => React.ReactElement }) {
  const s = useStore();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const load = () => sb().from('recurring_tickets').select('"RuleUUID","Title","Every","NextRun","DueInDays","Active"').order('NextRun')
    .then(({ data, error }) => setRules(error ? [] : (data as Rule[])));
  useEffect(() => { void load() }, []);
  const change = async (r: Rule, patch: Partial<Rule> | null) => {
    const q = patch ? sb().from('recurring_tickets').update(patch).eq('RuleUUID', r.RuleUUID) : sb().from('recurring_tickets').delete().eq('RuleUUID', r.RuleUUID);
    const { error } = await q;
    if (error) return s.toast(error.message, true);
    s.toast(patch ? (patch.Active ? 'Resumed' : 'Paused') : 'Recurring ticket deleted'); void load();
  };
  if (!recurringAvailable) return null;
  return <Section title="Recurring tickets" sub="Tickets that are created again automatically. Make one with Repeat on any of your tickets.">
    {rules === null ? <div className="sk" style={{ height: 40 }} /> : !rules.length ? <p className="muted">None yet.</p> :
      <ul className="rep-list">{rules.map(r => <li key={r.RuleUUID} className={r.Active ? '' : 'off'}>
        <span><b>{r.Title}</b><small>{EVERY[r.Every]} · {r.Active ? `next ${r.NextRun}` : 'paused'}{r.DueInDays ? ` · due ${r.DueInDays} day${r.DueInDays > 1 ? 's' : ''} later` : ''}</small></span>
        <button className="btn" onClick={() => change(r, { Active: !r.Active })}>{r.Active ? 'Pause' : 'Resume'}</button>
        <button className="ib" aria-label={`Delete ${r.Title}`} onClick={() => change(r, null)}><Icon name="trash" /></button>
      </li>)}</ul>}
  </Section>;
}
