// Screens: Inbox, Knowledge base + article page, Timesheet, Insights. Starts the app at the end.
(function(){
const {$,$$,esc,st,prj,act,byId,trById,objById,r1,TECH_COLOR,sIcon,pIcon,ic,ic14,dueHtml,prjChip,techTag,ago,toast,isOpen,hours,weekStart,weekHours,missingTime,
  S,views,openLog,changed,dot,openMenu}=DD;
const {DAY,STATUSES,PROJECTS,AREAS,TECHS,ACTIVITIES,OBJECTS,ARTICLES,tickets,transports,startOfDay}=TD;
const {M,fmtD}=Charts;

/* ================= Inbox ================= */
function items(){
  const out=[];
  const red=n=>`<span style="color:var(--danger);display:grid">${ic(n,'width:15px;height:15px')}</span>`;
  tickets.filter(t=>isOpen(t)&&t.due<Date.now()).forEach(t=>out.push({key:'od'+t.id,id:t.id,at:t.due.getTime(),ico:red('alert'),a:`${t.id} ${t.title}`,b:`Overdue by ${Math.ceil((Date.now()-t.due)/DAY)} days`,pin:true}));
  transports.filter(x=>x.qa&&x.qa.rc>4&&!x.prd).forEach(x=>out.push({key:'rc'+x.id,id:x.ticket,at:x.qa.date.getTime(),ico:red('truck'),a:`${x.ticket} ${byId(x.ticket)?.title||''}`,b:`${x.id} import to QA ended with RC ${x.qa.rc}`,pin:true}));
  missingTime().forEach(t=>out.push({key:'mt'+t.id,id:t.id,at:Date.now(),ico:`<span style="color:var(--urgent);display:grid">${ic('clock','width:15px;height:15px')}</span>`,a:`${t.id} ${t.title}`,b:'In progress, no time logged in 2 working days',pin:true}));
  for(const e of S.activity){const t=byId(e.id);if(!t)continue;
    const b=e.kind==='move'?`${sIcon(e.to)} Moved to ${st(e.to).name}`:e.kind==='new'?'Created':e.kind==='time'?`Logged ${e.hours}h`:e.kind==='tr'?`${e.tr} imported to ${e.sys}`:e.kind==='trfail'?`${e.tr} failed in ${e.sys} (RC ${e.rc})`:e.kind==='comment'?`Comment: ${esc(e.text).slice(0,70)}`:'Updated';
    const icn=e.kind==='move'?sIcon(e.to):ic({time:'clock',tr:'truck',trfail:'truck',comment:'chat'}[e.kind]||'plus','width:15px;height:15px;color:var(--muted)');
    out.push({key:e.at+e.id+e.kind,id:e.id,at:e.at,ico:icn,a:`${t.id} ${t.title}`,b})}
  return out.sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||b.at-a.at);
}
views.inbox={
  items,
  crumb:()=>'<b>Inbox</b>',
  bar2:()=>`<button class="pill ${S.inboxFilter==='all'?'on':''}" data-if="all">All</button><button class="pill ${S.inboxFilter==='unread'?'on':''}" data-if="unread">Unread</button><span class="sp"></span><button class="pill" id="markRead">${ic14('check')}Mark all read</button>`,
  render(){
    let it=items();if(S.inboxFilter==='unread')it=it.filter(n=>!S.read.has(n.key));
    if(!S.inboxSel&&it[0]){S.inboxSel=it[0].key;S.read.add(it[0].key)}
    const sel=it.find(n=>n.key===S.inboxSel)||it[0],t=sel&&byId(sel.id);
    $('#v-inbox').innerHTML=`<div class="inbox"><div class="lst">${it.map(n=>`<div class="nt ${n.key===sel?.key?'sel':''} ${S.read.has(n.key)?'':'unread'}" data-key="${n.key}">
       <span style="padding-top:2px">${n.ico}</span><div style="min-width:0"><div class="a">${esc(n.a)}</div><div class="b">${n.b}</div></div><span class="w">${n.pin?'':ago(n.at)}</span></div>`).join('')||'<div class="empty">Inbox zero.</div>'}</div>
     <div class="pre">${t?`<div class="muted num">${t.id}</div><h1 class="tp-title" style="margin-top:4px">${esc(t.title)}</h1>
       <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 18px"><span class="chip">${sIcon(t.status)}${st(t.status).name}</span><span class="chip">${pIcon(t.priority)}${t.priority}</span>${prjChip(t.project)}${techTag(t.tech)}<span class="chip">${ic('cal','width:13px;height:13px')}${dueHtml(t)}</span></div>
       <p class="t2" style="font-size:14px">${esc(t.description)}</p>
       <div class="tp-sec"><h4>Recent</h4><ul class="acts">${t.history.slice(-4).reverse().map(h=>`<li><span class="ico">${sIcon(h.status)}</span><span>Moved to <b>${st(h.status).name}</b> · ${ago(h.at.getTime())}</span></li>`).join('')}</ul></div>
       <div style="margin-top:20px;display:flex;gap:8px"><a class="btn primary" href="#ticket/${t.id}">Open ticket</a><button class="btn" data-menu="status" data-tid="${t.id}">${sIcon(t.status)} Change status</button><button class="btn" data-log="${t.id}">${ic14('clock')}Log time</button></div>`:'<div class="empty">Select a notification</div>'}</div></div>`;
  },
  key(e,k){if(k!=='j'&&k!=='k')return;const it=items();const i=it.findIndex(n=>n.key===S.inboxSel);const n=it[Math.min(it.length-1,Math.max(0,i+(k==='j'?1:-1)))];if(n){S.inboxSel=n.key;S.read.add(n.key);DD.renderAll(false)}}
};
$('#v-inbox').addEventListener('click',e=>{const n=e.target.closest('.nt');if(n){S.inboxSel=n.dataset.key;S.read.add(n.dataset.key);DD.renderAll(false)}const l=e.target.closest('[data-log]');if(l)openLog(l.dataset.log)});
$('#bar2').addEventListener('click',e=>{
  const f=e.target.closest('[data-if]');if(f){S.inboxFilter=f.dataset.if;DD.renderAll(false)}
  if(e.target.closest('#markRead')){items().forEach(n=>S.read.add(n.key));DD.renderAll(false)}
});

/* ================= Knowledge base ================= */
const KB_TYPES=[['Snippet','book'],['Error & fix','bug'],['API example','link'],['Config note','tag'],['Design decision','graph']];
const kbIcon=t=>ic14(KB_TYPES.find(k=>k[0]===t)?.[1]||'book');
const excerpt=a=>a.error||a.note||(a.endpoint?a.method+' '+a.endpoint:'')||a.context||(a.steps||[]).join(' · ')||a.code||'';
const textOf=a=>[a.title,a.tags.join(' '),a.error,a.rootCause,a.fix,a.code,a.note,a.endpoint,a.request,a.context,a.decision,(a.steps||[]).join(' ')].join(' ').toLowerCase();
function kbList(){
  const q=S.kbQ.trim().toLowerCase(),lim={all:1e9,week:7,month:31,year:366}[S.kbRange];
  return ARTICLES.filter(a=>(!q||q.split(/\s+/).every(w=>textOf(a).includes(w)))&&(!S.kbTypes.size||S.kbTypes.has(a.type))&&(Date.now()-a.created)/DAY<=lim&&[...S.kbTags].every(t=>a.tags.includes(t)));
}
function drawKbResults(){
  const list=kbList();
  $('#kbCount').innerHTML=`Results <b class="num">${list.length} found${list.length<ARTICLES.length?' (filtered)':''}</b>`;
  $('#kbRes').innerHTML=list.map(a=>`<div class="art" data-kb="${a.id}"><h3>${esc(a.title)}</h3><div class="ex">${esc(excerpt(a))}</div>
    <div class="mt"><span class="chip">${kbIcon(a.type)}${a.type}</span>${a.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}<span class="sp" style="flex:1"></span>
      ${a.tickets.length?`<span>${ic('my','width:13px;height:13px')} ${a.tickets.length} ticket${a.tickets.length>1?'s':''}</span>`:''}${a.objects.length?`<span>${ic('cube','width:13px;height:13px')} ${a.objects.length} object${a.objects.length>1?'s':''}</span>`:''}<span>${fmtD(a.created)}</span></div></div>`).join('')||'<div class="empty">No articles match. Try fewer words or clear the filters.</div>';
}
views.kb={
  crumb:()=>'<b>Knowledge</b><span class="muted" style="font-weight:400">snippets, fixes, API examples, decisions</span>',
  render(){
    const tags=[...new Set(ARTICLES.flatMap(a=>a.tags))].sort();
    $('#v-kb').innerHTML=`<div class="kbw"><div>
      <label class="kbsearch">${ic('search','width:18px;height:18px;color:var(--muted)')}<input id="kbQ" value="${esc(S.kbQ)}" placeholder="Search errors, code, endpoints… e.g. timeout, RAP dump, BCS"><kbd>/</kbd></label>
      <div class="kbbar"><span class="cnt" id="kbCount"></span><button class="ib" id="kbReset" title="Clear search and filters">${ic('refresh','width:15px;height:15px')}</button><span class="sp"></span><button class="btn primary" id="kbNew">${ic14('plus')}Create</button></div>
      <div id="kbRes"></div></div>
      <aside class="filters"><h4>${ic('filter','width:15px;height:15px')}Filters</h4>
        <div class="fgroup"><div class="t">${ic14('tag')}Type</div>${KB_TYPES.map(([t])=>`<label><input type="checkbox" data-kt="${t}" ${S.kbTypes.has(t)?'checked':''}>${t}<span class="muted num" style="margin-left:auto">${ARTICLES.filter(a=>a.type===t).length}</span></label>`).join('')}</div>
        <div class="fgroup"><div class="t">${ic14('cal')}Time range</div>${[['all','All time'],['week','Last week'],['month','Last month'],['year','Last year']].map(([k,l])=>`<label><input type="radio" name="kbr" data-kr="${k}" ${S.kbRange===k?'checked':''}>${l}</label>`).join('')}</div>
        <div class="fgroup"><div class="t">${ic14('tag')}Tags</div><div class="tagcloud">${tags.map(t=>`<button data-ktag="${esc(t)}" class="${S.kbTags.has(t)?'on':''}">#${esc(t)}</button>`).join('')}</div></div>
      </aside></div>`;
    drawKbResults();
  }
};
const vkb=$('#v-kb');
vkb.addEventListener('input',e=>{if(e.target.id==='kbQ'){S.kbQ=e.target.value;drawKbResults()}});
vkb.addEventListener('change',e=>{const t=e.target.dataset.kt,r=e.target.dataset.kr;
  if(t){e.target.checked?S.kbTypes.add(t):S.kbTypes.delete(t);drawKbResults()}if(r){S.kbRange=r;drawKbResults()}});
vkb.addEventListener('click',e=>{
  const tg=e.target.closest('[data-ktag]');if(tg){const t=tg.dataset.ktag;S.kbTags.has(t)?S.kbTags.delete(t):S.kbTags.add(t);tg.classList.toggle('on');drawKbResults();return}
  const a=e.target.closest('[data-kb]');if(a){location.hash='#kb/'+a.dataset.kb;return}
  if(e.target.closest('#kbReset')){S.kbQ='';S.kbTypes.clear();S.kbTags.clear();S.kbRange='all';views.kb.render();return}
  const nb=e.target.closest('#kbNew');if(nb)openMenu(nb,KB_TYPES.map(([t,i])=>({label:t,value:t,icon:ic14(i)})),type=>{
    const id='KB-'+(ARTICLES.length+1);
    ARTICLES.unshift({id,type,title:'New '+type.toLowerCase(),tags:[],objects:[],tickets:[],created:new Date(),
      ...(type==='Error & fix'?{error:'',rootCause:'',location:'',fix:'',test:''}:type==='Snippet'?{lang:'ABAP',code:'',note:''}:type==='API example'?{method:'GET',endpoint:'',request:'',response:'',codes:'',auth:''}:type==='Config note'?{steps:['']}:{context:'',decision:'',consequences:''})});
    location.hash='#kb/'+id},{search:false});
});

const FIELDS={'Error & fix':[['error','Error'],['rootCause','Root cause'],['location','Where (breakpoint / object)'],['fix','Fix'],['test','Test result']],
  'Snippet':[['code','Code',true],['note','Notes']],'API example':[['endpoint','Endpoint'],['request','Request',true],['response','Response',true],['codes','Response codes'],['auth','Authentication (reference only – no credentials)']],
  'Config note':[['steps','Steps']],'Design decision':[['context','Context'],['decision','Decision'],['consequences','Consequences']]};
views.article={
  crumb(){const a=ARTICLES.find(x=>x.id===S.kbArticle);return `<a href="#kb">Knowledge</a><span class="sepr">›</span><b>${a?a.id:''}</b>`},
  render(){
    const a=ARTICLES.find(x=>x.id===S.kbArticle);if(!a){$('#v-article').innerHTML='<div class="empty">Article not found</div>';return}
    const ed=(f,code)=>code?`<pre class="code" contenteditable="true" spellcheck="false" data-af="${f}">${esc(a[f]||'')}</pre>`:`<div contenteditable="true" data-af="${f}" data-ph="Add…">${esc(a[f]||'')}</div>`;
    $('#v-article').innerHTML=`<div class="artpage">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip">${kbIcon(a.type)}${a.type}</span>${a.method?`<span class="method">${a.method}</span>`:''}${a.lang?`<span class="tag">${a.lang}</span>`:''}${a.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}<span class="muted" style="margin-left:auto">${fmtD(a.created)}</span></div>
      <h1 class="tp-title" contenteditable="true" spellcheck="false" data-af="title" style="margin-top:14px">${esc(a.title)}</h1>
      <div class="flds">${FIELDS[a.type].map(([f,l,code])=>`<div class="f"><h5>${l}</h5>${f==='steps'?`<ol class="t2" style="margin:0;padding-left:20px" contenteditable="true" data-af="steps">${(a.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:ed(f,code)}</div>`).join('')}</div>
      <div class="tp-sec"><h4>Linked tickets<span class="c">${a.tickets.length}</span></h4><div class="sub">${a.tickets.map(byId).filter(Boolean).map(t=>`<a class="it" href="#ticket/${t.id}">${sIcon(t.status)}<span class="muted num">${t.id}</span><span>${esc(t.title)}</span></a>`).join('')||'<div class="add">None</div>'}</div></div>
      <div class="tp-sec"><h4>Linked objects<span class="c">${a.objects.length}</span></h4><div class="sub">${a.objects.map(objById).filter(Boolean).map(o=>`<a class="it" href="#objects/${o.id}"><span class="otype">${o.type}</span><span class="mono">${esc(o.name)}</span><span class="muted">${esc(o.desc)}</span></a>`).join('')||'<div class="add">None</div>'}</div></div>
    </div>`;
  }
};
$('#v-article').addEventListener('focusout',e=>{const f=e.target.dataset.af;const a=ARTICLES.find(x=>x.id===S.kbArticle);if(!f||!a)return;
  if(f==='steps')a.steps=[...e.target.querySelectorAll('li')].map(li=>li.innerText.trim()).filter(Boolean);else a[f]=e.target.innerText.trim();S.lastUpd=Date.now()});

/* ================= Timesheet ================= */
views.timesheet={
  crumb:()=>'<b>Timesheet</b>',
  bar2:()=>{const d=weekStart(S.week),e=new Date(d.getTime()+6*DAY);
    return `<button class="ib" id="wkPrev">‹</button><b class="num">${fmtD(d)} – ${fmtD(e)}</b><button class="ib" id="wkNext">›</button><button class="pill" id="wkNow">This week</button><span class="sp"></span><span class="muted">Total <b class="t2 num">${r1(weekHours(S.week))} h</b> of 40 h</span><button class="btn primary" id="wkLog" style="margin-left:10px">${ic14('plus')}Log time</button>`},
  render(fresh){
    const days=[...Array(7)].map((_,i)=>new Date(weekStart(S.week).getTime()+i*DAY)),today=startOfDay(new Date()).getTime();
    const rows=tickets.map(t=>{const h=days.map(d=>t.worklog.filter(w=>w.date.getTime()===d.getTime()).reduce((s,w)=>s+w.hours,0)+(d.getTime()===today?(t.liveHours||0):0));return{t,h,sum:h.reduce((a,b)=>a+b,0)}}).filter(r=>r.sum>0).sort((a,b)=>b.sum-a.sum);
    const tot=days.map((_,i)=>rows.reduce((s,r)=>s+r.h[i],0)),all=tot.reduce((a,b)=>a+b,0);
    const data=DD.weekByActivity(S.week),miss=S.week===0?missingTime():[];
    const over=tickets.filter(t=>isOpen(t)&&t.estimate&&hours(t)>t.estimate).sort((a,b)=>hours(b)/b.estimate-hours(a)/a.estimate);
    $('#v-timesheet').innerHTML=`<div class="tsw">
     <div class="panel" style="overflow:auto"><table class="ts"><thead><tr><th style="width:84px">Ticket</th><th>Title</th>${days.map(d=>`<th class="${d.getTime()===today?'today':''}">${d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}</th>`).join('')}<th>Week</th><th title="Estimate vs total logged">Est / actual</th></tr></thead>
      <tbody>${rows.map(r=>`<tr data-id="${r.t.id}"><td class="muted num">${r.t.id}</td><td class="ttl"><span style="display:inline-flex;gap:8px;align-items:center">${sIcon(r.t.status)}${esc(r.t.title)}</span></td>${r.h.map(v=>`<td class="${v?'':'z'}">${v?r1(v):'–'}</td>`).join('')}<td><b>${r1(r.sum)}</b></td><td style="${hours(r.t)>r.t.estimate?'color:var(--urgent)':''}">${r.t.estimate} / ${r1(hours(r.t))}</td></tr>`).join('')||`<tr><td colspan="11" class="empty">No time logged this week</td></tr>`}</tbody>
      <tfoot><tr><td></td><td class="muted">Total</td>${tot.map(v=>`<td>${v?r1(v):'–'}</td>`).join('')}<td>${r1(all)}</td><td></td></tr></tfoot></table></div>
     <div style="display:grid;gap:16px;align-content:start">
      <div class="panel"><div class="ph">By activity</div><div class="donut-wrap" style="grid-template-columns:1fr"><div class="chart" id="ch-donutTs" style="height:150px"></div>
        <ul class="legend">${data.filter(d=>d.value>0).map(d=>`<li><i style="background:${d.color}"></i><span>${d.name}</span><span class="h">${r1(d.value)} h</span><span class="p">${Math.round(d.value/(all||1)*100)}%</span></li>`).join('')||'<li class="muted">No entries</li>'}</ul></div></div>
      <div class="panel"><div class="ph" style="padding-bottom:8px">Missing time<span class="sp"></span><span class="muted num" style="font-weight:400">${miss.length}</span></div>
        ${miss.map(t=>`<div class="flag" data-log="${t.id}">${ic('clock','width:14px;height:14px;color:var(--urgent)')}<span style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${t.id} ${esc(t.title)}</span><span class="muted" style="font-size:12px">Log…</span></div>`).join('')||'<div class="flag muted" style="cursor:default">Every active ticket has recent time</div>'}</div>
      <div class="panel"><div class="ph" style="padding-bottom:8px">Over estimate<span class="sp"></span><span class="muted num" style="font-weight:400">${over.length}</span></div>
        ${over.slice(0,6).map(t=>`<div class="flag" data-go="#ticket/${t.id}">${sIcon(t.status)}<span style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${t.id} ${esc(t.title)}</span><span class="num" style="color:var(--urgent);font-size:12px">${Math.round(hours(t)/t.estimate*100)}%</span></div>`).join('')||'<div class="flag muted" style="cursor:default">Nothing over estimate</div>'}</div>
     </div></div>`;
    requestAnimationFrame(()=>Charts.render('donutTs',{data,sub:'this week'},{fresh}));
  }
};
$('#v-timesheet').addEventListener('click',e=>{const l=e.target.closest('[data-log]');if(l)openLog(l.dataset.log)});
$('#bar2').addEventListener('click',e=>{
  if(e.target.closest('#wkPrev')){S.week--;DD.renderAll(false)}
  if(e.target.closest('#wkNext')&&S.week<0){S.week++;DD.renderAll(false)}
  if(e.target.closest('#wkNow')){S.week=0;DD.renderAll(false)}
  if(e.target.closest('#wkLog'))openLog(S.timer.id||undefined);
});

/* ================= Insights ================= */
function ring(p){const r=7,c=2*Math.PI*r;return `<svg class="ring" viewBox="0 0 18 18"><circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--border-2)" stroke-width="2"/><circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="${(p*c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 9 9)" stroke-linecap="round"/></svg>`}
views.insights={
  crumb:()=>'<b>Insights</b>',
  bar2:()=>[30,90,180].map(d=>`<button class="pill ${S.range===d?'on':''}" data-r="${d}">${d} days</button>`).join(''),
  render(fresh){
    const P=M.progress(S.range),n=P.dates.length;
    const cl=M.closedIn(tickets,S.range),cyc=cl.map(M.cycleDays);
    const onTime=cl.length?Math.round(cl.filter(t=>M.closedAt(t)<=t.due).length/cl.length*100):0;
    const from=Date.now()-S.range*DAY,set=tickets.filter(t=>{const c=M.closedAt(t);return !c||c>=from});
    const key={project:t=>t.project,area:t=>t.area,tech:t=>t.tech}[S.brk];
    const rows=[...new Set(set.map(key))].map(k=>{const g=set.filter(t=>key(t)===k);return{k,n:g.length,p:g.length?g.filter(t=>!isOpen(t)).length/g.length:0}}).sort((a,b)=>b.n-a.n);
    const label=k=>S.brk==='project'?`${dot(prj(k).color)}<span class="n">${esc(prj(k).name)}</span>`:S.brk==='tech'?`${dot(TECH_COLOR[k])}<span class="n">${k}</span>`:`${ic('folder','width:15px;height:15px;color:var(--muted)')}<span class="n">${k}</span>`;
    $('#v-insights').innerHTML=`<div class="ins">
      <div style="display:grid;gap:18px;align-content:start">
        <div class="panel"><div class="ph">Progress<span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">started = work begun · dotted = projection at the current pace</span></div>
          <div class="legend3"><div><div class="l"><i style="background:var(--st-backlog)"></i>Scope</div><div class="v num">${P.scope[n-1]}</div></div>
            <div><div class="l"><i style="background:var(--st-prog)"></i>Started</div><div class="v num">${P.started[n-1]}<small>${Math.round(P.started[n-1]/P.scope[n-1]*100)}%</small></div></div>
            <div><div class="l"><i style="background:var(--accent)"></i>Completed</div><div class="v num">${P.done[n-1]}<small>${Math.round(P.done[n-1]/P.scope[n-1]*100)}%</small></div></div></div>
          <div style="padding:6px 8px 4px"><div class="chart" id="ch-progress"></div></div>
          <div style="display:flex;gap:24px;padding:4px 16px 16px;color:var(--muted);flex-wrap:wrap"><span>Typical time to finish <b class="t2">${Math.round(M.pct(cyc,.5))} d</b></span><span>85% within <b class="t2">${Math.round(M.pct(cyc,.85))} d</b></span><span>On time <b class="t2">${onTime}%</b></span></div></div>
        <div class="panel"><div class="ph">Hours per week<span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">dotted line = 40 h</span></div><div style="padding:6px 8px 8px"><div class="chart" style="height:190px" id="ch-hours"></div></div></div>
      </div>
      <div class="panel" style="align-self:start"><div class="tabs3">${[['project','Projects'],['area','Areas'],['tech','Tech']].map(([k,l])=>`<button data-b="${k}" class="${S.brk===k?'on':''}">${l}</button>`).join('')}</div>
        <ul class="brk">${rows.map(r=>`<li>${label(r.k)}${ring(r.p)}<span class="p">${Math.round(r.p*100)}% of ${r.n}</span></li>`).join('')}</ul></div>
    </div>`;
    requestAnimationFrame(()=>{Charts.render('progress',{days:S.range},{fresh:true});Charts.render('hours',{days:S.range},{fresh:true})});
  }
};
$('#v-insights').addEventListener('click',e=>{const b=e.target.closest('[data-b]');if(b){S.brk=b.dataset.b;views.insights.render(false)}});
$('#bar2').addEventListener('click',e=>{const r=e.target.closest('[data-r]');if(r){S.range=+r.dataset.r;DD.renderAll(true)}});

DD.boot();
})();
