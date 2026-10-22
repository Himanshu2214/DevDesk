// Screens: transport & deployment tracker, technical object registry with impact map.
(function(){
const {$,$$,esc,st,prj,byId,trById,objById,r1,sIcon,ic,ic14,prjChip,toast,S,views,openPanel,closePanel,dot}=DD;
const {DAY,PROJECTS,OBJECTS,DEPS,OBJ_TYPES,ARTICLES,tickets,transports}=TD;
const {fmtD}=Charts;
const TYPE_COLOR={TABL:'#4ea7fc',DDLS:'#26b5ce',BDEF:'#5e6ad2',CLAS:'#f0bf00',PROG:'#8a8f98',TRAN:'#8a8f98',SRVD:'#4cb782',SRVB:'#4cb782',FIORI:'#bb87fc',SSFO:'#e5a3c0',DEST:'#f2994a',API:'#eb5757',FUGR:'#8a8f98'};

/* ================= Transports ================= */
const phaseOf=x=>x.prd?'PRD':x.released?'QA':'DEV';
function edge(x){
  if(x.prd)return x.prd.rc>4?'var(--danger)':'var(--ok)';
  if(x.qa)return x.qa.rc>4?'var(--danger)':x.qa.rc>0?'var(--urgent)':'var(--st-test)';
  return x.released?'var(--st-todo)':'var(--border-2)';
}
function trSet(){return transports.filter(x=>S.trProject==='all'||byId(x.ticket)?.project===S.trProject)}
views.transports={
  crumb:()=>'<b>Transports</b>',
  bar2(){
    const cnt=k=>transports.filter(x=>k==='all'||byId(x.ticket)?.project===k).length;
    return [['all','All projects'],...PROJECTS.map(p=>[p.key,p.name])].map(([k,l])=>`<button class="pill ${S.trProject===k?'on':''}" data-trp="${k}">${k==='all'?'':dot(prj(k).color)}${esc(l)}<span class="c num">${cnt(k)}</span></button>`).join('')+
      '<span class="sp"></span>';
  },
  render(){
    const set=trSet(),by=k=>set.filter(x=>phaseOf(x)===k);
    const dev=by('DEV'),qa=by('QA').sort((a,b)=>(b.qa?.rc||0)-(a.qa?.rc||0)),prd=by('PRD').sort((a,b)=>b.prd.date-a.prd.date);
    const failed=set.filter(x=>(x.qa&&x.qa.rc>4&&!x.prd)).length,n=set.length||1;
    const card=x=>{const t=byId(x.ticket);const rc=x.prd?x.prd.rc:x.qa?x.qa.rc:null;const d=x.prd?x.prd.date:x.qa?x.qa.date:x.released||x.created;
      return `<div class="trc" data-tr="${x.id}" style="--edge:${edge(x)}">
        <div class="r1"><span class="mono" style="font-weight:600">${x.id}</span>${x.dependsOn.length?`<span title="Depends on ${x.dependsOn.join(', ')}" style="color:var(--muted);display:grid">${ic14('link')}</span>`:''}<span class="sp"></span>${rc>4?`<span class="fail">RC ${rc}</span>`:rc!=null?`<span class="muted num" style="font-size:12px">RC ${rc}</span>`:x.released?'<span class="muted" style="font-size:12px">released</span>':'<span class="muted" style="font-size:12px">modifiable</span>'}</div>
        <div class="tt">${esc(x.text)}</div>
        <div class="r3">${t?sIcon(t.status):''}<span class="num">${x.ticket}</span><span>·</span><span>${x.objects.length} objects</span><span>·</span><span>${fmtD(d)}</span>${x.evidence?`<span title="Test evidence recorded" style="color:var(--ok);display:grid;margin-left:auto">${ic14('check')}</span>`:''}</div></div>`};
    const phase=(title,color,list,hint,limit)=>`<section class="phase" style="--c:${color}"><header>${title}<span class="c num">${list.length}</span><span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">${hint}</span></header>
      ${list.slice(0,limit||99).map(card).join('')||'<div class="empty" style="padding:24px">Nothing here</div>'}${limit&&list.length>limit?`<div class="muted" style="padding:6px 14px 12px">+ ${list.length-limit} older imports</div>`:''}</section>`;
    $('#v-transports').innerHTML=`<div class="trk">
      <div class="trk-prog"><span class="t2" style="font-weight:600;white-space:nowrap">${prd.length} of ${set.length} in production</span>
        <div class="bar"><i style="width:${prd.length/n*100}%;background:var(--ok)"></i><i style="width:${(qa.length-failed)/n*100}%;background:var(--st-test)"></i><i style="width:${failed/n*100}%;background:var(--danger)"></i><i style="width:${dev.length/n*100}%;background:var(--border-2)"></i></div>
        ${failed?`<span class="fail">${failed} failed</span>`:''}</div>
      <div class="phases">${phase('Development','var(--st-prog)',dev,'not released')}${phase('Quality (QA)','var(--st-test)',qa,'released, waiting for PRD')}${phase('Production','var(--ok)',prd,'imported',12)}</div></div>`;
  },
  panel(id){
    const x=trById(id);if(!x)return;S.trSel=id;const t=byId(x.ticket);
    const imp=i=>i?`${fmtD(i.date)} · RC ${i.rc}${i.rc>4?' <span class="fail">failed</span>':''}`:'<span class="muted">not yet</span>';
    openPanel(`<div class="sh">${ic('truck')}<b class="mono">${x.id}</b><span class="tag">${x.kind}</span><span class="sp"></span><button class="ib" data-close-panel title="Close (Esc)">${ic('x')}</button></div>
     <div class="sb">
      <div style="font-size:16px;font-weight:600;margin-bottom:14px">${esc(x.text)}</div>
      <div class="kv">
        <span>Ticket</span><a href="#ticket/${x.ticket}" style="display:flex;gap:6px;align-items:center">${t?sIcon(t.status):''}${x.ticket} ${t?esc(t.title):''}</a>
        <span>Owner</span><span>${x.owner}</span><span>Created</span><span>${fmtD(x.created)}</span>
        <span>Released</span><span>${x.released?fmtD(x.released):'<span class="muted">modifiable</span>'}</span>
        <span>QA import</span><span>${imp(x.qa)}</span><span>PRD import</span><span>${imp(x.prd)}</span>
        <span>Depends on</span><span>${x.dependsOn.map(d=>`<a class="mono" data-trlink="${d}" href="javascript:void 0">${d}</a>`).join(', ')||'<span class="muted">–</span>'}</span>
      </div>
      <h5>Objects</h5><div style="display:flex;flex-wrap:wrap;gap:6px">${x.objects.map(objById).filter(Boolean).map(o=>`<a class="chip" href="#objects/${o.id}"><span class="otype" style="height:16px;font-size:9.5px">${o.type}</span><span class="mono">${esc(o.name)}</span></a>`).join('')||'<span class="muted">Read from E071 once linked in SAP</span>'}</div>
      <h5>Test evidence</h5><textarea class="box" data-f="evidence" style="width:100%;resize:vertical;font:inherit" placeholder="What was tested, by whom, link to screenshots">${esc(x.evidence)}</textarea>
      <h5>Deployment notes</h5><textarea class="box" data-f="notes" style="width:100%;resize:vertical;font:inherit" placeholder="Import window, manual steps, post-processing">${esc(x.notes)}</textarea>
      <h5>Rollback</h5><textarea class="box" data-f="rollback" style="width:100%;resize:vertical;font:inherit" placeholder="How to undo this change">${esc(x.rollback)}</textarea>
     </div>`);
  }
};
$('#v-transports').addEventListener('click',e=>{const c=e.target.closest('[data-tr]');if(c)views.transports.panel(c.dataset.tr)});
$('#bar2').addEventListener('click',e=>{const p=e.target.closest('[data-trp]');if(p){S.trProject=p.dataset.trp;DD.renderAll(false)}});
$('#panel').addEventListener('change',e=>{const f=e.target.dataset.f;const x=trById(S.trSel);if(f&&x){x[f]=e.target.value;S.lastUpd=Date.now();toast('Saved')}});
$('#panel').addEventListener('click',e=>{const l=e.target.closest('[data-trlink]');if(l)views.transports.panel(l.dataset.trlink)});

/* ================= Objects + impact map ================= */
function related(id){
  const up=new Set(),down=new Set();
  const walk=(n,set,dir)=>DEPS.forEach(d=>{const a=dir?d.from:d.to,b=dir?d.to:d.from;if(a===n&&!set.has(b)){set.add(b);walk(b,set,dir)}});
  walk(id,down,true);walk(id,up,false);return {up,down};
}
function impactSvg(id){
  const {up,down}=related(id),nodes=new Set([id,...up,...down]);
  const edges=DEPS.filter(d=>nodes.has(d.from)&&nodes.has(d.to)&&((up.has(d.from)||d.from===id)&&(up.has(d.to)||d.to===id)||(down.has(d.to)||d.to===id)&&(down.has(d.from)||d.from===id)));
  const rank={};nodes.forEach(n=>rank[n]=0);
  for(let i=0;i<nodes.size;i++)edges.forEach(e=>{rank[e.to]=Math.max(rank[e.to],rank[e.from]+1)});
  const rows=[];nodes.forEach(n=>{(rows[rank[n]]=rows[rank[n]]||[]).push(n)});
  const W=210,H=58,GX=34,GY=62,pos={};
  const maxRow=Math.max(...rows.map(r=>r.length));const width=Math.max(maxRow*(W+GX)-GX,W)+40;
  rows.forEach((r,ri)=>{
    if(ri>0)r.sort((a,b)=>{const px=n=>{const ps=edges.filter(e=>e.to===n).map(e=>pos[e.from]?.x??0);return ps.length?ps.reduce((s,v)=>s+v,0)/ps.length:0};return px(a)-px(b)});
    const rw=r.length*(W+GX)-GX,x0=(width-rw)/2;r.forEach((n,i)=>pos[n]={x:x0+i*(W+GX),y:20+ri*(H+GY)});
  });
  const height=20+rows.length*(H+GY)-GY+20;
  const path=e=>{const a=pos[e.from],b=pos[e.to];const x1=a.x+W/2,y1=a.y+H,x2=b.x+W/2,y2=b.y-6;return `M${x1} ${y1} C${x1} ${y1+GY/2},${x2} ${y2-GY/2},${x2} ${y2}`};
  const isDown=e=>(down.has(e.to))&&(down.has(e.from)||e.from===id);
  const cut=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><marker id="arG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--ok)"/></marker>
      <marker id="arU" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--muted)"/></marker></defs>
    ${edges.map(e=>`<path d="${path(e)}" fill="none" stroke="${isDown(e)?'var(--ok)':'var(--muted)'}" stroke-width="1.6" marker-end="url(#${isDown(e)?'arG':'arU'})" opacity="${isDown(e)?1:.7}"/>`).join('')}
    ${[...nodes].map(n=>{const o=objById(n),p=pos[n],c=TYPE_COLOR[o.type];return `<g class="gnode ${n===id?'me':''}" data-obj="${n}" transform="translate(${p.x},${p.y})">
      <title>${esc(o.type+' '+o.name+' – '+o.desc)}</title>
      <rect class="b" width="${W}" height="${H}" rx="8"/><rect width="3" height="${H-12}" y="6" x="0" rx="1.5" fill="${c}"/>
      <text x="14" y="21" font-size="10.5" font-weight="700" fill="${c}" font-family="Cascadia Mono,Consolas,monospace">${o.type}</text>
      <text x="14" y="40" font-size="12" fill="var(--text)" font-family="Cascadia Mono,Consolas,monospace">${esc(cut(o.name,26))}</text></g>`}).join('')}
  </svg>`;
}
function objList(){
  const q=S.objQ.toLowerCase();
  return OBJECTS.filter(o=>(S.objType==='all'||o.type===S.objType)&&(!q||(o.name+' '+o.desc+' '+o.pkg).toLowerCase().includes(q)));
}
views.objects={
  crumb:()=>'<b>Objects</b><span class="muted" style="font-weight:400">technical object registry</span>',
  bar2(){
    const types=[...new Set(OBJECTS.map(o=>o.type))];
    return `<label class="pill" style="width:280px;cursor:text">${ic14('search')}<input id="objQ" value="${esc(S.objQ)}" placeholder="Search name, description, package" style="border:0;background:transparent;outline:none;width:100%"></label>
      <select class="pill" id="objType"><option value="all">All types</option>${types.map(t=>`<option value="${t}" ${S.objType===t?'selected':''}>${t} · ${OBJ_TYPES[t]}</option>`).join('')}</select>
      <span class="sp"></span><span class="muted num">${objList().length} objects</span>`;
  },
  render(){
    const list=objList(),o=objById(S.obj)||list[0]||OBJECTS[0];
    const tks=t=>tickets.filter(x=>x.objects.includes(t.id));
    const {up,down}=related(o.id);
    const trs=transports.filter(x=>x.objects.includes(o.id)).sort((a,b)=>b.created-a.created);
    const kbs=ARTICLES.filter(a=>a.objects.includes(o.id));
    $('#v-objects').innerHTML=`<div class="objs">
     <div class="ol">${PROJECTS.map(p=>{const g=list.filter(x=>x.project===p.key);return g.length?`<div class="grp" style="padding-left:16px">${dot(p.color)}${esc(p.name)}<span class="c">${g.length}</span></div>`+
       g.map(x=>`<div class="orow ${x.id===o.id?'sel':''}" data-obj="${x.id}"><span class="otype" style="color:${TYPE_COLOR[x.type]}">${x.type}</span><div style="min-width:0"><div class="nm">${esc(x.name)}</div><div class="ds">${esc(x.desc)}</div></div><span class="muted num" style="font-size:12px" title="Linked tickets">${tks(x).length||''}</span></div>`).join(''):''}).join('')||'<div class="empty">No objects match</div>'}</div>
     <div class="od">
      <div style="display:flex;align-items:center;gap:8px;color:var(--muted)"><span class="otype" style="color:${TYPE_COLOR[o.type]}">${o.type}</span>${OBJ_TYPES[o.type]}<span>·</span>${prjChip(o.project)}</div>
      <h1 class="tp-title mono" style="font-size:22px;margin:10px 0 4px">${esc(o.name)}</h1>
      <div class="t2" style="font-size:14px">${esc(o.desc)}</div>
      <div class="kv" style="margin-top:16px"><span>Package</span><span class="mono">${o.pkg}</span><span>System</span><span>${o.system}</span>
        <span>Depends on</span><span>${up.size} objects</span><span>Impacted by a change</span><span style="color:${down.size?'var(--ok)':'inherit'}">${down.size} objects</span></div>
      <div class="tp-sec" style="margin-top:20px"><h4>${ic14('graph')}Impact map<span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px"><span style="color:var(--ok)">━</span> impacted downstream · <span>━</span> depends on · click a box to move</span></h4>
        <div class="graph">${impactSvg(o.id)}</div></div>
      <div class="tp-sec"><h4>Tickets<span class="c">${tks(o).length}</span></h4><div class="sub">${tks(o).sort((a,b)=>b.created-a.created).map(t=>`<a class="it" href="#ticket/${t.id}">${sIcon(t.status)}<span class="muted num">${t.id}</span><span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(t.title)}</span><span class="sp"></span><span class="muted" style="font-size:12px">${fmtD(t.created)}</span></a>`).join('')||'<div class="add">Not linked to a ticket yet</div>'}</div></div>
      <div class="tp-sec"><h4>Transports<span class="c">${trs.length}</span></h4><div class="sub">${trs.slice(0,8).map(x=>`<div class="it" data-tr="${x.id}" style="cursor:pointer"><span class="mono">${x.id}</span><span class="t2" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(x.text)}</span><span class="sp"></span><span class="muted" style="font-size:12px">${x.prd?'PRD '+fmtD(x.prd.date):x.qa?'QA':'DEV'}</span></div>`).join('')||'<div class="add">None</div>'}</div></div>
      <div class="tp-sec"><h4>Knowledge<span class="c">${kbs.length}</span></h4><div class="sub">${kbs.map(a=>`<a class="it" href="#kb/${a.id}">${ic14('book')}<span>${esc(a.title)}</span><span class="sp"></span><span class="tag">${a.type}</span></a>`).join('')||'<div class="add">No articles yet</div>'}</div></div>
     </div></div>`;
  }
};
$('#v-objects').addEventListener('click',e=>{
  const o=e.target.closest('[data-obj]');if(o){location.hash='#objects/'+o.dataset.obj;return}
  const tr=e.target.closest('[data-tr]');if(tr)views.transports.panel(tr.dataset.tr);
});
$('#bar2').addEventListener('input',e=>{if(e.target.id==='objQ'){S.objQ=e.target.value;views.objects.render();const n=$('#bar2 .muted.num');if(n)n.textContent=objList().length+' objects'}});
$('#bar2').addEventListener('change',e=>{if(e.target.id==='objType'){S.objType=e.target.value;DD.renderAll(false)}});
})();
