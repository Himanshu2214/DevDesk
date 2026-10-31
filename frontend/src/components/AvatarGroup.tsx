// Avatar group (after Animate UI's avatar group): overlapping avatars of the people on a shared project; the one under the
// pointer springs up and shows its name. Shows "+N" past the limit.
import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Avatar } from './ui';

export interface Person { name: string; email?: string; photo?: string; owner?: boolean }

export function AvatarGroup({ people, max = 5, size = 28 }: { people: Person[]; max?: number; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = people.slice(0, max), rest = people.length - shown.length;
  return (
    <div className="avg" role="list" aria-label={`${people.length} people on this project`} onPointerLeave={() => setHover(null)}>
      {shown.map((p, i) => (
        <m.span key={p.email ?? p.name} role="listitem" className="avg-i" style={{ zIndex: hover === i ? 20 : shown.length - i, marginLeft: i ? -size * 0.32 : 0 }}
          onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={p.name + (p.owner ? ' (owner)' : '')}
          animate={{ y: hover === i ? -5 : 0, scale: hover === i ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
          <Avatar name={p.name} photo={p.photo || undefined} size={size} />
          <AnimatePresence>{hover === i && (
            <m.span className="avg-tip" role="tooltip" initial={{ opacity: 0, y: 4, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}>{p.name}{p.owner && <small> · owner</small>}</m.span>)}</AnimatePresence>
        </m.span>))}
      {rest > 0 && <span className="avg-more" style={{ width: size, height: size, marginLeft: -size * 0.32 }} title={people.slice(max).map(p => p.name).join(', ')}>+{rest}</span>}
    </div>
  );
}
