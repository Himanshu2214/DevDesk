// Insights: progress over time (scope / started / completed with a projection), how long tickets take,
// hours per week and completion by project, area or tech.
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { keys, useStore } from '../store';
import { DAY, fmtDate, isoDate, r1, weekStart } from '../lib/format';
import { breakdown, type BreakBy, cycleDays, inWindow, onTimeShare, percentile, progress, projection, startedAt, weeklyHours } from '../lib/insights';
import { chartBase, css, EChart } from '../components/EChart';
import { Icon } from '../components/Icons';
import { Empty, Page, TabIndicator } from '../components/ui';
import { type ExportFormat, exportSheets } from '../lib/export';
import { useMenu } from '../components/ui';

const RANGES = [30, 90, 180] as const;
const AHEAD = 21;

function Ring({ p }: { p: number }) {
  const r = 7, c = 2 * Math.PI * r;
  return <svg className="ring" viewBox="0 0 18 18" width={18} height={18} aria-hidden="true"><circle cx="9" cy="9" r={r} fill="none" stroke="var(--border-2)" strokeWidth="2" />
    <circle cx="9" cy="9" r={r} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray={`${(p * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 9 9)" strokeLinecap="round" /></svg>;
}

export function Insights() {
  const s = useStore();
  const menu = useMenu();
  const [range, setRange] = useState<number>(() => { try { return Number(localStorage.getItem('devdesk-ins-range')) || 90 } catch { return 90 } });
  const [by, setBy] = useState<BreakBy>('Project');
  const pickRange = (d: number) => { setRange(d); try { localStorage.setItem('devdesk-ins-range', String(d)) } catch { /* ignore */ } };

  const weeks = Math.max(4, Math.round(range / 7));
  const from = isoDate(new Date(weekStart().getTime() - (weeks - 1) * 7 * DAY)), to = isoDate(new Date());
  // status history for "work begun"; Supabase returns at most 1000 rows per request – plenty for the windows shown
  const events = useQuery({ queryKey: [...keys.side, 'insights-events'], queryFn: () => api.listEvents(1000), staleTime: 60_000 });
  const work = useQuery({ queryKey: keys.week(from, to), queryFn: () => api.listWorklog(from, to), staleTime: 60_000 });

  const started = useMemo(() => startedAt(events.data ?? []), [events.data]);
  const now = Date.now(), winFrom = now - range * DAY;
  const P = useMemo(() => progress(s.tickets, started, range), [s.tickets, started, range]);
  const proj = useMemo(() => projection(P, AHEAD), [P]);
  const cyc = useMemo(() => cycleDays(s.tickets, started, winFrom), [s.tickets, started, winFrom]);
  const onTime = onTimeShare(s.tickets, winFrom);
  const hours = useMemo(() => weeklyHours(work.data ?? [], weeks), [work.data, weeks]);
  const rows = useMemo(() => breakdown(inWindow(s.tickets, winFrom), by), [s.tickets, winFrom, by]);
  const n = P.dates.length, last = n - 1;

  const progressOption = useCallback(() => {
    const labels = [...P.dates, ...proj.map((_, i) => P.dates[last] + (i + 1) * DAY)].map(d => fmtDate(new Date(d)));
    const pad = (a: number[]) => [...a, ...Array(AHEAD).fill(null)];
    const line = (name: string, data: (number | null)[], color: string, extra: object = {}) =>
      ({ name, type: 'line', data, symbol: 'none', smooth: 0.25, lineStyle: { width: 1.6, color }, itemStyle: { color }, ...extra });
    const base = chartBase();
    return { ...base, grid: { left: 4, right: 12, top: 14, bottom: 4, containLabel: true },
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: css('--border-2') } },
        formatter: (ps: { name: string; value: number | null; marker: string; seriesName: string }[]) => {
          const v = ps.filter(p => p.value !== null && p.value !== undefined);
          return v.length ? `<b>${ps[0].name}</b><br>` + v.map(p => `${p.marker}${p.seriesName} <b>${p.value}</b>`).join('<br>') : '';
        } },
      xAxis: { type: 'category', boundaryGap: false, data: labels, axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false },
        axisLabel: { color: css('--muted'), fontSize: 11, interval: (i: number) => i === 0 || i === last || i === labels.length - 1 } },
      yAxis: { type: 'value', show: false, max: (v: { max: number }) => Math.max(1, Math.ceil(v.max * 1.08)) },
      series: [
        line('Scope', pad(P.scope), css('--st-backlog')),
        line('Started', pad(P.started), css('--st-prog')),
        line('Completed', pad(P.done), css('--accent'), {
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: css('--accent-soft') }, { offset: 1, color: 'transparent' }] } },
          markLine: { symbol: 'none', silent: true, label: { show: false }, lineStyle: { color: css('--danger'), width: 1, type: 'solid', opacity: 0.7 }, data: [{ xAxis: labels[last] }] },
          markArea: { silent: true, itemStyle: { color: 'rgba(235,87,87,.07)' }, data: [[{ xAxis: labels[last] }, { xAxis: labels.at(-1) }]] } }),
        line('Projected', [...Array(last).fill(null), P.done[last], ...proj], css('--accent'), { lineStyle: { width: 1.4, color: css('--accent'), type: [3, 4] }, smooth: false }),
      ] };
  }, [P, proj, last]);

  const hoursOption = useCallback(() => {
    const base = chartBase();
    return { ...base, grid: { left: 4, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: css('--hover') } },
        formatter: (p: { name: string; value: number }[]) => `Week of ${p[0].name}<br><b>${p[0].value} h</b>` },
      xAxis: { type: 'category', data: hours.map(w => fmtDate(new Date(w.monday))), axisLine: { lineStyle: { color: css('--axis') } }, axisTick: { show: false },
        axisLabel: { color: css('--muted'), fontSize: 11, hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { color: css('--muted'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--grid') } } },
      series: [{ type: 'bar', barMaxWidth: 14, itemStyle: { color: css('--accent'), borderRadius: [3, 3, 0, 0] },
        data: hours.map((w, i) => (i === hours.length - 1 ? { value: w.hours, itemStyle: { color: css('--accent-2') } } : w.hours)),
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 40 }], lineStyle: { color: css('--muted'), type: [3, 4], width: 1 },
          label: { color: css('--muted'), fontSize: 11, position: 'insideEndTop', formatter: '40 h' } } }] };
  }, [hours]);

  const exportAll = (format: ExportFormat) => {
    exportSheets([
      { name: 'Progress', columns: [{ header: 'Date', width: 12 }, { header: 'Scope' }, { header: 'Started' }, { header: 'Completed' }],
        rows: P.dates.map((d, i) => [isoDate(new Date(d)), P.scope[i], P.started[i], P.done[i]]) },
      { name: 'Hours per week', columns: [{ header: 'Week of', width: 12 }, { header: 'Hours' }], rows: hours.map(w => [isoDate(new Date(w.monday)), w.hours]) },
      { name: 'By ' + by.toLowerCase(), columns: [{ header: by, width: 24 }, { header: 'Tickets' }, { header: 'Done' }, { header: 'Done %' }],
        rows: rows.map(r => [label(r.key), r.total, r.done, Math.round(r.done / r.total * 100)]) },
    ], `slate-space-insights-${range}d`, format);
  };
  const label = (k: string) => by === 'Project' ? s.project(k)?.Name ?? k : by === 'Tech' ? s.text('TECH', k) : s.text('AREA', k);

  const bar2 = <>
    {RANGES.map(d => <button key={d} className={'pill' + (range === d ? ' on' : '')} onClick={() => pickRange(d)}>{range === d && <TabIndicator id="ins-range" />}{d} days</button>)}
    <span className="sp" />
    <button className="btn" onClick={e => menu(e.currentTarget, [{ label: 'Excel (.xlsx)', value: 'xlsx' }, { label: 'CSV – progress (.csv)', value: 'csv' }], v => exportAll(v as ExportFormat), false)}>
      <Icon name="download" size={14} />Export</button>
  </>;

  if (!s.ready || events.isLoading) return <Page crumb={<b>Insights</b>} bar2={bar2}><div className="ins" aria-busy="true">
    <div className="panel" style={{ padding: 16 }}><div className="sk" style={{ height: 280 }} /></div><div className="panel" style={{ padding: 16 }}><div className="sk" style={{ height: 200 }} /></div></div></Page>;
  if (!s.tickets.length) return <Page crumb={<b>Insights</b>}><Empty icon="chart" title="No tickets yet">Insights appear once you have created and worked on a few tickets.</Empty></Page>;

  const pctOf = (x: number) => P.scope[last] ? Math.round(x / P.scope[last] * 100) : 0;
  return (
    <Page crumb={<b>Insights</b>} bar2={bar2}>
      <div className="ins">
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="panel"><div className="ph">Progress<span className="sp" /><span className="muted ins-hint">started = work begun · dotted = projection at the current pace</span></div>
            <div className="legend3">
              <div><div className="l"><i style={{ background: 'var(--st-backlog)' }} />Scope</div><div className="v num">{P.scope[last]}</div></div>
              <div><div className="l"><i style={{ background: 'var(--st-prog)' }} />Started</div><div className="v num">{P.started[last]}<small>{pctOf(P.started[last])}%</small></div></div>
              <div><div className="l"><i style={{ background: 'var(--accent)' }} />Completed</div><div className="v num">{P.done[last]}<small>{pctOf(P.done[last])}%</small></div></div></div>
            <div style={{ padding: '6px 8px 4px' }}><EChart option={progressOption} height={280} label={`Progress over ${range} days: ${P.done[last]} of ${P.scope[last]} tickets completed`} /></div>
            <div className="ins-stats">
              <span>Typical time to finish <b className="t2">{cyc.length ? `${r1(percentile(cyc, 0.5))} d` : '–'}</b></span>
              <span>85% within <b className="t2">{cyc.length ? `${r1(percentile(cyc, 0.85))} d` : '–'}</b></span>
              <span>On time <b className="t2">{onTime === null ? '–' : `${Math.round(onTime * 100)}%`}</b></span>
              <span>Closed <b className="t2">{cyc.length}</b></span></div></div>
          <div className="panel"><div className="ph">Hours per week<span className="sp" /><span className="muted ins-hint">dotted line = 40 h · avg {r1(hours.reduce((a, w) => a + w.hours, 0) / (hours.length || 1))} h</span></div>
            <div style={{ padding: '6px 8px 8px' }}>{work.isLoading ? <div className="sk" style={{ height: 190 }} /> : <EChart option={hoursOption} height={190} label={`Hours logged per week, last ${weeks} weeks`} />}</div></div>
        </div>
        <div className="panel" style={{ alignSelf: 'start' }}>
          <div className="tabs3" role="tablist">{(['Project', 'Area', 'Tech'] as BreakBy[]).map(k => <button key={k} role="tab" aria-selected={by === k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{k === 'Project' ? 'Projects' : k === 'Area' ? 'Areas' : 'Tech'}</button>)}</div>
          <ul className="brk">{rows.map(r => <li key={r.key}>
            {by === 'Project' ? <span className="dot" style={{ width: 9, height: 9, borderRadius: 2, background: s.project(r.key)?.Color ?? 'var(--muted)' }} />
              : by === 'Tech' ? <span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', background: s.color('TECH', r.key) }} /> : <Icon name="folder" size={15} style={{ color: 'var(--muted)' }} />}
            <span className="n">{label(r.key)}</span><Ring p={r.done / r.total} /><span className="p">{Math.round(r.done / r.total * 100)}% of {r.total}</span></li>)}
            {!rows.length && <li className="muted">No tickets in this period</li>}</ul>
        </div>
      </div>
    </Page>
  );
}
