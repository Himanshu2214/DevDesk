// Excalidraw whiteboard (MIT), loaded only when opened. A drawing is saved as two ticket attachments: the editable
// "<name>.excalidraw" scene and a "<name>.png" preview – so it works with every backend (SAP, standalone, sample data)
// without new tables. Opening a .excalidraw attachment edits it; saving replaces both files.
import { useEffect, useRef, useState } from 'react';
import { Excalidraw, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { shownMode } from '../lib/theme';
import { Icon, Spinner } from './Icons';

type ExcalidrawApi = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['excalidrawAPI']>>[0];

export default function Whiteboard({ name, scene, onSave, onClose }: {
  name: string;
  /** an existing .excalidraw file's text, or null for a new drawing */
  scene: string | null;
  onSave(files: File[], name: string): Promise<void>;
  onClose(): void;
}) {
  const ref = useRef<ExcalidrawApi | null>(null);
  const [title, setTitle] = useState(name);
  const [busy, setBusy] = useState(false);
  const initial = (() => { try { return scene ? JSON.parse(scene) : null } catch { return null } })();

  useEffect(() => {
    // Esc closes it unless an Excalidraw dialog is open (app shortcuts pause while .wb is on screen – see isTyping)
    // closed after the key event has finished, so the page's own Esc handler still sees the whiteboard and ignores the key
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !document.querySelector('.excalidraw .Modal')) setTimeout(onClose, 0) };
    addEventListener('keydown', esc, true); return () => removeEventListener('keydown', esc, true);
  }, [busy, onClose]);

  async function save() {
    const x = ref.current;
    if (!x || busy) return;
    const elements = x.getSceneElements();
    if (!elements.length) return onClose();
    setBusy(true);
    try {
      const appState = x.getAppState(), files = x.getFiles();
      const base = (title.trim() || 'Drawing').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
      const json = serializeAsJSON(elements, appState, files, 'local');
      const png = await exportToBlob({ elements, appState: { ...appState, exportBackground: true, exportWithDarkMode: false }, files, mimeType: 'image/png', exportPadding: 16 });
      await onSave([new File([json], base + '.excalidraw', { type: 'application/json' }), new File([png], base + '.png', { type: 'image/png' })], base);
      onClose();
    } finally { setBusy(false) }
  }

  return (
    <div className="wb" role="dialog" aria-modal="true" aria-label="Whiteboard">
      <div className="wb-top">
        <Icon name="edit" size={15} />
        <input className="wb-name" value={title} onChange={e => setTitle(e.target.value)} aria-label="Drawing name" maxLength={80} />
        <span className="sp" />
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy} aria-busy={busy}>{busy && <Spinner />}Save to ticket</button>
      </div>
      <div className="wb-canvas">
        <Excalidraw excalidrawAPI={api => { ref.current = api }} theme={shownMode()} initialData={initial ? { elements: initial.elements, appState: { ...initial.appState, collaborators: new Map() }, files: initial.files } : undefined}
          UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false } }} />
      </div>
    </div>
  );
}
