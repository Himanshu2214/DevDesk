import { useMemo } from 'react';
import { useStore } from '../store';
import type { Ticket, Worklog } from '../api';
import { isOpen, isOverdue, lastWorkdays, PRIORITY_NAME, r1, today, urgency, weekStart, isoDate, DAY } from '../lib/format';
import { Donut } from '../components/Donut';
import { Icon, StatusIcon } from '../components/Icons';
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
  return (
    <Page crumb={<b>Home</b>}>
      <div className="home">
        <h2>Good {h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}{first ? `, ${first}` : ''}</h2>
        <div className="subt">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="tiles">
          <a className="tile" href="#list/active"><div className="l"><Icon name="my" size={14} />Open tickets</div><div className="v num"><CountUp value={open.length} /></div><div className="s">across {new Set(open.map(t => t.Project)).size} projects</div></a>
          <a className="tile" href="#list/overdue"><div className="l" style={over.length ? { color: 'var(--danger)' } : undefined}><Icon name="alert" size={14} />Overdue</div><div className="v num"><CountUp value={over.length} /></div><div className="s">{over.length ? 'needs attention' : 'all on track'}</div></a>
          <a className="tile" href="#timesheet"><div className="l"><Icon name="clock" size={14} />Hours this week</div><div className="v num"><CountUp value={r1(hours)} decimals={hours % 1 ? 1 : 0} /><span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 400 }}> h</span></div><div className="s">from work logs · target 40 h</div></a>
          <a className="tile" href="#list/active"><div className="l"><StatusIcon status="TEST" />In testing</div><div className="v num"><CountUp value={testing.length} /></div><div className="s">awaiting verification</div></a>
        </div>
        <div className="home-grid">
          <div className="panel focus">
            <div className="ph">My focus today<span className="sp" /><a className="muted" href="#list/active" style={{ fontWeight: 400, fontSize: 12 }}>All open →</a></div>
            <div style={{ height: 10 }} />
            {focus.map(t => {
              const [bg, fg] = BADGE[t.Priority] ?? BADGE['3'];
              return <a key={t.TicketUUID} className="fi" href={'#ticket/' + t.TicketId}>
                <span className="badge" style={{ background: bg, color: fg }}>{PRIORITY_NAME[t.Priority]}</span>
                <div style={{ minWidth: 0 }}><div className="t1">{t.Title}</div>
                  <div className="t2">{s.text('TECH', t.Tech)} · {s.project(t.Project)?.Name ?? t.Project} · {t.EstimateHours} h estimated · {r1(t.LoggedHours)} h logged</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><StatusIcon status={t.Status} /><Due t={t} short /></div></a>;
            })}
            {!focus.length && <Empty icon="check" title="Nothing in progress">Press <kbd>C</kbd> to create a ticket.</Empty>}
          </div>
          <div className="stack">
            <div className="panel"><div className="ph">Time this week<span className="sp" /><span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>by activity</span></div>
              <div className="donut-wrap"><Donut data={data} sub="this week" />
                <ul className="legend">{data.filter(d => d.value > 0).map(d => <li key={d.name}><i style={{ background: d.color }} /><span>{d.name}</span><span className="h">{r1(d.value)} h</span><span className="p">{Math.round(d.value / tot * 100)}%</span></li>)}
                  {!week.length && <li className="muted">No time logged yet</li>}</ul></div></div>
            <div className="panel"><div className="ph">Needs attention<span className="sp" /><span className="muted num" style={{ fontWeight: 400 }}>{attention.length}</span></div>
              <ul className="att">{attention.slice(0, 8).map((a, i) => <li key={i} onClick={() => { location.hash = 'ticket/' + a.t.TicketId }}>{a.icon}<span className="x">{a.t.TicketId} {a.t.Title}</span><span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{a.why}</span></li>)}
                {!attention.length && <li className="muted" style={{ cursor: 'default' }}>All clear</li>}</ul></div>
          </div>
        </div>
      </div>
    </Page>
  );
}
