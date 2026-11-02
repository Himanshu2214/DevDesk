// Bottom navigation on phones and narrow windows (after Animate UI's bottom navigation): the highlight glides to the
// tapped item, icons spring on press, the centre button creates a ticket.
import { m } from 'motion/react';
import { useStore, useTransports } from '../store';
import { inboxItems, useInboxExtras } from '../views/Inbox';
import { useDialogs } from './Dialogs';
import { Icon } from './Icons';
import CountBadge from './smoothui/count-badge';

const ITEMS: [string, string, string][] = [['home', 'Home', 'home'], ['list/active', 'Tickets', 'my'], ['', 'New', 'plus'], ['calendar', 'Calendar', 'cal'], ['inbox', 'Inbox', 'bell']];

export function BottomNav({ route }: { route: string }) {
  const s = useStore();
  const { openNew } = useDialogs();
  const failed = (useTransports().data ?? []).filter(x => x.Phase === 'FAILED');
  const extras = useInboxExtras();
  const unread = inboxItems(s, failed, extras).filter(n => !n.read).length;
  const at = (h: string) => route === h || (h === 'list/active' && /^(list|project|ticket)\b/.test(route));
  return (
    <nav className="bnav" aria-label="Main">
      {ITEMS.map(([h, label, icon]) => {
        if (!h) return <m.button key="new" className="bnav-new" aria-label="New ticket" onClick={() => openNew()} whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}><Icon name="plus" size={22} /></m.button>;
        const on = at(h);
        const glyph = <Icon name={icon} size={20} />;
        return <m.a key={h} href={'#' + h} className={'bnav-i' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
          {on && <m.span layoutId="bnav-active" className="bnav-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="bnav-ic">{h === 'inbox' && unread ? <CountBadge variant="count" count={unread} max={99} className="ni-badge">{glyph}</CountBadge> : glyph}</span>
          <span className="bnav-l">{label}</span></m.a>;
      })}
    </nav>
  );
}
