// Technical object registry with dependencies and the impact map ("what breaks if I change this?").
import { useMemo, useState } from 'react';
import { api } from '../api';
import type { Status, TechObject } from '../api';
import { useArticles, useObjectLinks, useObjects, useStore, useTransports } from '../store';
import { fmtDate } from '../lib/format';
import { Dot, Icon, StatusIcon } from '../components/Icons';
import { go, Page, ProjectChip, useMenu } from '../components/ui';
import { Area, depEdges, ImpactMap, Line, ObjType, related, SidePanel, usePickers } from '../components/p2';

export function Objects({ route }: { route: string }) {
  const s = useStore();
  const q = useObjects();
  const objects = useMemo(() => q.data ?? [], [q.data]);
  const links = useObjectLinks().data ?? [];
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const sel = route.split('/')[1] ?? '';
  const creating = sel === 'new';
  const qq = query.trim().toLowerCase();
  const list = objects.filter(o => (type === 'all' || o.ObjectType === type)
    && (!qq || `${o.ObjectName} ${o.Description} ${o.PackageName}`.toLowerCase().includes(qq)));
  const o = objects.find(x => x.ObjectUUID === sel) ?? (creating ? undefined : list[0]);
  const types = [...new Set(objects.map(x => x.ObjectType))].sort();
  const groups = [...s.projects.map(p => [p.Project, p.Name, p.Color]), ['', 'No project', 'var(--muted)']]
    .map(([k, name, color]) => ({ k, name, color, rows: list.filter(x => (x.Project || '') === k) })).filter(g => g.rows.length);

  const bar2 = <>
    <label className="pill" style={{ width: 280, cursor: 'text' }}><Icon name="search" size={14} />
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, description, package" aria-label="Search objects"
        style={{ border: 0, background: 'transparent', outline: 'none', width: '100%' }} /></label>
    <select className="pill" value={type} onChange={e => setType(e.target.value)} aria-label="Object type">
      <option value="all">All types</option>{types.map(t => <option key={t} value={t}>{t} · {s.text('OBJTYPE', t)}</option>)}</select>
    <span className="sp" /><span className="muted num hide-narrow">{list.length} objects</span>
    <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={() => go('objects/new')}><Icon name="plus" size={14} />Register object</button>
  </>;

  return (
    <Page crumb={<><b>Objects</b><span className="muted" style={{ fontWeight: 400 }}>technical object registry</span></>} bar2={bar2}>
      {q.isLoading ? <div style={{ padding: 16 }}>{[...Array(8)].map((_, i) => <div key={i} className="sk" style={{ height: 14, width: `${50 + (i * 13) % 40}%`, margin: '14px 0' }} />)}</div>
        : <div className="objs">
          <div className="ol">
            {groups.map(g => <div key={g.k}>
              <div className="grp" style={{ paddingLeft: 16 }}><Dot color={g.color} />{g.name}<span className="c">{g.rows.length}</span></div>
              {g.rows.map(x => { const n = links.filter(l => l.ObjectUUID === x.ObjectUUID).length;
                return <a key={x.ObjectUUID} href={'#objects/' + x.ObjectUUID} className={'orow' + (x.ObjectUUID === o?.ObjectUUID ? ' sel' : '')} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <ObjType type={x.ObjectType} /><div style={{ minWidth: 0 }}><div className="nm">{x.ObjectName}</div><div className="ds">{x.Description || x.PackageName}</div></div>
                  <span className="muted num" style={{ fontSize: 12 }} title="Linked tickets">{n || ''}</span></a> })}
            </div>)}
            {!list.length && <div className="empty">{objects.length ? 'No objects match.' : <>No objects yet.<br /><button className="btn" onClick={() => go('objects/new')}>Register the first one</button></>}</div>}
          </div>
          <div className="od">{o ? <ObjectDetail key={o.ObjectUUID} o={o} objects={objects} /> : <div className="empty">Select an object</div>}</div>
        </div>}
      {creating && <NewObject close={() => go('objects')} />}
    </Page>
  );
}

function ObjectDetail({ o, objects }: { o: TechObject; objects: TechObject[] }) {
  const s = useStore();
  const menu = useMenu();
  const pick = usePickers();
  const links = useObjectLinks().data ?? [];
  const articles = useArticles().data ?? [];
  const transports = useTransports().data ?? [];
  const byId = new Map(objects.map(x => [x.ObjectUUID, x]));
  const { up, down } = related(o.ObjectUUID, depEdges(objects));
  const usedBy = objects.filter(x => x._Dependency.some(d => d.UsesObjectUUID === o.ObjectUUID));
  const tickets = links.filter(l => l.ObjectUUID === o.ObjectUUID).map(l => ({ l, t: s.tickets.find(t => t.TicketUUID === l.TicketUUID) }))
    .filter((x): x is { l: typeof x.l; t: NonNullable<typeof x.t> } => !!x.t).sort((a, b) => (b.t.CreatedAt ?? '').localeCompare(a.t.CreatedAt ?? ''));
  const trs = transports.filter(x => tickets.some(k => k.t.TicketUUID === x.TicketUUID));
  const kbs = articles.filter(a => a._Link.some(l => l.ObjectUUID === o.ObjectUUID));
  const upd = (p: Partial<TechObject>) => s.run(() => api.updateRoot('TechObject', o as never, p), { ok: 'Saved' });
  async function remove() {
    if (!confirm(`Remove ${o.ObjectType} ${o.ObjectName} from the registry? Its dependencies are removed too.`)) return;
    if (await s.run(() => api.deleteRoot('TechObject', o as never), { ok: `${o.ObjectName} removed` })) go('objects');
  }
  const candidates = objects.filter(x => x.ObjectUUID !== o.ObjectUUID && !o._Dependency.some(d => d.UsesObjectUUID === x.ObjectUUID));
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
      <ObjType type={o.ObjectType} />{s.text('OBJTYPE', o.ObjectType)}<span>·</span>
      <button className="pill" style={{ height: 24 }} onClick={e => menu(e.currentTarget, [{ label: 'No project', value: '' }, ...s.projects.map(p => ({ label: p.Name, value: p.Project, icon: <Dot color={p.Color} />, checked: p.Project === o.Project }))],
        v => upd({ Project: v }))}>{o.Project ? <ProjectChip code={o.Project} /> : 'No project'}</button>
      <span className="sp" style={{ flex: 1 }} />
      <button className="ib" title="Remove from registry" aria-label="Remove object" onClick={remove}><Icon name="trash" /></button></div>
    <Line value={o.ObjectName} mono onSave={v => v && upd({ ObjectName: v })} style={{ fontSize: 20, height: 40, margin: '10px 0 2px', fontWeight: 600 }} />
    <Line value={o.Description} placeholder="What it does" onSave={v => upd({ Description: v })} style={{ fontSize: 14, color: 'var(--text-2)' }} />
    <div className="kv" style={{ marginTop: 14, alignItems: 'center' }}>
      <span>Package</span><Line value={o.PackageName} mono upper placeholder="e.g. ZSD_GST" onSave={v => upd({ PackageName: v })} style={{ height: 26 }} />
      <span>Depends on</span><span>{up.size} object{up.size === 1 ? '' : 's'}</span>
      <span>Impacted by a change</span><span style={{ color: down.size ? 'var(--ok)' : undefined }}>{down.size} object{down.size === 1 ? '' : 's'}</span>
    </div>

    <div className="tp-sec" style={{ marginTop: 18 }}><h4><Icon name="graph" size={14} />Impact map<span className="sp" />
      <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}><span style={{ color: 'var(--ok)' }}>━</span> impacted downstream · ━ depends on · click a box to open it</span></h4>
      <ImpactMap id={o.ObjectUUID} objects={objects} onPick={id => go('objects/' + id)} /></div>

    <div className="tp-sec"><h4>Uses<span className="c">{o._Dependency.length}</span></h4>
      <div className="sub">{o._Dependency.map(d => { const x = byId.get(d.UsesObjectUUID);
        return <div className="it dep" key={d.DepUUID}>{x ? <ObjType type={x.ObjectType} small /> : <span />}
          {x ? <a className="mono" href={'#objects/' + x.ObjectUUID} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.ObjectName}</a> : <span className="muted">(removed object)</span>}
          <span className="tag">{s.text('DEPKIND', d.DepKind)}</span>
          <button className="ib" style={{ width: 22, height: 22 }} title="Remove dependency" onClick={() => s.run(() => api.deleteSub('ObjectDependency', d as never))}><Icon name="x" size={12} /></button></div> })}
        <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          onClick={e => pick.object(e.currentTarget, candidates, x => s.run(() => api.createSub('TechObject', o as never, { UsesObjectUUID: x.ObjectUUID, DepKind: 'USES' }), { ok: `${o.ObjectName} uses ${x.ObjectName}` }))}>
          <Icon name="plus" size={14} />Add an object this one uses…</button></div></div>

    <div className="tp-sec"><h4>Used by<span className="c">{usedBy.length}</span></h4>
      <div className="sub">{usedBy.map(x => <a className="it" key={x.ObjectUUID} href={'#objects/' + x.ObjectUUID}><ObjType type={x.ObjectType} small /><span className="mono">{x.ObjectName}</span><span className="muted">{x.Description}</span></a>)}
        {!usedBy.length && <div className="add">Nothing uses this object yet</div>}</div></div>

    <div className="tp-sec"><h4>Tickets<span className="c">{tickets.length}</span></h4>
      <div className="sub">{tickets.map(({ l, t }) => <a className="it" key={l.LinkUUID} href={'#ticket/' + t.TicketId}><StatusIcon status={t.Status as Status} />
        <span className="muted num">{t.TicketId}</span><span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.Title}</span><span className="sp" />
        <span className="tag">{l.ChangeKind.toLowerCase()}</span><span className="muted" style={{ fontSize: 12 }}>{fmtDate(t.CreatedAt)}</span></a>)}
        {!tickets.length && <div className="add">Not linked to a ticket yet (link it from the ticket, tab SAP &amp; files)</div>}</div></div>

    {trs.length > 0 && <div className="tp-sec"><h4>Transports of these tickets<span className="c">{trs.length}</span></h4>
      <div className="sub">{trs.slice(0, 8).map(x => <a className="it" key={x.TransportUUID} href={'#transports/' + x.TrKorr}><span className="mono">{x.TrKorr}</span>
        <span className="t2" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{x.TrText}</span><span className="sp" />
        <span className="muted" style={{ fontSize: 12 }}>{x.PrdImportedAt ? 'PRD ' + fmtDate(x.PrdImportedAt) : x.QaImportedAt ? 'QA' : 'DEV'}</span></a>)}</div></div>}

    <div className="tp-sec"><h4>Knowledge<span className="c">{kbs.length}</span></h4>
      <div className="sub">{kbs.map(a => <a className="it" key={a.ArticleUUID} href={'#kb/' + a.ArticleUUID}><Icon name="book" size={14} /><span>{a.Title}</span><span className="sp" /><span className="tag">{s.text('KBTYPE', a.ArticleType)}</span></a>)}
        {!kbs.length && <div className="add">No articles yet</div>}</div></div>

    <div className="tp-sec"><h4>Notes</h4><Area value={o.Notes} placeholder="Where it is used, pitfalls, owner…" onSave={v => upd({ Notes: v })} /></div>
  </>;
}

function NewObject({ close }: { close(): void }) {
  const s = useStore();
  const types = s.values.filter(v => v.ListType === 'OBJTYPE');
  const [d, setD] = useState({ ObjectType: types[0]?.Code ?? 'CLAS', ObjectName: '', Description: '', PackageName: '', Project: s.projects[0]?.Project ?? '' });
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!d.ObjectName.trim() || busy) return;
    setBusy(true);
    let id = '';
    const ok = await s.run(async () => { id = await api.createRoot('TechObject', d) }, { ok: `${d.ObjectName} registered` });
    setBusy(false);
    if (ok) go('objects/' + id);
  }
  const set = (p: Partial<typeof d>) => setD(x => ({ ...x, ...p }));
  return (
    <SidePanel close={close} head={<><Icon name="cube" /><b>Register object</b></>}>
      <div className="form" style={{ padding: 0 }}>
        <div><label htmlFor="ot">Type</label><select id="ot" value={d.ObjectType} onChange={e => set({ ObjectType: e.target.value })}>
          {types.map(t => <option key={t.Code} value={t.Code}>{t.Code} · {t.Text}</option>)}</select></div>
        <div><label htmlFor="op">Project</label><select id="op" value={d.Project} onChange={e => set({ Project: e.target.value })}>
          <option value="">No project</option>{s.projects.map(p => <option key={p.Project} value={p.Project}>{p.Name}</option>)}</select></div>
        <div className="full"><label htmlFor="on">Name</label><input id="on" className="mono" autoFocus value={d.ObjectName}
          placeholder={['FIORI', 'DEST', 'API'].includes(d.ObjectType) ? 'App ID, destination or API name' : 'e.g. ZCL_SD_INVOICE'}
          onChange={e => set({ ObjectName: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') create() }} /></div>
        <div className="full"><label htmlFor="od">Description</label><input id="od" value={d.Description} onChange={e => set({ Description: e.target.value })} /></div>
        <div className="full"><label htmlFor="ok">Package</label><input id="ok" className="mono" value={d.PackageName} placeholder="optional" onChange={e => set({ PackageName: e.target.value.toUpperCase() })} /></div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>SAP names are stored in upper case. Add dependencies on the object page; the impact map is drawn from them.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={!d.ObjectName.trim() || busy} onClick={create}>Register</button></div>
    </SidePanel>
  );
}
