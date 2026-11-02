// Board layout of the ticket list: one column per status, drag and drop between them (dnd-kit). Its own file so
// dnd-kit loads with the first board instead of with the app (see TicketList).
import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { Status, Ticket } from '../api';
import { useStore } from '../store';
import { Icon, PriorityIcon, StatusIcon } from '../components/Icons';
import { Avatar, Due, TechTag, Tip, useChangeFlash } from '../components/ui';
import { useDialogs } from '../components/Dialogs';
import { SharedMark } from '../components/ShareTicket';

export default function Board({ cols, column, project, setStatus, onPrio }: {
  cols: Status[];
  /** the tickets shown in one column, sorted */
  column(k: Status): Ticket[];
  project: string | null;
  setStatus(t: Ticket, st: Status): void;
  onPrio(e: React.MouseEvent, t: Ticket): void;
}) {
  const s = useStore();
  const { openNew } = useDialogs();
  const [dragId, setDragId] = useState<string | null>(null);
  const justDragged = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const dragged = s.tickets.find(t => t.TicketUUID === dragId);
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
      onDragCancel={() => setDragId(null)}
      onDragEnd={(e: DragEndEvent) => {
        setDragId(null);
        justDragged.current = Date.now();
        const t = s.tickets.find(x => x.TicketUUID === e.active.id), to = e.over?.id as Status | undefined;
        if (t && to && t.Status !== to) setStatus(t, to);
      }}>
      <m.div className="board" layoutScroll>{cols.map(k => {
        const g = column(k);
        const wip = s.wip(k), over = wip > 0 && g.length > wip;
        return (
          <Column key={k} status={k} empty={!g.length}>
            <div className="col-h"><StatusIcon status={k} />{s.text('STATUS', k)}<span className="c">{g.length}</span><span className="sp" />
              {wip > 0 && <span className={'wip' + (over ? ' over' : '')} title="Work-in-progress limit">{g.length}/{wip}</span>}
              <Tip label={'New ticket in ' + s.text('STATUS', k)}><button className="ib" aria-label={'New ticket in ' + s.text('STATUS', k)} onClick={() => openNew({ status: k, ...(project ? { Project: project } : {}) })}><Icon name="plus" /></button></Tip></div>
            {!g.length && <div className="col-empty">No tickets</div>}
            {g.map(t => <DraggableCard key={t.TicketUUID} t={t} hidden={dragId === t.TicketUUID} justDragged={justDragged} onPrio={onPrio} />)}
          </Column>);
      })}</m.div>
      <DragOverlay dropAnimation={null}>{dragged && <div className="card overlay"><CardBody t={dragged} /></div>}</DragOverlay>
    </DndContext>
  );
}

const STATUS_VAR: Record<Status, string> = { BACKLOG: 'backlog', TODO: 'todo', PROG: 'prog', TEST: 'test', BLOCK: 'block', DONE: 'done' };
function Column({ status, empty, children }: { status: Status; empty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <div ref={setNodeRef} className={'col' + (isOver ? ' drop' : '') + (empty ? ' is-empty' : '')} style={{ ['--c' as string]: `var(--st-${STATUS_VAR[status]})` }}>{children}</div>;
}

function CardBody({ t, onPrio }: { t: Ticket; onPrio?: (e: React.MouseEvent, t: Ticket) => void }) {
  return <>
    <div className="t" style={{ marginTop: 0 }}><span>{t.Title}<SharedMark t={t} /></span></div>
    <div className="tags"><TechTag code={t.Tech} /><span className="tag">{t.Area}</span>
      {t.TicketType === 'BUG' && <span className="tag" style={{ background: 'rgba(235,87,87,.16)', color: 'var(--danger)' }}>Bug</span>}</div>
    <div className="r3"><span className="muted num" style={{ fontSize: 12 }}>{t.TicketId}</span>
      <span onClick={e => onPrio?.(e, t)} onPointerDown={e => e.stopPropagation()}><PriorityIcon priority={t.Priority} /></span><Due t={t} short /><span className="sp" />
      <span className="muted num" style={{ fontSize: 12 }}>{Math.round(t.LoggedHours * 10) / 10}/{t.EstimateHours}h</span><Avatar name={t.Assignee} size={18} /></div>
  </>;
}

/** Card link; a drag starts after 6 px, so a normal click still opens the ticket */
function DraggableCard({ t, hidden, justDragged, onPrio }: { t: Ticket; hidden: boolean; justDragged: React.MutableRefObject<number>; onPrio: (e: React.MouseEvent, t: Ticket) => void }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: t.TicketUUID });
  const flash = useChangeFlash<HTMLAnchorElement>(t.Status + t.Priority);
  const ref = (el: HTMLAnchorElement | null) => { setNodeRef(el); flash.current = el };
  return (
    // layout: when the status changes the card glides to its new column instead of jumping
    <m.a ref={ref} {...attributes} {...listeners} layout="position" layoutId={'card-' + t.TicketUUID} transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className={'card' + (hidden ? ' dragging' : '')} href={'#ticket/' + t.TicketId}
      onClick={e => { if (Date.now() - justDragged.current < 300) e.preventDefault() }}>
      <CardBody t={t} onPrio={onPrio} />
    </m.a>);
}
