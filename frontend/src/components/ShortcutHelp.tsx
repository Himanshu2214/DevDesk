// "?" overlay: all keyboard shortcuts in one place.
import { Modal } from './Dialogs';
import { Icon } from './Icons';

const GROUPS: [string, [string, string][]][] = [
  ['Everywhere', [['Ctrl K', 'Search and commands'], ['C', 'New ticket'], ['?', 'This help'], ['Esc', 'Close dialog / back']]],
  ['Ticket list', [['J / ↓', 'Next ticket'], ['K / ↑', 'Previous ticket'], ['Enter', 'Open ticket'], ['S', 'Change status']]],
  ['Board', [['Drag', 'Move to another status'], ['Space', 'Pick up / drop the focused card'], ['← → ↑ ↓', 'Move the picked-up card']]],
  ['Ticket page', [['S', 'Change status'], ['P', 'Change priority'], ['J / K', 'Next / previous ticket'], ['Esc', 'Back to the list']]],
  ['Editor', [['Ctrl B / I / E', 'Bold / italic / code'], ['``` + Space', 'Code block'], ['- or 1. + Space', 'List'], ['Ctrl Enter', 'Send comment']]],
];

export function ShortcutHelp({ close }: { close(): void }) {
  return (
    <Modal close={close} width={640} label="Keyboard shortcuts">
        <div className="top"><span>Keyboard shortcuts</span><span className="sp" /><button className="ib" aria-label="Close" onClick={close}><Icon name="x" /></button></div>
        <div className="keys">{GROUPS.map(([g, rows]) => (
          <div key={g}><h5>{g}</h5>{rows.map(([k, d]) => <div className="krow" key={k}><span>{d}</span><span>{k.split(' / ').map((x, i) => <span key={i}>{i > 0 && ' / '}<kbd>{x}</kbd></span>)}</span></div>)}</div>))}
        </div>
    </Modal>
  );
}
