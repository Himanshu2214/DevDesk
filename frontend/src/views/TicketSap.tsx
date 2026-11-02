// Ticket tab "SAP & files": changed objects, transports, attachments and knowledge articles of one ticket.
import { lazy, Suspense, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { Attachment, ChangeKind, Ticket } from '../api';
import { useArticles, useObjects, useStore, useTransports } from '../store';
import { ago } from '../lib/format';
import { Icon } from '../components/Icons';
import { go, useMenu } from '../components/ui';
import { attachFiles, fmtBytes, Line, ObjType, saveBlob, trEdge, trState, usePickers } from '../components/p2';
import { ConfirmButton } from '../components/ConfirmButton';
import { fileUrl, ImageViewer, isImage, opensInTab, Thumb } from '../components/FilePreview';

// the whiteboard (Excalidraw, ~2 MB) loads only when a drawing is opened
const Whiteboard = lazy(() => import('../components/Whiteboard'));

const KINDS: [ChangeKind, string][] = [['CHANGE', 'changed'], ['NEW', 'new'], ['CHECK', 'checked only']];

/** readOnly: the ticket was shared with you to view or comment – links, transports and files are shown, not changed */
export function TicketSap({ t, readOnly }: { t: Ticket; readOnly?: boolean }) {
  const s = useStore();
  const menu = useMenu();
  const pick = usePickers();
  const objects = useObjects().data ?? [];
  const transports = useTransports().data ?? [];
  const articles = useArticles().data ?? [];
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uuids = [t.TicketUUID];
  const links = t._ObjectLink ?? [];
  const files = t._Attachment ?? [];
  const trs = transports.filter(x => x.TicketUUID === t.TicketUUID);
  const kbs = articles.filter(a => a._Link.some(l => l.TicketUUID === t.TicketUUID));

  const upload = (list: FileList | null) => attachFiles(s, t, Array.from(list ?? []));
  // whiteboard: a new drawing, or an existing .excalidraw attachment (its .png preview is replaced together with it)
  const [board, setBoard] = useState<{ name: string; scene: string | null; old: Attachment[] } | null>(null);
  const openBoard = async (f?: Attachment) => {
    if (!f) return setBoard({ name: `${t.TicketId} drawing`, scene: null, old: [] });
    try {
      const scene = await (await api.downloadAttachment(f)).text();
      const base = f.FileName.replace(/.excalidraw$/i, '');
      setBoard({ name: base, scene, old: [f, ...files.filter(x => x.FileName === base + '.png')] });
    } catch (e) { s.toast((e as Error).message, true) }
  };
  const saveBoard = async (newFiles: File[]) => {
    for (const f of board?.old ?? []) await s.run(() => api.deleteChild('Attachment', f as never), { uuids });
    await attachFiles(s, t, newFiles);
  };
  async function download(a: Attachment) {
    try { saveBlob(await api.downloadAttachment(a), a.FileName) } catch (e) { s.toast((e as Error).message, true) }
  }
  // images open in the viewer, PDFs and text in a new tab; anything else downloads
  const images = files.filter(isImage);
  const [viewing, setViewing] = useState<number | null>(null);
  async function openFile(a: Attachment) {
    if (isImage(a)) return setViewing(images.indexOf(a));
    if (!opensInTab(a)) return download(a);
    const tab = window.open('', '_blank');                // opened right away, so the browser does not block it as a pop-up
    try { const url = await fileUrl(a); if (tab) tab.location.href = url; else download(a) } catch (e) { tab?.close(); s.toast((e as Error).message, true) }
  }
  async function writeArticle() {
    let id = '';
    const ok = await s.run(async () => {
      id = await api.createRoot('Article', { ArticleType: 'FIX', Title: t.Title.slice(0, 120) });
      await api.createSub('Article', { ArticleUUID: id }, { TicketUUID: t.TicketUUID });
    }, { ok: 'Article created and linked' });
    if (ok) go('kb/' + id);
  }

  return <>
    <div className="tp-sec" style={{ marginTop: 6 }}><h4><Icon name="cube" size={14} />Objects<span className="c">{links.length}</span><span className="sp" />
      {!readOnly && <a href="#objects/new" className="muted" style={{ fontWeight: 400, fontSize: 12 }}>Register new object</a>}</h4>
      <div className="sub">{links.map(l => { const o = objects.find(x => x.ObjectUUID === l.ObjectUUID);
        return <div className="it dep" key={l.LinkUUID}>{o ? <ObjType type={o.ObjectType} small /> : <span />}
          {o ? <a className="mono" href={'#objects/' + o.ObjectUUID} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.ObjectName}
            <span className="muted" style={{ fontFamily: 'inherit', marginLeft: 8 }}>{o.Description}</span></a> : <span className="muted">(removed from the registry)</span>}
          <button className="tag" style={{ border: 0, cursor: readOnly ? 'default' : 'pointer' }} title={readOnly ? undefined : 'Change kind'} disabled={readOnly} onClick={e => menu(e.currentTarget, KINDS.map(([v, label]) => ({ label, value: v, checked: l.ChangeKind === v })),
            v => s.run(() => api.updateChild('ObjectLink', l as never, { ChangeKind: v }), { uuids }), false)}>{KINDS.find(k => k[0] === l.ChangeKind)?.[1] ?? l.ChangeKind}</button>
          {!readOnly && <button className="ib" style={{ width: 22, height: 22 }} title="Remove link" onClick={() => s.run(() => api.deleteChild('ObjectLink', l as never), { uuids })}><Icon name="x" size={12} /></button>}</div> })}
        {!readOnly && <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          onClick={e => pick.object(e.currentTarget, objects.filter(o => !links.some(l => l.ObjectUUID === o.ObjectUUID)),
            o => s.run(() => api.createChild(t, '_ObjectLink', { ObjectUUID: o.ObjectUUID, ChangeKind: 'CHANGE' }), { uuids, ok: `${o.ObjectName} linked` }))}>
          <Icon name="plus" size={14} />Link an object from the registry…</button>}</div></div>

    <div className="tp-sec"><h4><Icon name="truck" size={14} />Transports<span className="c">{trs.length}</span></h4>
      <div className="sub">{trs.map(x => <a key={x.TransportUUID} className="it" href={'#transports/' + x.TrKorr} style={{ boxShadow: `inset 3px 0 0 ${trEdge(x)}` }}>
        <span className="mono" style={{ fontWeight: 600 }}>{x.TrKorr}</span><span className="t2" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{x.TrText}</span>
        <span className="sp" />{trState(x)}</a>)}
        {!readOnly && <div className="add"><Icon name="plus" size={14} />
          <Line value="" mono upper clear boxed placeholder="Add transport request, e.g. S4DK900123, and press Enter"
            onSave={v => v && s.run(() => api.createRoot('Transport', { TrKorr: v, TrText: `${t.TicketId} ${t.Title}`.slice(0, 60), TicketUUID: t.TicketUUID }), { ok: `${v} added to the tracker` })} /></div>}</div></div>

    <div className="tp-sec"><h4><Icon name="file" size={14} />Attachments<span className="c">{files.length}</span></h4>
      {images.length > 0 && <div className="thumbs">{images.map((f, i) => <Thumb key={f.AttUUID} a={f} onOpen={() => setViewing(i)} />)}</div>}
      <div className="files" style={{ marginTop: 6 }}>
        {files.map(f => <div className="file" key={f.AttUUID}><Icon name={isImage(f) ? 'eye' : 'file'} size={14} style={{ color: 'var(--muted)' }} />
          <a onClick={() => openFile(f)} title={isImage(f) ? 'View' : opensInTab(f) ? 'Open in a new tab' : `Download · ${f.MimeType}`}>{f.FileName}</a>
          {(isImage(f) || opensInTab(f)) && <button className="ib file-dl" title={'Download ' + f.FileName} aria-label={'Download ' + f.FileName} onClick={() => download(f)}><Icon name="download" size={13} /></button>}
          {/.excalidraw$/i.test(f.FileName) && !readOnly && <button className="btn wb-open" onClick={() => openBoard(f)}><Icon name="edit" size={12} />Open</button>}<span className="muted num" style={{ fontSize: 12 }}>{fmtBytes(f.FileSize)} · {ago(f.CreatedAt)}</span>
          {!readOnly && <ConfirmButton className="file-x" label={'Delete ' + f.FileName} onConfirm={() => s.run(() => api.deleteChild('Attachment', f as never), { uuids })}>×</ConfirmButton>}</div>)}
        {!readOnly && <>
          <div className={'dropz' + (drag ? ' on' : '')} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
            onClick={() => fileInput.current?.click()} onKeyDown={e => { if (e.key === 'Enter') fileInput.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}>
            <Icon name="upload" size={14} /> Drop files, click, or paste a screenshot (Ctrl+V) – max. 10 MB</div>
          <input ref={fileInput} type="file" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <button className="btn wb-new" onClick={() => openBoard()}><Icon name="edit" size={14} />Draw on a whiteboard</button>
        </>}
      </div></div>
    {viewing !== null && images.length > 0 && <ImageViewer images={images} start={Math.max(0, viewing)} onClose={() => setViewing(null)} onDownload={download} />}
    {/* on <body>: the page transition wrapper would otherwise trap the full-screen layer inside the page panel */}
    {board && createPortal(<Suspense fallback={<div className="wb wb-loading"><span className="muted">Loading the whiteboard…</span></div>}>
      <Whiteboard name={board.name} scene={board.scene} onSave={saveBoard} onClose={() => setBoard(null)} /></Suspense>, document.body)}

    <div className="tp-sec"><h4><Icon name="book" size={14} />Knowledge<span className="c">{kbs.length}</span></h4>
      <div className="sub">{kbs.map(a => <a className="it" key={a.ArticleUUID} href={'#kb/' + a.ArticleUUID}><Icon name="book" size={14} /><span>{a.Title}</span><span className="sp" />
        <span className="tag">{s.text('KBTYPE', a.ArticleType)}</span></a>)}
        {!readOnly && <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }} onClick={writeArticle}>
          <Icon name="plus" size={14} />Write an error &amp; fix article for this ticket</button>}</div></div>
  </>;
}
