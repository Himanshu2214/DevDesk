// Settings → Lists: your own ticket types, areas (modules), tech, time activities and status names. Items are hidden
// rather than deleted, so older tickets that use them still read correctly. Status codes are fixed (the workflow
// depends on them) – their names, colours and WIP limits can change.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { ValueItem } from '../api';
import { useStore } from '../store';
import { Icon, Spinner } from '../components/Icons';
import { Empty, Page, TabIndicator } from '../components/ui';

const LISTS: { type: string; label: string; hint: string; colour?: boolean; fixed?: boolean }[] = [
  { type: 'TYPE', label: 'Ticket types', hint: 'Bug, change request, new development … – add your own, e.g. "Data migration".' },
  { type: 'AREA', label: 'Areas / modules', hint: 'SAP modules or parts of your landscape, e.g. EWM, TM, HR.' },
  { type: 'TECH', label: 'Tech', hint: 'The technology a ticket is about; the colour shows on tags.', colour: true },
  { type: 'ACTIVITY', label: 'Time activities', hint: 'What logged time was spent on; the colour shows in the timesheet charts.', colour: true },
  { type: 'STATUS', label: 'Statuses', hint: 'The workflow is fixed; rename a status, change its colour or its work-in-progress limit (0 = none).', colour: true, fixed: true },
];

export function Lists() {
  const s = useStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState(LISTS[0].type);
  const [code, setCode] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState('');
  const list = LISTS.find(l => l.type === tab)!;
  const items = s.values.filter(v => v.ListType === tab).sort((a, b) => a.SortOrder - b.SortOrder);
  const editable = !!api.saveValue;

  const save = async (v: ValueItem, ok?: string) => {
    setBusy(v.Code);
    const done = await s.run(() => api.saveValue!(v), { ok });
    setBusy('');
    if (done) await qc.invalidateQueries({ queryKey: ['values'] });
    return done;
  };
  const move = async (i: number, d: -1 | 1) => {
    const a = items[i], b = items[i + d];
    if (!a || !b) return;
    await save({ ...a, SortOrder: b.SortOrder });
    await save({ ...b, SortOrder: a.SortOrder });
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase(), t = text.trim();
    if (!c || !t) return;
    if (items.some(v => v.Code === c)) return s.toast(`${c} already exists in ${list.label.toLowerCase()}`, true);
    const ok = await save({ ListType: tab, Code: c, Text: t, SortOrder: Math.max(0, ...items.map(v => v.SortOrder)) + 1, Color: list.colour ? '#8A8F98' : '', WipLimit: 0, IsActive: true }, `${t} added`);
    if (ok) { setCode(''); setText('') }
  };

  return <Page crumb={<b>Lists</b>}>
    <div className="acct lists">
      <header className="acct-head"><h2>Lists</h2><p className="muted">The choices offered on tickets and time entries – your own, separate from anyone you share with.</p></header>
      <div className="tp-tabs">{LISTS.map(l => <button key={l.type} className={tab === l.type ? 'on' : ''} onClick={() => setTab(l.type)}>
        {tab === l.type && <TabIndicator id="lists-tab" line />}{l.label} <span className="muted num">{s.values.filter(v => v.ListType === l.type && v.IsActive !== false).length}</span></button>)}</div>
      <section className="panel acct-sec lists-sec">
        <p className="muted acct-note">{list.hint}{!editable && ' In SAP mode the lists are maintained in SAP (table ZDD_VALUE).'}</p>
        {items.length === 0 ? <Empty icon="list" title="Nothing here yet" /> : <ul className="list-items">{items.map((v, i) =>
          <li key={v.Code} className={v.IsActive === false ? 'off' : ''}>
            {list.colour && <input type="color" className="list-colour" value={v.Color || '#8A8F98'} disabled={!editable} aria-label={`Colour of ${v.Text}`}
              onChange={e => save({ ...v, Color: e.target.value })} />}
            <code className="list-code">{v.Code}</code>
            <input className="list-text" defaultValue={v.Text} key={v.Code + v.Text} disabled={!editable} aria-label={`Name of ${v.Code}`}
              onBlur={e => { const t = e.target.value.trim(); if (t && t !== v.Text) save({ ...v, Text: t }, 'Renamed'); else e.target.value = v.Text }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            {tab === 'STATUS' && <label className="list-wip" title="Work-in-progress limit on the board (0 = no limit)">WIP
              <input type="number" min={0} max={99} defaultValue={v.WipLimit} key={'w' + v.WipLimit} disabled={!editable}
                onBlur={e => { const n = Math.max(0, Math.min(99, Number(e.target.value) || 0)); if (n !== v.WipLimit) save({ ...v, WipLimit: n }) }} /></label>}
            <span className="sp" />
            {busy === v.Code && <Spinner />}
            {editable && <>
              <button className="ib" title="Move up" aria-label={`Move ${v.Text} up`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)}><Icon name="up" size={14} /></button>
              <button className="ib" title="Move down" aria-label={`Move ${v.Text} down`} disabled={i === items.length - 1 || !!busy} onClick={() => move(i, 1)}><Icon name="down" size={14} /></button>
              {!list.fixed && <button className="btn list-hide" disabled={!!busy} onClick={() => save({ ...v, IsActive: v.IsActive === false }, v.IsActive === false ? `${v.Text} is offered again` : `${v.Text} hidden – tickets that use it keep it`)}>
                <Icon name={v.IsActive === false ? 'eye' : 'eye-off'} size={13} />{v.IsActive === false ? 'Show' : 'Hide'}</button>}
            </>}
          </li>)}</ul>}
        {editable && !list.fixed && <form className="list-add" onSubmit={add}>
          <input className="list-code-in" placeholder="Code" maxLength={10} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} aria-label="Code (letters and digits, up to 10)" />
          <input className="list-text-in" placeholder={`New ${list.label.toLowerCase().replace(/s( \/ .*)?$/, '')} name`} maxLength={60} value={text} onChange={e => setText(e.target.value)} aria-label="Name" />
          <button className="btn primary" disabled={!code.trim() || !text.trim() || !!busy}><Icon name="plus" size={14} />Add</button>
        </form>}
      </section>
    </div>
  </Page>;
}
