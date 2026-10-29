import { useMemo } from 'react';
import { useStore } from '../store';
import type { Ticket, Worklog } from '../api';
import { ago, fmtDate, isOpen, isOverdue, lastWorkdays, PRIORITY_NAME, r1, today, urgency, weekStart, isoDate, DAY } from '../lib/format';
import { Donut } from '../components/Donut';
import { Icon, LogoMark, StatusIcon } from '../components/Icons';
import { CountUp, Due, Empty, Page } from '../components/ui';
import { TIMER_WARN_H } from '../components/Dialogs';

const BADGE: Record<string, [string, string]> = { '1': ['var(--danger)', '#fff'], '2': ['var(--urgent)', '#1b1c1f'], '3': ['var(--st-todo)', '#0f1011'], '4': ['var(--hover)', 'var(--text-2)'] };

/** Tickets in progress or testing with no time logged in the last two working days */
export function missingTime(tickets: Ticket[], recent: Worklog[]): Ticket[] {
  const since = lastWorkdays(2)[1];
  return tickets.filter(t => (t.Status === 'PROG' || t.Status === 'TEST') && !t.TimerStartedAt
    && !recent.some(w => w.TicketUUID === t.TicketUUID && w.WorkDate >= since));
}
export function byActivity(s: ReturnType<typeof useStore>, rows: Worklog[]) {
  return s.values.filter(v => v.ListType === 'ACTIVITY').map(v => ({ name: v.Text, color: v.Color || 'var(--muted)', value: rows.filter(w => w.Activity === v.Code).reduce((a, w) => a + w.Hours, 0) }));
}

export function Home() {
  const s = useStore();
  const monday = isoDate(weekStart());
  const week = useMemo(() => s.recentWork.filter(w => w.WorkDate >= monday), [s.recentWork, monday]);
  const running = s.tickets.find(t => t.TimerStartedAt);
  const elapsed = running?.TimerStartedAt ? (Date.now() - Date.parse(running.TimerStartedAt)) / 36e5 : 0;
  // a timer that was forgotten (longer than 8 h) is not counted until it is stopped and corrected
  const forgotten = elapsed > TIMER_WARN_H;
  const live = forgotten ? 0 : elapsed;
  const hours = week.reduce((a, w) => a + w.Hours, 0) + live;
  const open = s.tickets.filter(isOpen), over = open.filter(isOverdue), testing = open.filter(t => t.Status === 'TEST');
  const focus = s.tickets.filter(t => t.Status === 'TODO' || t.Status === 'PROG' || t.Status === 'TEST').sort(urgency).slice(0, 7);
  const attention: { t: Ticket; icon: React.ReactNode; why: string }[] = [
    ...over.map(t => ({ t, icon: <span style={{ color: 'var(--danger)', display: 'grid' }}><Icon name="alert" size={14} /></span>, why: `${Math.ceil((today().getTime() - Date.parse(t.DueDate + 'T00:00:00')) / DAY)}d overdue` })),
    ...(forgotten && running ? [{ t: running, icon: <span style={{ color: 'var(--urgent)', display: 'grid' }}><Icon name="clock" size={14} /></span>, why: `timer running ${Math.round(elapsed)} h` }] : []),
    ...open.filter(t => t.Status === 'BLOCK').map(t => ({ t, icon: <StatusIcon status="BLOCK" />, why: 'blocked' })),
    ...missingTime(s.tickets, s.recentWork).map(t => ({ t, icon: <span style={{ color: 'var(--urgent)', display: 'grid' }}><Icon name="clock" size={14} /></span>, why: 'no time logged' })),
  ];
  const data = useMemo(() => byActivity(s, week), [s, week]);
  const tot = data.reduce((a, d) => a + d.value, 0) || 1;
  const h = new Date().getHours();
  const first = (s.user.fullName || '').split(' ')[0];
  if (!s.ready) return (
    <Page crumb={<b>Home</b>}>
      <div className="home" aria-busy="true"><div className="sk" style={{ height: 26, width: 280, marginBottom: 22 }} />
        <div className="tiles">{[0, 1, 2, 3].map(i => <div key={i} className="tile"><div className="sk" style={{ height: 12, width: '50%' }} /><div className="sk" style={{ height: 28, width: '30%', margin: '12px 0' }} /></div>)}</div>
        <div className="panel" style={{ padding: 16 }}>{[0, 1, 2, 3, 4].map(i => <div key={i} className="sk" style={{ height: 14, width: (60 + i * 7) + '%', margin: '12px 0' }} />)}</div></div>
    </Page>);
  const byStatus = (st: string) => open.filter(t => t.Status === st).length;
  const oldest = [...over].sort((a, b) => (a.DueDate ?? '').localeCompare(b.DueDate ?? ''))[0];
  const sunday = isoDate(new Date(weekStart().getTime() + 6 * DAY));
  const card = (href: string, tint: string, title: React.ReactNode, badge: React.ReactNode, info: React.ReactNode, value: React.ReactNode, tone = '') =>
    <a className="hx-card" href={href} style={{ '--tint': tint } as React.CSSProperties}>
      <div className="hx-title">{title}</div>
      <span className={'hx-badge' + tone}>{badge}</span>
      <div className="hx-info">{info}</div>
      <div className="hx-foot"><span className="hx-val num">{value}</span><span className="hx-go" aria-hidden="true"><Icon name="move" size={14} /></span></div>
    </a>;
  return (
    <Page crumb={<b>Home</b>}>
      <div className="home hx">
        <header className="hx-head">
          <span className="hx-mark"><LogoMark size={30} /></span>
          <div className="hx-hello">
            <h2>Good {h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}{first ? `, ${first}` : ''}</h2>
            <div className="subt">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · your work at a glance</div>
          </div>
          <dl className="hx-meta">
            <div><dt>This week</dt><dd>{fmtDate(monday)} – {fmtDate(sunday)}</dd></div>
            <div><dt>Last sync</dt><dd>{ago(new Date(s.lastSync).toISOString())}</dd></div>
          </dl>
        </header>

        <h3 className="hx-sec">Overview</h3>
        <div className="hx-cards">
          {card('#list/active', 'var(--accent)', <><Icon name="my" size={15} />Open tickets</>, `${new Set(open.map(t => t.Project)).size} projects`,
            <>{byStatus('PROG')} in progress · {byStatus('TODO')} to do</>, <CountUp value={open.length} />)}
          {card('#list/overdue', over.length ? 'var(--danger)' : 'var(--ok)', <><Icon name="alert" size={15} />Overdue</>, over.length ? 'Needs attention' : 'All on track',
            oldest ? <>Oldest: {oldest.TicketId} · <Due t={oldest} short /></> : 'Nothing is late', <CountUp value={over.length} />, over.length ? ' bad' : ' good')}
          {card('#timesheet', 'var(--ok)', <><Icon name="clock" size={15} />Hours this week</>, 'Target 40 h',
            <>{Math.round(hours / 40 * 100)}% of the weekly target</>, <><CountUp value={r1(hours)} decimals={hours % 1 ? 1 : 0} /><small> h</small></>)}
          {card('#list/active', 'var(--st-test)', <><StatusIcon status="TEST" />In testing</>, 'Awaiting verification',
            <>{byStatus('BLOCK')} blocked · {byStatus('BACKLOG')} in backlog</>, <CountUp value={testing.length} />)}
        </div>

        <div className="hx-sec-row"><h3 className="hx-sec">My focus today</h3><a className="muted" href="#list/active">All open →</a></div>
        <div className="hx-table" role="table" aria-label="My focus today">
          <div className="hx-th" role="row"><span /><span role="columnheader">Ticket</span><span role="columnheader">Status</span>
            <span role="columnheader" className="hx-c-det">Details</span><span role="columnheader">Priority</span><span role="columnheader" className="hx-c-due">Due</span></div>
          {focus.map(t => {
            const [bg, fg] = BADGE[t.Priority] ?? BADGE['3'];
            return <a key={t.TicketUUID} className="hx-tr" role="row" href={'#ticket/' + t.TicketId}>
              <span className="hx-chev"><Icon name="right" size={15} /></span>
              <span className="hx-name"><b>{t.Title}</b><small className="num">{t.TicketId}</small></span>
              <span><span className={'hx-st st-' + t.Status.toLowerCase()}><StatusIcon status={t.Status} />{s.text('STATUS', t.Status)}</span></span>
              <span className="hx-c-det"><span className="t2">{s.text('TECH', t.Tech)} · {s.project(t.Project)?.Name ?? t.Project}</span>
                <small>{t.EstimateHours} h estimated · {r1(t.LoggedHours)} h logged</small></span>
              <span><span className="badge" style={{ background: bg, color: fg }}>{PRIORITY_NAME[t.Priority]}</span></span>
              <span className="hx-c-due"><Due t={t} short /></span>
            </a>;
          })}
          {!focus.length && <Empty icon="check" title="Nothing in progress">Press <kbd>C</kbd> to create a ticket.</Empty>}
        </div>

        <div className="hx-grid">
          <div className="panel hx-panel"><div className="ph">Time this week<span className="sp" /><span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>by activity</span></div>
            <div className="donut-wrap"><Donut data={data} sub="this week" />
              <ul className="legend">{data.filter(d => d.value > 0).map(d => <li key={d.name}><i style={{ background: d.color }} /><span>{d.name}</span><span className="h">{r1(d.value)} h</span><span className="p">{Math.round(d.value / tot * 100)}%</span></li>)}
                {!week.length && <li className="muted">No time logged yet</li>}</ul></div></div>
          <div className="panel hx-panel"><div className="ph">Needs attention<span className="sp" /><span className="muted num" style={{ fontWeight: 400 }}>{attention.length}</span></div>
            <ul className="att">{attention.slice(0, 8).map((a, i) => <li key={i} onClick={() => { location.hash = 'ticket/' + a.t.TicketId }}>{a.icon}<span className="x">{a.t.TicketId} {a.t.Title}</span><span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{a.why}</span></li>)}
              {!attention.length && <li className="muted" style={{ cursor: 'default' }}>All clear</li>}</ul></div>
        </div>
      </div>
    </Page>
  );
}
