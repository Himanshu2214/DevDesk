// Timeline: tickets as a Gantt chart (SVAR React Gantt, MIT). One group per project; a bar runs from the planned start
// (or the day the ticket was created) to its due date and fills with logged hours against the estimate (done = full).
// Dragging a bar or its ends changes the planned start and the due date; dragging from the end of one bar to another
// links them (the first must finish before the second starts); a double-click opens the ticket. Planned start and
// dependencies need the standalone or sample-data backend – in SAP mode the chart shows dates only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gantt, Willow, WillowDark, type IApi, type IColumnConfig } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useStore } from '../store';
import { DAY, fmtDate, isOpen, isoDate, today } from '../lib/format';
import { shownMode } from '../lib/theme';
import { Icon } from '../components/Icons';
import { Avatar, Empty, go, Page, TabIndicator } from '../components/ui';

type Zoom = 'day' | 'week' | 'month';
const fmt = (o: Intl.DateTimeFormatOptions) => (d: Date) => d.toLocaleDateString('en-GB', o);
const monthYear = fmt({ month: 'long', year: 'numeric' });
const SCALES: Record<Zoom, { cellWidth: number; scales: { unit: 'month' | 'week' | 'day'; step: number; format: (d: Date) => string }[] }> = {
  day: { cellWidth: 38, scales: [{ unit: 'month', step: 1, format: monthYear }, { unit: 'day', step: 1, format: d => String(d.getDate()) }] },
  week: { cellWidth: 96, scales: [{ unit: 'month', step: 1, format: monthYear }, { unit: 'week', step: 1, format: fmt({ day: 'numeric', month: 'short' }) }] },
  month: { cellWidth: 130, scales: [{ unit: 'month', step: 1, format: fmt({ month: 'short', year: 'numeric' }) }] },
};
const dateOf = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00');

export function Timeline() {
  const s = useStore();
  const ganttApi = useRef<IApi>();
  const qc = useQueryClient();
  const planning = !!api.listTicketLinks;
  const linksQ = useQuery({ queryKey: ['p2', 'ticketLinks'], queryFn: () => api.listTicketLinks!(), enabled: planning, staleTime: 30_000 });
  const [zoom, setZoom] = useState<Zoom>(() => { try { return (localStorage.getItem('devdesk-tl-zoom') as Zoom) || 'day' } catch { return 'day' } });
  const [openOnly, setOpenOnly] = useState(true);
  const [dark, setDark] = useState(shownMode() === 'dark');
  useEffect(() => { const on = () => setDark(shownMode() === 'dark'); addEventListener('devdesk-theme', on); return () => removeEventListener('devdesk-theme', on) }, []);
  const pickZoom = (z: Zoom) => { setZoom(z); try { localStorage.setItem('devdesk-tl-zoom', z) } catch { /* ignore */ } };

  const shown = useMemo(() => s.tickets.filter(t => !openOnly || isOpen(t)), [s.tickets, openOnly]);
  const byId = useMemo(() => new Map(shown.map(t => [t.TicketUUID, t])), [shown]);
  const tasks = useMemo(() => {
    const t0 = today();
    const rows = s.projects.flatMap(p => {
      const list = shown.filter(t => t.Project === p.Project).sort((a, b) => (a.DueDate ?? '9').localeCompare(b.DueDate ?? '9'));
      if (!list.length) return [];
      return [
        { id: 'p:' + p.Project, text: p.Name, type: 'summary', open: true, start: undefined, end: undefined, progress: 0, color: p.Color },
        ...list.map(t => {
          const start = t.PlannedStart ? dateOf(t.PlannedStart) : t.CreatedAt ? dateOf(t.CreatedAt) : t0;
          const due = t.DueDate ? new Date(dateOf(t.DueDate).getTime() + DAY) : new Date(Math.max(start.getTime(), t0.getTime()) + Math.max(1, Math.ceil(t.EstimateHours / 6)) * DAY);
          const progress = t.Status === 'DONE' ? 100 : t.EstimateHours > 0 ? Math.min(100, Math.round(t.LoggedHours / t.EstimateHours * 100)) : 0;
          return { id: t.TicketUUID, parent: 'p:' + p.Project, text: `${t.TicketId} ${t.Title}`, start, end: due > start ? due : new Date(start.getTime() + DAY),
            progress, type: 'task', status: t.Status, noDue: !t.DueDate, assignee: t.Assignee };
        }),
      ];
    });
    return rows;
  }, [shown, s.projects]);

  type Row = { status?: string; type?: string; end?: Date; noDue?: boolean; assignee?: string };
  const columns = useMemo<IColumnConfig[]>(() => [
    { id: 'text', header: 'Ticket', width: 260 },
    { id: 'assignee', header: 'Who', width: 64, align: 'center' as const, cell: ({ row }) => { const a = (row as Row).assignee; return a ? <span title={a}><Avatar name={a} size={20} /></span> : null } },
    { id: 'status', header: 'Status', width: 104, cell: ({ row }) => (row as Row).status ? <span className={'tl-st st-' + (row as Row).status!.toLowerCase()}>{s.text('STATUS', (row as Row).status!)}</span> : null },
    { id: 'end', header: 'Due', width: 78, align: 'center' as const, cell: ({ row }) => { const r = row as Row;
      return r.type === 'summary' || !r.end ? null : <span className="muted">{r.noDue ? '–' : fmtDate(new Date(r.end.getTime() - DAY))}</span> } },
  ], [s]);

  const links = useMemo(() => (linksQ.data ?? []).filter(l => byId.has(l.FromTicket) && byId.has(l.ToTicket))
    .map(l => ({ id: l.LinkUUID, source: l.FromTicket, target: l.ToTicket, type: 'e2s' as const })), [linksQ.data, byId]);
  const refreshLinks = () => qc.invalidateQueries({ queryKey: ['p2', 'ticketLinks'] });

  // moving or stretching a bar changes the planned start (where supported) and the due date
  const init = useCallback((g: IApi) => {
    ganttApi.current = g;
    g.intercept('show-editor', ({ id }: { id: string | number }) => { const t = byIdRef.current.get(String(id)); if (t) go('ticket/' + t.TicketId); return false });
    g.on('update-task', ev => {
      if (ev.inProgress) return;
      const t = byIdRef.current.get(String(ev.id)); const end = ev.task.end as Date | undefined, start = ev.task.start as Date | undefined;
      if (!t || !end) return;
      const due = isoDate(new Date(end.getTime() - DAY));
      const from = planning && start ? isoDate(start) : undefined;
      const p: { DueDate?: string; PlannedStart?: string } = {};
      if (due !== t.DueDate) p.DueDate = due;
      if (from && from !== (t.PlannedStart ?? (t.CreatedAt ?? '').slice(0, 10))) p.PlannedStart = from;
      if (!Object.keys(p).length) return;
      s.run(() => api.updateTicket(t, p), { uuids: [t.TicketUUID], optimistic: x => ({ ...x, ...p }),
        ok: p.PlannedStart ? `${t.TicketId}: ${fmtDate(p.PlannedStart)} – ${fmtDate(due)}` : `${t.TicketId} now due ${fmtDate(due)}` });
    });
    // dependencies are saved first and then drawn from the saved list (so they never exist only on screen)
    g.intercept('add-link', ev => {
      const { source, target } = ev.link;
      if (!planning) { s.toast('Dependencies are not available with the SAP backend yet.', true); return false }
      if (!byIdRef.current.has(String(source)) || !byIdRef.current.has(String(target))) return false;
      api.addTicketLink!(String(source), String(target)).then(() => { refreshLinks(); s.toast('Dependency added') }).catch(e => s.toast((e as Error).message, true));
      return false;
    });
    g.intercept('delete-link', ev => {
      api.deleteTicketLink?.(String(ev.id)).then(() => { refreshLinks(); s.toast('Dependency removed') }).catch(e => s.toast((e as Error).message, true));
      return false;
    });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const byIdRef = useRef(byId); byIdRef.current = byId;

  const markers = useMemo(() => [{ start: today(), text: 'Today', css: 'tl-today' }], []);
  const Theme = dark ? WillowDark : Willow;
  const bar2 = <>
    {(['day', 'week', 'month'] as Zoom[]).map(z => <button key={z} className={'pill' + (zoom === z ? ' on' : '')} onClick={() => pickZoom(z)}>
      {zoom === z && <TabIndicator id="tl-zoom" />}{z === 'day' ? 'Days' : z === 'week' ? 'Weeks' : 'Months'}</button>)}
    <span style={{ width: 8 }} />
    <button className={'pill' + (openOnly ? ' on' : '')} onClick={() => setOpenOnly(o => !o)} aria-pressed={openOnly}><Icon name="check" size={13} />Open tickets only</button>
    <span className="sp" />
    <span className="muted tl-hint">{planning ? 'Drag bars to plan · drag from a bar end to another bar to link · double-click to open' : 'Drag a bar to move its due date · double-click to open'}</span>
  </>;

  if (!s.ready) return <Page crumb={<b>Timeline</b>}><div className="sk" style={{ margin: 24, height: 320 }} /></Page>;
  if (!tasks.length) return <Page crumb={<b>Timeline</b>} bar2={bar2}><Empty icon="cal" title="Nothing to show">No {openOnly ? 'open ' : ''}tickets yet.</Empty></Page>;
  return (
    <Page crumb={<b>Timeline</b>} bar2={bar2}>
      <div className={'tl' + (dark ? ' tl-dark' : '')}>
        <Theme fonts={false}>
          <Gantt key={zoom + String(openOnly)} init={init} tasks={tasks} links={links} columns={columns} markers={markers}
            scales={SCALES[zoom].scales} cellWidth={SCALES[zoom].cellWidth} cellHeight={36} scaleHeight={30} gridWidth={506}
            highlightTime={(d: Date, unit: string) => unit === 'day' && (d.getDay() === 0 || d.getDay() === 6) ? 'tl-weekend' : ''} />
        </Theme>
      </div>
    </Page>
  );
}


