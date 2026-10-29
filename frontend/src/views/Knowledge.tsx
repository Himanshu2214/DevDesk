// Knowledge base: snippets, error & fix journal, API examples, config notes and design decisions,
// linked to tickets and objects. Search runs in the browser over all fields.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Article, ArticleType, Status } from '../api';
import { useArticles, useObjects, useStore } from '../store';
import { DAY, fmtDate } from '../lib/format';
import { Icon, StatusIcon } from '../components/Icons';
import { go, isTyping, Page, useMenu } from '../components/ui';
import { Area, Line, ObjType, usePickers } from '../components/p2';

const TYPES: [ArticleType, string][] = [['SNIP', 'book'], ['FIX', 'bug'], ['API', 'link'], ['CONF', 'tag'], ['DECI', 'graph']];
const typeIcon = (t: string) => <Icon name={TYPES.find(k => k[0] === t)?.[1] ?? 'book'} size={14} />;
type Field = [keyof Article, string, 'area' | 'code' | 'line'];
const FIELDS: Record<ArticleType, Field[]> = {
  FIX: [['ErrorText', 'Error', 'area'], ['RootCause', 'Root cause', 'area'], ['FixLocation', 'Where (breakpoint / object)', 'line'], ['FixText', 'Fix', 'area'], ['TestNote', 'Test result', 'area']],
  SNIP: [['CodeText', 'Code', 'code'], ['CodeLang', 'Language', 'line'], ['NoteText', 'Notes', 'area']],
  API: [['HttpMethod', 'Method', 'line'], ['Endpoint', 'Endpoint', 'line'], ['RequestBody', 'Request', 'code'], ['ResponseBody', 'Response', 'code'],
    ['ResponseCodes', 'Response codes', 'line'], ['AuthReference', 'Authentication (reference only – never credentials)', 'line']],
  CONF: [['StepsText', 'Steps (one per line)', 'area']],
  DECI: [['ContextText', 'Context', 'area'], ['DecisionText', 'Decision', 'area'], ['Consequences', 'Consequences', 'area']],
};
const textOf = (a: Article) => [a.ArticleId, a.Title, a.Tags, ...Object.values(FIELDS).flat().map(([f]) => String(a[f] ?? ''))].join(' ').toLowerCase();
const excerpt = (a: Article) => a.ErrorText || a.NoteText || (a.Endpoint ? `${a.HttpMethod} ${a.Endpoint}` : '') || a.ContextText || a.StepsText.split('\n').join(' · ') || a.CodeText || '';
export const tagsOf = (a: Article) => a.Tags.split(',').map(t => t.trim()).filter(Boolean);

export function Knowledge({ route }: { route: string }) {
  const id = route.split('/')[1];
  return id ? <ArticlePage uuid={id} /> : <KbList />;
}

function KbList() {
  const s = useStore();
  const menu = useMenu();
  const q = useArticles();
  const all = q.data ?? [];
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<'all' | 'week' | 'month' | 'year'>('all');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && !isTyping(e)) { e.preventDefault(); input.current?.focus() } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const lim = { all: 1e9, week: 7, month: 31, year: 366 }[range];
  const list = all.filter(a => words.every(w => textOf(a).includes(w)) && (!types.size || types.has(a.ArticleType))
    && (Date.now() - Date.parse(a.CreatedAt ?? '')) / DAY <= lim && [...tags].every(t => tagsOf(a).includes(t)));
  const allTags = [...new Set(all.flatMap(tagsOf))].sort();
  const toggle = (set: Set<string>, v: string, put: (s: Set<string>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); put(n) };
  const reset = () => { setQuery(''); setTypes(new Set()); setTags(new Set()); setRange('all') };
  const create = (e: React.MouseEvent) => menu(e.currentTarget, TYPES.map(([t]) => ({ label: s.text('KBTYPE', t), value: t, icon: typeIcon(t) })), async t => {
    let id = '';
    const ok = await s.run(async () => { id = await api.createRoot('Article', { ArticleType: t, Title: `New ${s.text('KBTYPE', t).toLowerCase()}` }) }, { ok: 'Article created' });
    if (ok) go('kb/' + id);
  }, false);

  return (
    <Page crumb={<b>Knowledge</b>}>
      <div className="kbw"><div>
        <label className="kbsearch"><Icon name="search" size={18} style={{ color: 'var(--muted)' }} />
          <input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search errors, code, endpoints… e.g. timeout, RAP dump, IRN" aria-label="Search knowledge" /><kbd>/</kbd></label>
        <div className="kbbar"><span className="cnt">Results <b className="num">{list.length} found{list.length < all.length ? ' (filtered)' : ''}</b></span>
          <button className="ib" title="Clear search and filters" onClick={reset}><Icon name="refresh" size={15} /></button><span className="sp" />
          <button className="btn primary" onClick={create}><Icon name="plus" size={14} />Create</button></div>
        {q.isLoading && [0, 1, 2].map(i => <div key={i} className="art"><div className="sk" style={{ height: 16, width: '60%' }} /><div className="sk" style={{ height: 12, width: '90%', marginTop: 10 }} /></div>)}
        {list.map(a => <div key={a.ArticleUUID} className="art" role="link" tabIndex={0} onClick={() => go('kb/' + a.ArticleUUID)} onKeyDown={e => { if (e.key === 'Enter') go('kb/' + a.ArticleUUID) }}>
          <h3>{a.Title}</h3><div className="ex">{excerpt(a)}</div>
          <div className="mt"><span className="chip">{typeIcon(a.ArticleType)}{s.text('KBTYPE', a.ArticleType)}</span>{tagsOf(a).map(t => <span key={t} className="tag">#{t}</span>)}<span className="sp" />
            {a._Link.some(l => l.TicketUUID) && <span><Icon name="my" size={13} /> {a._Link.filter(l => l.TicketUUID).length}</span>}
            {a._Link.some(l => l.ObjectUUID) && <span><Icon name="cube" size={13} /> {a._Link.filter(l => l.ObjectUUID).length}</span>}
            <span className="num">{a.ArticleId}</span><span>{fmtDate(a.CreatedAt)}</span></div></div>)}
        {!q.isLoading && !list.length && <div className="empty">{all.length ? 'No articles match. Try fewer words or clear the filters.' : 'No articles yet. Create the first one – e.g. the fix for the last dump you solved.'}</div>}
      </div>
        <aside className="filters"><h4><Icon name="list" size={14} />Filters</h4>
          <div className="fgroup"><div className="t"><Icon name="tag" size={14} />Type</div>{TYPES.map(([t]) =>
            <label key={t}><input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} />{s.text('KBTYPE', t)}
              <span className="muted num" style={{ marginLeft: 'auto' }}>{all.filter(a => a.ArticleType === t).length}</span></label>)}</div>
          <div className="fgroup"><div className="t"><Icon name="cal" size={14} />Time range</div>{([['all', 'All time'], ['week', 'Last week'], ['month', 'Last month'], ['year', 'Last year']] as const).map(([k, l]) =>
            <label key={k}><input type="radio" name="kbr" checked={range === k} onChange={() => setRange(k)} />{l}</label>)}</div>
          {allTags.length > 0 && <div className="fgroup"><div className="t"><Icon name="tag" size={14} />Tags</div><div className="tagcloud">{allTags.map(t =>
            <button key={t} className={tags.has(t) ? 'on' : ''} onClick={() => toggle(tags, t, setTags)}>#{t}</button>)}</div></div>}
        </aside></div>
    </Page>
  );
}

function ArticlePage({ uuid }: { uuid: string }) {
  const s = useStore();
  const pick = usePickers();
  const q = useArticles();
  const objects = useObjects().data ?? [];
  const a = (q.data ?? []).find(x => x.ArticleUUID === uuid);
  const crumb = <><a href="#kb">Knowledge</a><span className="sepr">›</span><b>{a?.ArticleId ?? ''}</b></>;
  if (q.isLoading) return <Page crumb={crumb}><div className="artpage"><div className="sk" style={{ height: 26, width: '60%' }} /></div></Page>;
  if (!a) return <Page crumb={crumb}><div className="empty">Article not found. <a href="#kb">All articles</a></div></Page>;

  const upd = (p: Partial<Article>) => s.run(() => api.updateRoot('Article', a as never, p), { ok: 'Saved' });
  const tickets = a._Link.filter(l => l.TicketUUID).map(l => ({ l, t: s.tickets.find(t => t.TicketUUID === l.TicketUUID) }));
  const objs = a._Link.filter(l => l.ObjectUUID).map(l => ({ l, o: objects.find(o => o.ObjectUUID === l.ObjectUUID) }));
  const unlink = (l: { etag?: string }) => s.run(() => api.deleteSub('ArticleLink', l as never));
  async function remove() {
    if (!confirm(`Delete ${a!.ArticleId} "${a!.Title}"?`)) return;
    if (await s.run(() => api.deleteRoot('Article', a! as never), { ok: `${a!.ArticleId} deleted` })) go('kb');
  }
  return (
    <Page crumb={crumb} right={<button className="ib" title="Delete article" aria-label="Delete article" onClick={remove}><Icon name="trash" /></button>}>
      <div className="artpage">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="chip">{typeIcon(a.ArticleType)}{s.text('KBTYPE', a.ArticleType)}</span>
          {a.HttpMethod && <span className="method">{a.HttpMethod}</span>}{a.CodeLang && <span className="tag">{a.CodeLang}</span>}
          <span className="muted" style={{ marginLeft: 'auto' }}>{a.ArticleId} · {fmtDate(a.CreatedAt)} · {a.CreatedBy}</span></div>
        <h1 className="tp-title" contentEditable suppressContentEditableWarning spellCheck={false} key={'t' + a.etag} style={{ marginTop: 14 }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() } }}
          onBlur={e => { const v = e.currentTarget.innerText.trim(); if (v && v !== a.Title) upd({ Title: v }) }}>{a.Title}</h1>
        <div className="flds">
          <div className="f"><h5>Tags</h5><Line value={a.Tags} placeholder="comma separated, e.g. rap, dump" onSave={v => upd({ Tags: v.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).join(',') })} /></div>
          {FIELDS[a.ArticleType].map(([f, label, kind]) => <div className="f" key={f}><h5>{label}</h5>
            {kind === 'line' ? <Line value={String(a[f] ?? '')} upper={f === 'HttpMethod'} mono={f === 'Endpoint'} onSave={v => upd({ [f]: v })} placeholder="Add…" />
              : <Area value={String(a[f] ?? '')} mono={kind === 'code'} rows={kind === 'code' ? 8 : 3} onSave={v => upd({ [f]: v })} placeholder="Add…" />}</div>)}
        </div>
        <div className="tp-sec"><h4>Linked tickets<span className="c">{tickets.length}</span></h4>
          <div className="sub">{tickets.map(({ l, t }) => <div className="it" key={l.LinkUUID}>
            {t ? <a href={'#ticket/' + t.TicketId} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, color: 'inherit' }}><StatusIcon status={t.Status as Status} /><span className="muted num">{t.TicketId}</span><span>{t.Title}</span></a>
              : <span className="muted">(ticket not found)</span>}<span className="sp" />
            <button className="ib" style={{ width: 22, height: 22 }} title="Remove link" onClick={() => unlink(l)}><Icon name="x" size={12} /></button></div>)}
            <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={e => pick.ticket(e.currentTarget, s.tickets.filter(t => !tickets.some(x => x.t?.TicketUUID === t.TicketUUID)), t => s.run(() => api.createSub('Article', a as never, { TicketUUID: t.TicketUUID }), { ok: `Linked to ${t.TicketId}` }))}>
              <Icon name="plus" size={14} />Link a ticket…</button></div></div>
        <div className="tp-sec"><h4>Linked objects<span className="c">{objs.length}</span></h4>
          <div className="sub">{objs.map(({ l, o }) => <div className="it" key={l.LinkUUID}>
            {o ? <a href={'#objects/' + o.ObjectUUID} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, color: 'inherit' }}><ObjType type={o.ObjectType} small /><span className="mono">{o.ObjectName}</span><span className="muted">{o.Description}</span></a>
              : <span className="muted">(object not found)</span>}<span className="sp" />
            <button className="ib" style={{ width: 22, height: 22 }} title="Remove link" onClick={() => unlink(l)}><Icon name="x" size={12} /></button></div>)}
            <button className="add" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={e => pick.object(e.currentTarget, objects.filter(o => !objs.some(x => x.o?.ObjectUUID === o.ObjectUUID)), o => s.run(() => api.createSub('Article', a as never, { ObjectUUID: o.ObjectUUID }), { ok: `Linked to ${o.ObjectName}` }))}>
              <Icon name="plus" size={14} />Link an object…</button></div></div>
      </div>
    </Page>
  );
}
