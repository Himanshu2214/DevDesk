// Attachments that can be looked at in place: image thumbnails on the ticket and a full-size viewer (arrow keys move
// between images, Esc closes) – instead of downloading. PDFs and text open in a new tab. Files are fetched once
// per session and kept as object URLs.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { Attachment } from '../api';
import { Icon, Spinner } from './Icons';

export const isImage = (a: Attachment) => /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(a.MimeType) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.FileName);
export const opensInTab = (a: Attachment) => /^(application\/pdf|text\/plain)$/i.test(a.MimeType) || /\.(pdf|txt|log)$/i.test(a.FileName);

const urls = new Map<string, Promise<string>>();
/** an object URL for the attachment's content (shared by thumbnail and viewer, fetched once) */
export function fileUrl(a: Attachment): Promise<string> {
  let p = urls.get(a.AttUUID);
  if (!p) {
    p = api.downloadAttachment(a).then(b => URL.createObjectURL(a.MimeType && b.type !== a.MimeType ? new Blob([b], { type: a.MimeType }) : b));
    p.catch(() => urls.delete(a.AttUUID));
    urls.set(a.AttUUID, p);
  }
  return p;
}
function useFileUrl(a: Attachment) {
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { let on = true; fileUrl(a).then(u => on && setUrl(u), () => on && setFailed(true)); return () => { on = false } }, [a.AttUUID]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { url, failed };
}

/** small preview tile; clicking opens the viewer */
export function Thumb({ a, onOpen }: { a: Attachment; onOpen(): void }) {
  const { url, failed } = useFileUrl(a);
  return <button type="button" className="thumb" onClick={onOpen} title={`View ${a.FileName}`} aria-label={`View ${a.FileName}`}>
    {url ? <img src={url} alt="" loading="lazy" /> : failed ? <Icon name="file" size={18} /> : <Spinner />}</button>;
}

/** a row of image thumbnails with its own viewer – e.g. pasted screenshots on the ticket's Overview */
export function ImageStrip({ files, onDownload }: { files: Attachment[]; onDownload(a: Attachment): void }) {
  const images = files.filter(isImage);
  const [viewing, setViewing] = useState<number | null>(null);
  if (!images.length) return null;
  return <>
    <div className="thumbs">{images.map((f, i) => <Thumb key={f.AttUUID} a={f} onOpen={() => setViewing(i)} />)}</div>
    {viewing !== null && <ImageViewer images={images} start={viewing} onClose={() => setViewing(null)} onDownload={onDownload} />}
  </>;
}

/** full-size image viewer over the page */
export function ImageViewer({ images, start, onClose, onDownload }: { images: Attachment[]; start: number; onClose(): void; onDownload(a: Attachment): void }) {
  const [i, setI] = useState(start);
  const a = images[Math.min(i, images.length - 1)];
  const { url, failed } = useFileUrl(a);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowRight') setI(x => Math.min(images.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1));
    };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true);
  }, [images.length, onClose]);
  if (!a) return null;
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={a.FileName} onClick={onClose}>
      <div className="viewer-top" onClick={e => e.stopPropagation()}>
        <span className="viewer-name">{a.FileName}</span>{images.length > 1 && <span className="muted num">{i + 1} / {images.length}</span>}<span className="sp" />
        <button className="btn" onClick={() => onDownload(a)}><Icon name="download" size={14} />Download</button>
        <button className="ib" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="viewer-stage">
        {url ? <img src={url} alt={a.FileName} onClick={e => e.stopPropagation()} /> : failed ? <p className="muted">The image could not be loaded.</p> : <Spinner size={22} />}
      </div>
      {images.length > 1 && <>
        <button className="viewer-nav prev" disabled={i === 0} onClick={e => { e.stopPropagation(); setI(x => x - 1) }} aria-label="Previous image"><Icon name="up" /></button>
        <button className="viewer-nav next" disabled={i === images.length - 1} onClick={e => { e.stopPropagation(); setI(x => x + 1) }} aria-label="Next image"><Icon name="down" /></button>
      </>}
    </div>, document.body);
}
