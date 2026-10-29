import { useMemo, useState } from 'react';
import { useStore, useWeekWorklog } from '../store';
import { DAY, fmtDate, isOpen, isoDate, r1, today, weekStart } from '../lib/format';
import { Donut } from '../components/Donut';
import { Icon, StatusIcon } from '../components/Icons';
import { go, Page } from '../components/ui';
import { useDialogs } from '../components/Dialogs';
import { byActivity, missingTime } from './Home';

export function Timesheet() {
  const s = useStore();
  const { openLog } = useDialogs();
  const [week, setWeek] = useState(0);
  const days = useMemo(() => [...Array(7)].map((_, i) => new Date(weekStart(week).getTime() + i * DAY)), [week]);
  const from = isoDate(days[0]), to = isoDate(days[6]), todayIso = isoDate(today());

  const week_ = useWeekWorklog(from, to);
  const rows = useMemo(() => week_.data ?? [], [week_.data]);

  const byTicket = useMemo(() => {
    const m = new Map<string, { id: string; title: string; status: string; est: number; h: number[] }>();
    for (const w of rows) {
      const t = s.tickets.find(x => x.TicketUUID === w.TicketUUID);
      const k = w.TicketUUID;
      if (!m.has(k)) m.set(k, { id: t?.TicketId ?? w._Ticket?.TicketId ?? '', title: t?.Title ?? w._Ticket?.Title ?? '', status: t?.Status ?? w._Ticket?.Status ?? 'TODO', est: t?.EstimateHours ?? 0, h: Array(7).fill(0) });
      const i = days.findIndex(d => isoDate(d) === w.WorkDate);
      if (i >= 0) m.get(k)!.h[i] += w.Hours;
    }
    return [...m.entries()].map(([uuid, r]) => ({ uuid, ...r, sum: r.h.reduce((a, b) => a + b, 0) })).sort((a, b) => b.sum - a.sum);
  }, [rows, s.tickets, days]);
  const totals = days.map((_, i) => byTicket.reduce((a, r) => a + r.h[i], 0));
  const all = totals.reduce((a, b) => a + b, 0);
  const data = useMemo(() => byActivity(s, rows), [s, rows]);
  const miss = week === 0 ? missingTime(s.tickets, s.recentWork) : [];
  const over = s.tickets.filter(t => isOpen(t) && t.EstimateHours > 0 && t.LoggedHours > t.EstimateHours).sort((a, b) => b.LoggedHours / b.EstimateHours - a.LoggedHours / a.EstimateHours);

  return (
    <Page crumb={<b>Timesheet</b>} bar2={<>
      <button className="ib" onClick={() => setWeek(w => w - 1)}>‹</button><b className="num">{fmtDate(days[0])} – {fmtDate(days[6])}</b>
      <button className="ib" disabled={week >= 0} onClick={() => setWeek(w => Math.min(0, w + 1))}>›</button>
      <button className="pill" onClick={() => setWeek(0)}>This week</button><span className="sp" />
      <span className="muted">Total <b className="t2 num">{r1(all)} h</b> of 40 h</span>
      <button className="btn primary" style={{ marginLeft: 10 }} onClick={() => openLog()}><Icon name="plus" size={14} />Log time</button></>}>
      <div className="tsw">
        <div className="panel" style={{ overflow: 'auto' }}>
          <table className="ts"><thead><tr><th style={{ width: 84 }}>Ticket</th><th>Title</th>
            {days.map(d => <th key={d.getTime()} className={isoDate(d) === todayIso ? 'today' : ''}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</th>)}
            <th>Week</th><th title="Estimate vs total logged">Est / actual</th></tr></thead>
            <tbody>{byTicket.map(r => {
              const t = s.tickets.find(x => x.TicketUUID === r.uuid);
              return <tr key={r.uuid} onClick={() => go('ticket/' + r.id)}><td className="muted num">{r.id}</td>
                <td className="ttl"><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><StatusIcon status={r.status as never} />{r.title}</span></td>
                {r.h.map((v, i) => <td key={i} className={v ? '' : 'z'}>{v ? r1(v) : '–'}</td>)}
                <td><b>{r1(r.sum)}</b></td><td style={t && t.LoggedHours > t.EstimateHours ? { color: 'var(--urgent)' } : undefined}>{r.est} / {r1(t?.LoggedHours ?? 0)}</td></tr>;
            })}
              {!byTicket.length && <tr><td colSpan={11} className="empty">No time logged this week</td></tr>}</tbody>
            <tfoot><tr><td /><td className="muted">Total</td>{totals.map((v, i) => <td key={i}>{v ? r1(v) : '–'}</td>)}<td>{r1(all)}</td><td /></tr></tfoot></table>
        </div>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="panel"><div className="ph">By activity</div>
            <div className="donut-wrap" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}><Donut data={data} sub={week === 0 ? 'this week' : 'week'} />
              <ul className="legend">{data.filter(d => d.value > 0).map(d => <li key={d.name}><i style={{ background: d.color }} /><span>{d.name}</span><span className="h">{r1(d.value)} h</span><span className="p">{Math.round(d.value / (all || 1) * 100)}%</span></li>)}
                {!all && <li className="muted">No entries</li>}</ul></div></div>
          <div className="panel"><div className="ph" style={{ paddingBottom: 8 }}>Missing time<span className="sp" /><span className="muted num" style={{ fontWeight: 400 }}>{miss.length}</span></div>
            {miss.map(t => <div key={t.TicketUUID} className="flag" onClick={() => openLog(t.TicketUUID)}><Icon name="clock" size={14} style={{ color: 'var(--urgent)' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.TicketId} {t.Title}</span><span className="muted" style={{ fontSize: 12 }}>Log…</span></div>)}
            {!miss.length && <div className="flag muted" style={{ cursor: 'default' }}>Every active ticket has recent time</div>}</div>
          <div className="panel"><div className="ph" style={{ paddingBottom: 8 }}>Over estimate<span className="sp" /><span className="muted num" style={{ fontWeight: 400 }}>{over.length}</span></div>
            {over.slice(0, 6).map(t => <div key={t.TicketUUID} className="flag" onClick={() => go('ticket/' + t.TicketId)}><StatusIcon status={t.Status} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.TicketId} {t.Title}</span>
              <span className="num" style={{ color: 'var(--urgent)', fontSize: 12 }}>{Math.round(t.LoggedHours / t.EstimateHours * 100)}%</span></div>)}
            {!over.length && <div className="flag muted" style={{ cursor: 'default' }}>Nothing over estimate</div>}</div>
        </div>
      </div>
    </Page>
  );
}
