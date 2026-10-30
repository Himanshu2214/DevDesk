// Transport tracker: DEV → QA → PRD board, entered by hand in phase 2 (phase 3 reads E070 / TMS).
import { useState } from 'react';
import { api } from '../api';
import type { Status, Ticket, Transport } from '../api';
import { useStore, useTransports } from '../store';
import { fmtDate } from '../lib/format';
import { Dot, Icon, Spinner, StatusIcon } from '../components/Icons';
import { CharCount, Empty, go, HoldButton, Page, TabIndicator, useChangeFlash, useMenu } from '../components/ui';
import { Area, Line, SidePanel, trEdge, trState, usePickers } from '../components/p2';
import Input from '../components/smoothui/input';

const RC_ITEMS = [['0', 'RC 0 – success'], ['4', 'RC 4 – warnings'], ['8', 'RC 8 – errors'], ['12', 'RC 12 – aborted']].map(([value, label]) => ({ label, value }));

export function Transports({ route }: { route: string }) {
  const s = useStore();
  const q = useTransports();
  const list = q.data ?? [];
  const [proj, setProj] = useState('all');
  const sel = decodeURIComponent(route.split('/')[1] ?? '');
  const creating = sel === 'new';
  const tk = (uuid: string | null) => (uuid ? s.tickets.find(t => t.TicketUUID === uuid) : undefined);
  const inProj = (x: Transport, p: string) => p === 'all' || tk(x.TicketUUID)?.Project === p;
  const set = list.filter(x => inProj(x, proj));
  const dev = set.filter(x => !x.QaImportedAt && !x.PrdImportedAt).sort((a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? ''));
  const qa = set.filter(x => x.QaImportedAt && !x.PrdImportedAt).sort((a, b) => b.QaRc - a.QaRc || (b.QaImportedAt ?? '').localeCompare(a.QaImportedAt ?? ''));
  const prd = set.filter(x => x.PrdImportedAt).sort((a, b) => (b.PrdImportedAt ?? '').localeCompare(a.PrdImportedAt ?? ''));
  const failed = set.filter(x => x.Phase === 'FAILED').length, n = set.length || 1;
  const open = list.find(x => x.TrKorr === sel);

  const card = (x: Transport) => <TransportCard key={x.TransportUUID} x={x} t={tk(x.TicketUUID)} />;
  const phase = (title: string, color: string, items: Transport[], hint: string, limit = 99) =>
    <section className={'phase' + (items.length ? '' : ' is-empty')} style={{ '--c': color } as React.CSSProperties}>
      <header><i className="ph-dot" />{title}<span className="c num">{items.length}</span><span className="sp" /><span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{hint}</span></header>
      {items.slice(0, limit).map(card)}
      {!items.length && <div className="col-empty">Nothing here</div>}
      {items.length > limit && <div className="muted" style={{ padding: '6px 14px 12px' }}>+ {items.length - limit} older imports</div>}
    </section>;
  // successful imports only; failed ones (RC > 4) are counted once, as failed
  const qaOk = qa.filter(x => x.QaRc <= 4).length, prdOk = prd.filter(x => x.PrdRc <= 4).length;
  const seg = (count: number, color: string, label: string) => count > 0 &&
    <i style={{ width: `${count / n * 100}%`, background: color }} title={`${count} ${label}`} />;

  const bar2 = <>
    {[['all', 'All projects'], ...s.projects.map(p => [p.Project, p.Name])].map(([k, l]) =>
      <button key={k} className={'pill' + (proj === k ? ' on' : '')} onClick={() => setProj(k)}>{proj === k && <TabIndicator id="tr-proj" />}
        {k !== 'all' && <Dot color={s.project(k)?.Color ?? 'var(--muted)'} />}{l}<span className="c num">{list.filter(x => inProj(x, k)).length}</span></button>)}
    <span className="sp" />
    <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={() => go('transports/new')}><Icon name="plus" size={14} />New transport</button>
  </>;

  return (
    <Page crumb={<b>Transports</b>} bar2={bar2}>
      {q.isLoading ? <div className="trk" aria-busy="true"><div className="sk" style={{ height: 10, width: '100%', marginBottom: 18 }} />
        <div className="phases">{[0, 1, 2].map(i => <div key={i} className="phase" style={{ height: 180 }} />)}</div></div>
        : <div className="trk">
          <div className="trk-prog"><span className="t2" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{prdOk} of {set.length} in production</span>
            <div className="bar" role="img" aria-label={`${prdOk} in production, ${qaOk} in QA, ${failed} failed, ${dev.length} in development`}>
              {seg(prdOk, 'var(--ok)', 'in production')}{seg(qaOk, 'var(--st-test)', 'in QA')}{seg(failed, 'var(--danger)', 'failed')}{seg(dev.length, 'var(--faint)', 'in development')}</div>
            {failed > 0 && <span className="fail">{failed} failed</span>}</div>
          <div className="trk-legend">
            <span><i style={{ background: 'var(--ok)' }} />Production {prdOk}</span><span><i style={{ background: 'var(--st-test)' }} />QA {qaOk}</span>
            {failed > 0 && <span><i style={{ background: 'var(--danger)' }} />Failed {failed}</span>}<span><i style={{ background: 'var(--faint)' }} />Development {dev.length}</span></div>
          {!list.length && <Empty icon="truck" title="No transports tracked yet">Add one with <b>New transport</b>, or from a ticket (tab SAP &amp; files).</Empty>}
          <div className="phases">
            {phase('Development', 'var(--st-prog)', dev, 'not imported')}
            {phase('Quality (QA)', 'var(--st-test)', qa, 'waiting for PRD')}
            {phase('Production', 'var(--ok)', prd, 'imported', 12)}
          </div></div>}
      {open && <TransportPanel key={open.TransportUUID} x={open} all={list} close={() => go('transports')} />}
      {creating && <NewTransport close={() => go('transports')} />}
      {sel && !creating && !open && !q.isLoading && <SidePanel head={<b className="mono">{sel}</b>} close={() => go('transports')}><div className="empty">Transport {sel} is not tracked.</div></SidePanel>}
    </Page>
  );
}

/** Transport card; a failed import gets a red edge and badge (not a red card), and the card flashes when its phase or RC changes */
function TransportCard({ x, t }: { x: Transport; t?: Ticket }) {
  const d = x.PrdImportedAt ?? x.QaImportedAt ?? x.ReleasedOn ?? x.CreatedAt;
  const flash = useChangeFlash<HTMLDivElement>(`${x.Phase}|${x.QaRc}|${x.PrdRc}|${x.QaImportedAt}|${x.PrdImportedAt}`);
  return <div ref={flash} className={'trc' + (x.Phase === 'FAILED' ? ' failed' : '')} style={{ '--edge': trEdge(x) } as React.CSSProperties} role="button" tabIndex={0}
    aria-label={`Transport ${x.TrKorr}${x.Phase === 'FAILED' ? ', import failed' : ''}`}
    onClick={() => go('transports/' + x.TrKorr)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('transports/' + x.TrKorr) } }}>
    <div className="r1"><span className="mono" style={{ fontWeight: 600 }}>{x.TrKorr}</span>
      {x._Dependency.length > 0 && <span title={'Depends on ' + x._Dependency.map(d => d.DependsOn).join(', ')} style={{ color: 'var(--muted)', display: 'grid' }}><Icon name="link" size={14} /></span>}
      <span className="sp" />{trState(x)}</div>
    <div className="tt">{x.TrText || <span className="muted">No description</span>}</div>
    <div className="r3">{t ? <><StatusIcon status={t.Status as Status} /><span className="num">{t.TicketId}</span><span>·</span></> : <span>No ticket ·</span>}
      <span>{fmtDate(d)}</span>
      {x.TestEvidence && <span title="Test evidence recorded" style={{ color: 'var(--ok)', display: 'grid', marginLeft: 'auto' }}><Icon name="check" size={14} /></span>}</div>
  </div>;
}

function TransportPanel({ x, all, close }: { x: Transport; all: Transport[]; close(): void }) {
  const s = useStore();
  const menu = useMenu();
  const pick = usePickers();
  const t = x.TicketUUID ? s.tickets.find(k => k.TicketUUID === x.TicketUUID) : undefined;
  const upd = (p: Partial<Transport>) => s.run(() => api.updateRoot('Transport', x as never, p), { ok: 'Saved' });
  const imp = (sys: 'QA' | 'PRD') => (e: React.MouseEvent) => menu(e.currentTarget, RC_ITEMS,
    v => s.run(() => api.recordImport(x, sys, Number(v)), { ok: `${x.TrKorr} imported into ${sys} with RC ${v}` }), false);
  const when = (at: string | null, rc: number) => at ? <>{fmtDate(at)} · RC {rc}{rc > 4 && <span className="fail" style={{ marginLeft: 6 }}>failed</span>}</> : <span className="muted">not yet</span>;
  async function remove() {
    if (await s.run(() => api.deleteRoot('Transport', x as never), { ok: `${x.TrKorr} removed` })) close();
  }
  // a dependency must be in the target system first
  const blockers = x._Dependency.map(d => ({ d, tr: all.find(a => a.TrKorr === d.DependsOn) }))
    .filter(({ tr }) => !x.PrdImportedAt && (!tr || !tr.PrdImportedAt) && (x.QaImportedAt ? true : !tr?.QaImportedAt));
  return (
    <SidePanel close={close} head={<><Icon name="truck" /><b className="mono">{x.TrKorr}</b><span className="tag">{x.TrKind === 'W' ? 'Customizing' : 'Workbench'}</span></>}>
      <Line value={x.TrText} placeholder="Description of the request" onSave={v => upd({ TrText: v })} style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }} />
      <div className="kv">
        <span>Ticket</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          {t ? <a href={'#ticket/' + t.TicketId} style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}><StatusIcon status={t.Status as Status} /><span style={{ whiteSpace: 'nowrap' }}>{t.TicketId}</span>
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.Title}</span></a> : <span className="muted">none</span>}
          <button className="ib" title="Change ticket" onClick={e => pick.ticket(e.currentTarget, s.tickets, k => upd({ TicketUUID: k.TicketUUID }))}><Icon name="edit" size={13} /></button></span>
        <span>Owner</span><span>{x.TrOwner}</span>
        <span>Created</span><span>{fmtDate(x.CreatedAt)}</span>
        <span>Released</span><span>{x.ReleasedOn ? fmtDate(x.ReleasedOn) : <><span className="muted">modifiable</span>
          <button className="btn" style={{ marginLeft: 8, height: 24 }} onClick={() => s.run(() => api.markReleased(x), { ok: `${x.TrKorr} marked as released` })}>Mark released</button></>}</span>
        <span>QA import</span><span>{when(x.QaImportedAt, x.QaRc)}<button className="btn" style={{ marginLeft: 8, height: 24 }} onClick={imp('QA')}>Record…</button></span>
        <span>PRD import</span><span>{when(x.PrdImportedAt, x.PrdRc)}<button className="btn" style={{ marginLeft: 8, height: 24 }} onClick={imp('PRD')}>Record…</button></span>
      </div>

      <h5>Depends on <span className="muted" style={{ fontWeight: 400 }}>– import these first</span></h5>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {x._Dependency.map(d => { const tr = all.find(a => a.TrKorr === d.DependsOn);
          return <span key={d.DepUUID} className="fchip" title={d.NoteText}>
            {tr ? <a className="mono" href={'#transports/' + tr.TrKorr}>{d.DependsOn}</a> : <span className="mono">{d.DependsOn}</span>}
            <span className="muted" style={{ fontSize: 11 }}>{tr ? (tr.PrdImportedAt ? 'PRD' : tr.QaImportedAt ? 'QA' : 'DEV') : 'not tracked'}</span>
            <button title="Remove" onClick={() => s.run(() => api.deleteSub('TransportDependency', d as never))}>×</button></span> })}
        <Line value="" placeholder="Add request, e.g. S4DK900123" mono upper clear boxed style={{ width: 230 }}
          onSave={v => v && s.run(() => api.createSub('Transport', x as never, { DependsOn: v }), { ok: `Depends on ${v}` })} />
      </div>
      {blockers.length > 0 && <div className="warnbox" style={{ marginBottom: 14 }}>
        Import first: {blockers.map(b => b.d.DependsOn).join(', ')} {blockers.some(b => !b.tr) && '(not tracked here, check in STMS)'}</div>}

      <h5>Test evidence</h5><Area value={x.TestEvidence} placeholder="What was tested, by whom, link to screenshots" onSave={v => upd({ TestEvidence: v })} />
      <h5>Deployment notes</h5><Area value={x.DeployNotes} placeholder="Import window, manual steps, post-processing" onSave={v => upd({ DeployNotes: v })} />
      <h5>Rollback</h5><Area value={x.RollbackNotes} placeholder="How to undo this change" onSave={v => upd({ RollbackNotes: v })} />
      <HoldButton className="btn danger-btn" label="Remove from tracker" onConfirm={remove}><Icon name="trash" size={14} />Remove from tracker</HoldButton>
    </SidePanel>
  );
}

function NewTransport({ close, ticketUUID }: { close(): void; ticketUUID?: string }) {
  const s = useStore();
  const pick = usePickers();
  const [d, setD] = useState({ TrKorr: '', TrText: '', TrKind: 'K', TicketUUID: ticketUUID ?? '' });
  const [busy, setBusy] = useState(false);
  const t = s.tickets.find(k => k.TicketUUID === d.TicketUUID);
  async function create() {
    if (!d.TrKorr.trim() || busy) return;
    setBusy(true);
    const data: Record<string, unknown> = { TrKorr: d.TrKorr.trim().toUpperCase(), TrText: d.TrText || (t ? `${t.TicketId} ${t.Title}`.slice(0, 60) : ''), TrKind: d.TrKind };
    if (d.TicketUUID) data.TicketUUID = d.TicketUUID;
    const ok = await s.run(() => api.createRoot('Transport', data), { ok: `${data.TrKorr} added` });
    setBusy(false);
    if (ok) go('transports/' + data.TrKorr);
  }
  return (
    <SidePanel close={close} head={<><Icon name="truck" /><b>New transport</b></>}>
      <div className="form" style={{ padding: 0 }}>
        <div className="full"><label htmlFor="trk">Transport request</label>
          <Input id="trk" className="ss-input mono" autoFocus placeholder="S4DK900123" value={d.TrKorr} onChange={e => setD({ ...d, TrKorr: e.target.value.toUpperCase() })}
            onKeyDown={e => { if (e.key === 'Enter') create() }} /></div>
        <div className="full"><label htmlFor="trt">Description</label>
          <CharCount value={d.TrText} max={60} />
          <Input id="trt" className="ss-input" placeholder={t ? `${t.TicketId} ${t.Title}` : 'As in SE09'} value={d.TrText} maxLength={60} onChange={e => setD({ ...d, TrText: e.target.value })} /></div>
        <div><label>Kind</label><div className="seg">{[['K', 'Workbench'], ['W', 'Customizing']].map(([k, l]) =>
          <button key={k} className={d.TrKind === k ? 'on' : ''} onClick={() => setD({ ...d, TrKind: k })}>{l}</button>)}</div></div>
        <div><label>Ticket</label><button className="pill" style={{ width: '100%', justifyContent: 'flex-start', overflow: 'hidden' }}
          onClick={e => pick.ticket(e.currentTarget, s.tickets.filter(k => k.Status !== 'DONE'), k => setD({ ...d, TicketUUID: k.TicketUUID }))}>
          {t ? <><StatusIcon status={t.Status as Status} />{t.TicketId}</> : <span className="muted">Link a ticket…</span>}</button></div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Phase 2 tracks requests by hand: record the release and the imports with their return code.
        Phase 3 reads them from E070 and the TMS import log.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={!d.TrKorr.trim() || busy} aria-busy={busy} onClick={create}>{busy && <Spinner />}Add transport</button></div>
    </SidePanel>
  );
}
