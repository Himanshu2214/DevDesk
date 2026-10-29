// Ticket tab "SAP & files": changed objects, transports, attachments and knowledge articles of one ticket.
import { useRef, useState } from 'react';
import { api } from '../api';
import type { Attachment, ChangeKind, Ticket } from '../api';
import { useArticles, useObjects, useStore, useTransports } from '../store';
import { ago } from '../lib/format';
import { Icon } from '../components/Icons';
import { go, useMenu } from '../components/ui';
import { fmtBytes, Line, ObjType, readBase64, saveBlob, trEdge, trState, usePickers } from '../components/p2';

const MAX_BYTES = 10 * 1024 * 1024;
const KINDS: [ChangeKind, string][] = [['CHANGE', 'changed'], ['NEW', 'new'], ['CHECK', 'checked only']];

export function TicketSap({ t }: { t: Ticket }) {
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

  async function upload(list: FileList | null) {
    for (const f of Array.from(list ?? [])) {
      if (f.size > MAX_BYTES) { s.toast(`${f.name} is larger than 10 MB`, true); continue }
      const Content = await readBase64(f);
      await s.run(() => api.createChild(t, '_Attachment', { FileName: f.name, MimeType: f.type || 'application/octet-stream', Content }), { uuids, ok: `${f.name} attached` });
    }
  }
  async function download(a: Attachment) {
    try { saveBlob(await api.downloadAttachment(a), a.FileName) } catch (e) { s.toast((e as Error).message, true) }
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
      <a href="#objects/new" className="muted" style={{ fontWeight: 400, fontSize: 12 }}>Register new object</a></h4>
      <div className="sub">{links.map(l => { const o = objects.find(x => x.ObjectUUID === l.ObjectUUID);
        return <div className="it dep" key={l.LinkUUID}>{o ? <ObjType type={o.ObjectType} small /> : <span />}
          {o ? <a className="mono" href={'#objects/' + o.ObjectUUID} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.ObjectName}
            <span className="muted" style={{ fontFamily: 'inherit', marginLeft: 8 }}>{o.Description}</span></a> : <span className="muted">(removed from the registry)</span>}
          <button className="tag" style={{ border: 0, cursor: 'pointer' }} title="Change kind" onClick={e => menu(e.currentTarget, KINDS.map(([v, label]) => ({ label, value: v, checked: l.ChangeKind === v })),
            v => s.run(() => api.updateChild('ObjectLink', l as never, { ChangeKind: v }), { uuids }), false)}>{KINDS.find(k => k[0] === l.ChangeKind)?.[1] ?? l.ChangeKind}</button>
          <button className="ib" style={{ width: 22, height: 22 }} title="Remove link" onClick={() => s.run(() => api.deleteChild('ObjectLink', l as never), { uuids })}><Icon name="x" size={12} /></button></div> })}
        <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          onClick={e => pick.object(e.currentTarget, objects.filter(o => !links.some(l => l.ObjectUUID === o.ObjectUUID)),
            o => s.run(() => api.createChild(t, '_ObjectLink', { ObjectUUID: o.ObjectUUID, ChangeKind: 'CHANGE' }), { uuids, ok: `${o.ObjectName} linked` }))}>
          <Icon name="plus" size={14} />Link an object from the registry…</button></div></div>

    <div className="tp-sec"><h4><Icon name="truck" size={14} />Transports<span className="c">{trs.length}</span></h4>
      <div className="sub">{trs.map(x => <a key={x.TransportUUID} className="it" href={'#transports/' + x.TrKorr} style={{ boxShadow: `inset 3px 0 0 ${trEdge(x)}` }}>
        <span className="mono" style={{ fontWeight: 600 }}>{x.TrKorr}</span><span className="t2" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{x.TrText}</span>
        <span className="sp" />{trState(x)}</a>)}
        <div className="add"><Icon name="plus" size={14} />
          <Line value="" mono upper clear boxed placeholder="Add transport request, e.g. S4DK900123, and press Enter"
            onSave={v => v && s.run(() => api.createRoot('Transport', { TrKorr: v, TrText: `${t.TicketId} ${t.Title}`.slice(0, 60), TicketUUID: t.TicketUUID }), { ok: `${v} added to the tracker` })} /></div></div></div>

    <div className="tp-sec"><h4><Icon name="file" size={14} />Attachments<span className="c">{files.length}</span></h4>
      <div className="files" style={{ marginTop: 6 }}>
        {files.map(f => <div className="file" key={f.AttUUID}><Icon name="file" size={14} style={{ color: 'var(--muted)' }} />
          <a onClick={() => download(f)} title={`Download · ${f.MimeType}`}>{f.FileName}</a><span className="muted num" style={{ fontSize: 12 }}>{fmtBytes(f.FileSize)} · {ago(f.CreatedAt)}</span>
          <button title="Delete attachment" aria-label={'Delete ' + f.FileName} onClick={() => { if (confirm(`Delete ${f.FileName}?`)) s.run(() => api.deleteChild('Attachment', f as never), { uuids }) }}>×</button></div>)}
        <div className={'dropz' + (drag ? ' on' : '')} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => fileInput.current?.click()} onKeyDown={e => { if (e.key === 'Enter') fileInput.current?.click() }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}>
          <Icon name="upload" size={14} /> Drop files or click to attach (max. 10 MB)</div>
        <input ref={fileInput} type="file" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
      </div></div>

    <div className="tp-sec"><h4><Icon name="book" size={14} />Knowledge<span className="c">{kbs.length}</span></h4>
      <div className="sub">{kbs.map(a => <a className="it" key={a.ArticleUUID} href={'#kb/' + a.ArticleUUID}><Icon name="book" size={14} /><span>{a.Title}</span><span className="sp" />
        <span className="tag">{s.text('KBTYPE', a.ArticleType)}</span></a>)}
        <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }} onClick={writeArticle}>
          <Icon name="plus" size={14} />Write an error &amp; fix article for this ticket</button></div></div>
  </>;
}
