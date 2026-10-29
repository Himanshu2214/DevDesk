// "?" overlay: all keyboard shortcuts in one place.
import { useEffect } from 'react';

const GROUPS: [string, [string, string][]][] = [
  ['Everywhere', [['Ctrl K', 'Search and commands'], ['C', 'New ticket'], ['?', 'This help'], ['Esc', 'Close dialog / back']]],
  ['Ticket list', [['J / ↓', 'Next ticket'], ['K / ↑', 'Previous ticket'], ['Enter', 'Open ticket'], ['S', 'Change status']]],
  ['Board', [['Drag', 'Move to another status'], ['Space', 'Pick up / drop the focused card'], ['← → ↑ ↓', 'Move the picked-up card']]],
  ['Ticket page', [['S', 'Change status'], ['P', 'Change priority'], ['J / K', 'Next / previous ticket'], ['Esc', 'Back to the list']]],
  ['Editor', [['Ctrl B / I / E', 'Bold / italic / code'], ['``` + Space', 'Code block'], ['- or 1. + Space', 'List'], ['Ctrl Enter', 'Send comment']]],
];

export function ShortcutHelp({ close }: { close(): void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className="modal on" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="dlg" style={{ width: 'min(640px,94vw)' }} role="dialog" aria-label="Keyboard shortcuts">
        <div className="top"><span>Keyboard shortcuts</span><span className="sp" /><button className="ib" aria-label="Close" onClick={close}>×</button></div>
        <div className="keys">{GROUPS.map(([g, rows]) => (
          <div key={g}><h5>{g}</h5>{rows.map(([k, d]) => <div className="krow" key={k}><span>{d}</span><span>{k.split(' / ').map((x, i) => <span key={i}>{i > 0 && ' / '}<kbd>{x}</kbd></span>)}</span></div>)}</div>))}
        </div>
      </div>
    </div>
  );
}
