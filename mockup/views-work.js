// Screens: Home, ticket list / board, ticket page.
(function(){
const {$,$$,esc,st,prj,act,byId,trById,objById,r1,TECH_COLOR,sIcon,pIcon,ic,ic14,dueHtml,prjChip,techTag,ago,toast,isOpen,hours,weekHours,missingTime,
  S,VIEWS,views,setStatus,setProp,logTime,menuFor,openNew,openLog,startTimer,toggleTimer,changed,dot}=DD;
const {DAY,STATUSES,PRIORITIES,ACTIVITIES,OBJECTS,ARTICLES,tickets,transports,startOfDay,ME}=TD;
const {M,fmtD}=Charts;
const PRIO_BADGE={Urgent:['var(--danger)','#fff'],High:['var(--urgent)','#1b1c1f'],Medium:['var(--st-todo)','#0f1011'],Low:['var(--hover)','var(--text-2)']};
const urgency=(a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)||a.due-b.due;

/* ================= Home ================= */
function weekByActivity(off=0){
  const a=DD.weekStart(off).getTime(),b=a+7*DAY,m={};
  for(const t of tickets)for(const w of t.worklog)if(w.date>=a&&w.date<b)m[w.activity]=(m[w.activity]||0)+w.hours;
  if(off===0)for(const t of tickets)if(t.liveHours){const k=t.status==='TEST'?'TEST':'CODE';m[k]=(m[k]||0)+t.liveHours}
  return ACTIVITIES.map(x=>({key:x.key,name:x.name,color:x.color,value:m[x.key]||0}));
}
function attention(){
  const out=[];
  tickets.filter(t=>isOpen(t)&&t.due<Date.now()).forEach(t=>out.push({id:t.id,icon:`<span style="color:var(--danger);display:grid">${ic14('alert')}</span>`,text:`${t.id} ${t.title}`,why:`${Math.ceil((Date.now()-t.due)/DAY)}d overdue`}));
  tickets.filter(t=>t.status==='BLOCK').forEach(t=>out.push({id:t.id,icon:sIcon('BLOCK'),text:`${t.id} ${t.title}`,why:'blocked'}));
  transports.filter(x=>x.qa&&x.qa.rc>4&&!x.prd).forEach(x=>out.push({id:x.ticket,icon:`<span style="color:var(--danger);display:grid">${ic14('truck')}</span>`,text:`${x.id} ${x.text}`,why:`QA RC ${x.qa.rc}`}));
  missingTime().forEach(t=>out.push({id:t.id,icon:`<span style="color:var(--urgent);display:grid">${ic14('clock')}</span>`,text:`${t.id} ${t.title}`,why:'no time logged'}));
  return out;
}
views.home={
  crumb:()=>'<b>Home</b>',
  render(fresh){
    const open=tickets.filter(isOpen),over=open.filter(t=>t.due<Date.now()),testing=open.filter(t=>t.status==='TEST'),wk=weekHours();
    const h=new Date().getHours();
    const focus=tickets.filter(t=>['TODO','PROG','TEST'].includes(t.status)).sort(urgency).slice(0,7);
    const att=attention();
    $('#v-home').innerHTML=`<div class="home">
      <h2>Good ${h<12?'morning':h<17?'afternoon':'evening'}, Himanshu</h2>
      <div class="subt">${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
      <div class="tiles">
        <a class="tile" href="#list/active"><div class="l">${ic14('my')}Open tickets</div><div class="v num">${open.length}</div><div class="s">across ${new Set(open.map(t=>t.project)).size} projects</div></a>
        <a class="tile" href="#list/overdue"><div class="l" style="${over.length?'color:var(--danger)':''}">${ic14('alert')}Overdue</div><div class="v num">${over.length}</div><div class="s">${over.length?'needs attention':'all on track'}</div></a>
        <a class="tile" href="#timesheet"><div class="l">${ic14('clock')}Hours this week</div><div class="v num"><span id="homeWeek">${r1(wk)}</span><span style="font-size:15px;color:var(--muted);font-weight:400"> h</span></div><div class="s">from work logs · target 40 h</div></a>
        <a class="tile" href="#list/active"><div class="l">${sIcon('TEST')}In testing</div><div class="v num">${testing.length}</div><div class="s">awaiting verification</div></a>
      </div>
      <div class="home-grid">
        <div class="panel focus"><div class="ph">My focus today<span class="sp"></span><a class="muted" href="#list/active" style="font-weight:400;font-size:12px">All open →</a></div><div style="height:10px"></div>
          ${focus.map(t=>{const [bg,fg]=PRIO_BADGE[t.priority];return `<div class="fi" data-id="${t.id}"><span class="badge" style="background:${bg};color:${fg}">${t.priority}</span>
            <div style="min-width:0"><div class="t1">${esc(t.title)}</div><div class="t2">${t.tech} · ${esc(prj(t.project).name)} · ${t.estimate} h estimated · ${r1(hours(t))} h logged</div></div>
            <div style="display:flex;align-items:center;gap:10px">${sIcon(t.status)}${dueHtml(t,true)}</div></div>`}).join('')||'<div class="empty">Nothing in progress.</div>'}
        </div>
        <div class="stack">
          <div class="panel"><div class="ph">Time this week<span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">by activity</span></div>
            <div class="donut-wrap"><div class="chart" id="ch-donut" style="height:150px"></div><ul class="legend" id="homeLegend"></ul></div></div>
          <div class="panel"><div class="ph">Needs attention<span class="sp"></span><span class="muted num" style="font-weight:400">${att.length}</span></div>
            <ul class="att">${att.slice(0,8).map(a=>`<li data-id="${a.id}">${a.icon}<span class="x">${esc(a.text)}</span><span class="muted" style="font-size:12px;white-space:nowrap">${a.why}</span></li>`).join('')||'<li class="muted">All clear</li>'}</ul></div>
        </div>
      </div></div>`;
    const data=weekByActivity(),tot=data.reduce((s,d)=>s+d.value,0)||1;
    $('#homeLegend').innerHTML=data.filter(d=>d.value>0).map(d=>`<li><i style="background:${d.color}"></i><span>${d.name}</span><span class="h">${r1(d.value)} h</span><span class="p">${Math.round(d.value/tot*100)}%</span></li>`).join('');
    requestAnimationFrame(()=>Charts.render('donut',{data},{fresh}));
  }
};

/* ================= Ticket list + board ================= */
const ORDER=['PROG','TEST','BLOCK','TODO','BACKLOG','DONE'];
function listSet(){
  const base=S.project?tickets.filter(t=>t.project===S.project):tickets;
  if(VIEWS[S.tab])return base.filter(VIEWS[S.tab].fn);
  if(S.tab==='active')return base.filter(t=>isOpen(t)&&t.status!=='BACKLOG');
  if(S.tab==='backlog')return base.filter(t=>t.status==='BACKLOG');
  return base;
}
function groups(){
  const set=listSet(),out=[];
  for(const k of ORDER){let g=set.filter(t=>t.status===k);if(k==='DONE')g=g.sort((a,b)=>M.closedAt(b)-M.closedAt(a)).slice(0,25);else g.sort(urgency);if(g.length)out.push([k,g])}
  return out;
}
const flatRows=()=>groups().flatMap(g=>g[1]);
views.list={
  crumb(){
    if(S.project){const p=prj(S.project);return `<span class="dot" style="width:9px;height:9px;border-radius:2px;background:${p.color}"></span><b>${esc(p.name)}</b>`}
    return VIEWS[S.tab]?`${VIEWS[S.tab].icon()}<b>${VIEWS[S.tab].name}</b>`:'<b>My tickets</b>';
  },
  bar2(){
    const base=S.project?`#project/${S.project}?`:'#list/';
    const pool=S.project?tickets.filter(t=>t.project===S.project):tickets;
    const tabs=VIEWS[S.tab]?`<span class="muted">${listSet().length} tickets</span>`:
      [['active','Active',t=>isOpen(t)&&t.status!=='BACKLOG'],['backlog','Backlog',t=>t.status==='BACKLOG'],['all','All',()=>true]].map(([k,l,f])=>`<a class="pill ${S.tab===k?'on':''}" href="${base}${k}">${l}<span class="c num">${pool.filter(f).length}</span></a>`).join('');
    return `${tabs}<span class="sp"></span><span class="muted" style="font-size:12px;margin-right:8px">${S.layout==='list'?'<kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open · <kbd>S</kbd> status':'Drag cards between columns'}</span>
      <div class="seg" id="layoutSeg"><button data-l="list" class="${S.layout==='list'?'on':''}" title="List">${ic14('list')}</button><button data-l="board" class="${S.layout==='board'?'on':''}" title="Board">${ic14('board')}</button></div>`;
  },
  render(){S.layout==='board'?renderBoard():renderList()},
  key(e,k){
    if(S.layout!=='list')return;const rows=flatRows();
    if(k==='j'||e.key==='ArrowDown'){S.sel=Math.min(rows.length-1,S.sel+1);renderList();$('.row.sel')?.scrollIntoView({block:'nearest'});e.preventDefault()}
    if(k==='k'||e.key==='ArrowUp'){S.sel=Math.max(0,S.sel-1);renderList();$('.row.sel')?.scrollIntoView({block:'nearest'});e.preventDefault()}
    if(e.key==='Enter'&&rows[S.sel])location.hash='#ticket/'+rows[S.sel].id;
    if(k==='s'&&rows[S.sel]){const t=rows[S.sel];menuFor('status',t,$('.row.sel [data-menu="status"]'),v=>setStatus(t,v))}
  }
};
function renderList(){
  $('#v-list').innerHTML=groups().map(([k,g])=>{const s=st(k),over=s.wip&&g.length>s.wip;
    return `<div class="grp">${sIcon(k)}${s.name}<span class="c">${g.length}</span>${over?`<span class="warn">${ic('alert','width:13px;height:13px')}over WIP limit of ${s.wip}</span>`:''}<span class="sp"></span><button class="ib" data-newin="${k}" title="New ticket in ${s.name}">${ic('plus')}</button></div>`+
    g.map(t=>`<div class="row" data-id="${t.id}">
      <span data-menu="priority" title="${t.priority}">${pIcon(t.priority)}</span><span class="id num">${t.id}</span><span data-menu="status" title="${s.name}">${sIcon(t.status)}</span>
      <span class="ttl">${esc(t.title)}<small>${esc(t.requester)}</small></span><span style="display:flex;gap:6px">${techTag(t.tech)}${prjChip(t.project)}</span>
      <span class="x muted" style="font-size:12px;display:inline-flex;align-items:center;gap:4px" title="Transports">${t.transports.length?ic('truck','width:13px;height:13px')+t.transports.length:''}</span>
      <span style="text-align:right">${dueHtml(t,true)}</span><span class="dt">${fmtD(t.created)}</span></div>`).join('')
  }).join('')||`<div class="empty">No tickets here. Press <kbd>C</kbd> to create one.</div>`;
  $$('#v-list .row').forEach((r,i)=>r.classList.toggle('sel',i===S.sel));
}
function renderBoard(){
  const set=listSet();
  const cols=STATUSES.map(s=>s.key).filter(k=>(k!=='DONE'||['all','done'].includes(S.tab))&&(k!=='BACKLOG'||S.tab!=='active'));
  $('#v-list').innerHTML=`<div class="board">${cols.map(k=>{const s=st(k);const g=set.filter(t=>t.status===k).sort(urgency);const over=s.wip&&g.length>s.wip;
    return `<div class="col" data-status="${k}" style="--c:var(${s.color})"><div class="col-h">${sIcon(k)}${s.name}<span class="c">${g.length}</span><span class="sp"></span>${s.wip?`<span class="wip ${over?'over':''}" title="WIP limit">${g.length}/${s.wip}</span>`:''}<button class="ib" data-newin="${k}">${ic('plus')}</button></div>
    ${g.slice(0,k==='DONE'?20:99).map(t=>`<div class="card" draggable="true" data-id="${t.id}">
      <div class="t" style="margin-top:0"><span>${esc(t.title)}</span></div>
      <div class="tags">${techTag(t.tech)}<span class="tag">${t.area}</span>${t.type==='Bug'?'<span class="tag" style="background:rgba(235,87,87,.16);color:var(--danger)">Bug</span>':''}</div>
      <div class="r3"><span class="muted num" style="font-size:12px">${t.id}</span><span data-menu="priority">${pIcon(t.priority)}</span>${dueHtml(t,true)}<span class="sp"></span><span class="muted num" style="font-size:12px">${r1(hours(t))}/${t.estimate}h</span><span class="av" style="width:18px;height:18px;font-size:8px;${t.assignee===ME?'':'background:var(--hover);color:var(--muted)'}" title="${esc(t.assignee)}">${t.assignee===ME?'HS':'?'}</span></div></div>`).join('')}</div>`}).join('')}</div>`;
}
let dragId=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('.card');if(c){dragId=c.dataset.id;c.classList.add('dragging')}});
document.addEventListener('dragend',e=>{e.target.closest?.('.card')?.classList.remove('dragging');$$('.col').forEach(c=>c.classList.remove('drop'));dragId=null});
document.addEventListener('dragover',e=>{const col=e.target.closest?.('.col');if(col&&dragId){e.preventDefault();$$('.col').forEach(c=>c.classList.toggle('drop',c===col))}});
document.addEventListener('drop',e=>{const col=e.target.closest?.('.col');if(col&&dragId){e.preventDefault();setStatus(byId(dragId),col.dataset.status)}});
$('#bar2').addEventListener('click',e=>{const l=e.target.closest('[data-l]');if(l){S.layout=l.dataset.l;try{localStorage.setItem('devdesk-layout',S.layout)}catch(_){}DD.renderAll(true)}});

/* ================= Ticket page ================= */
function stepTicket(d){const rows=flatRows();const i=rows.findIndex(r=>r.id===S.ticket);const n=rows[Math.min(rows.length-1,Math.max(0,i+d))];if(n)location.hash='#ticket/'+n.id}
const trEnv=x=>`<span class="envs"><b class="ok">DEV</b><b class="${x.qa?x.qa.rc>4?'err':'ok':''}">${x.qa&&x.qa.rc>4?'QA rc '+x.qa.rc:'QA'}</b><b class="${x.prd?'ok':''}">PRD</b></span>`;
views.ticket={
  crumb(){const t=byId(S.ticket);const ll=S.lastList.startsWith('#project')?prj(S.lastList.split('/')[1].split('?')[0]).name:'My tickets';
    return `<a href="${S.lastList}">${esc(ll)}</a><span class="sepr">›</span><b>${t?t.id:''}</b>${t?`<span class="muted" style="font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>`:''}`},
  bar1Right(){const rows=flatRows(),i=rows.findIndex(r=>r.id===S.ticket);
    return `<span class="muted num" style="font-size:12px;margin-right:4px">${i>=0?`${i+1} / ${rows.length}`:''}</span><button class="ib" data-step="-1" title="Previous (K)">${ic('up')}</button><button class="ib" data-step="1" title="Next (J)">${ic('down')}</button>`},
  render(){
    const t=byId(S.ticket);if(!t){$('#v-ticket').innerHTML='<div class="empty">Ticket not found</div>';return}
    const hrs=hours(t),timerOn=S.timer.id===t.id,trs=t.transports.map(trById).filter(Boolean);
    const tab=S.ttab,tests=t.tests,passed=tests.filter(x=>x.status==='pass').length,chk=t.checklist.filter(c=>c.done).length;
    const prop=(label,html)=>`<div class="prop"><span>${label}</span>${html}</div>`;
    const btn=(k,html)=>`<button class="pv" data-menu="${k}">${html}</button>`;
    const acts=[...t.history.map((h,i)=>({at:h.at,html:i?`<b>Himanshu</b> moved to ${sIcon(h.status)} <b>${st(h.status).name}</b>`:'<b>Himanshu</b> created the ticket',ico:i?sIcon(h.status):ic14('plus')})),
      ...t.worklog.slice(-8).map(w=>({at:new Date(w.date.getTime()+17*36e5),html:`<b>Himanshu</b> logged ${w.hours}h · ${act(w.activity).name}${w.comment?' – '+esc(w.comment):''}`,ico:ic14('clock')})),
      ...trs.flatMap(x=>[x.qa&&{at:x.qa.date,html:`${x.id} imported to QA · RC ${x.qa.rc}`,ico:ic14('truck')},x.prd&&{at:x.prd.date,html:`${x.id} imported to PRD`,ico:ic14('truck')}].filter(Boolean)),
      ...t.comments.map(c=>({at:c.at,note:c.text}))].sort((a,b)=>a.at-b.at);
    const linkedKb=ARTICLES.filter(a=>a.tickets.includes(t.id));
    $('#v-ticket').innerHTML=`<div class="tp">
     <div class="tp-main">
      <div class="muted" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">${prjChip(t.project)}${techTag(t.tech)}<span class="tag">${t.type}</span></div>
      <h1 class="tp-title" contenteditable="true" spellcheck="false" id="tTitle">${esc(t.title)}</h1>
      <div class="tp-desc" contenteditable="true" id="tDesc" data-ph="Add description…">${esc(t.description)}</div>
      <div class="tp-tabs">${[['overview','Overview'],['tests',`Tests & checklist <span class="muted num">${passed}/${tests.length} · ${chk}/${t.checklist.length}</span>`],['sap',`SAP objects & transports <span class="muted num">${t.objects.length} · ${trs.length}</span>`],['activity',`Activity <span class="muted num">${t.comments.length}</span>`]]
        .map(([k,l])=>`<button data-ttab="${k}" class="${tab===k?'on':''}">${l}</button>`).join('')}</div>

      <div ${tab==='overview'?'':'hidden'}>
        <div class="tp-sec" style="margin-top:6px"><h4>Acceptance criteria<span class="c">${t.acceptance.length}</span></h4>
          <div class="sub">${t.acceptance.map((a,i)=>`<div class="it">${ic('check','width:14px;height:14px;color:var(--muted)')}<span class="lbl">${esc(a)}</span></div>`).join('')}
            <div class="add">${ic14('plus')}<input id="accAdd" placeholder="Add acceptance criterion and press Enter"></div></div></div>
        <div class="tp-sec"><h4>Attachments<span class="c">${t.attachments.length}</span></h4>
          <div class="files">${t.attachments.map(f=>`<span class="file">${ic14('file')}${esc(f.name)}<span class="muted">${f.size}</span></span>`).join('')}<span class="dropz">Drop files or paste a screenshot (Ctrl+V)</span></div></div>
        ${linkedKb.length?`<div class="tp-sec"><h4>Knowledge</h4><div class="sub">${linkedKb.map(a=>`<a class="it" href="#kb/${a.id}">${ic14('book')}<span>${esc(a.title)}</span><span class="sp"></span><span class="tag">${a.type}</span></a>`).join('')}</div></div>`:''}
      </div>

      <div ${tab==='tests'?'':'hidden'}>
        <div class="tp-sec" style="margin-top:6px"><h4>Test cases<span class="c">${passed}/${tests.length} passed</span><span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">click a result to change it</span></h4>
          <div class="sub">${tests.map((x,i)=>`<div class="tst"><div style="min-width:0"><div style="font-weight:500">${esc(x.name)}</div><div class="muted" style="font-size:12px">${esc(x.steps||'No steps yet')} · expected: ${esc(x.expected)}</div></div><button class="res ${x.status}" data-test="${i}">${x.status==='pass'?'Passed':x.status==='fail'?'Failed':'Open'}</button></div>`).join('')||'<div class="add">No test cases – they are created from the acceptance criteria.</div>'}</div></div>
        <div class="tp-sec"><h4>Release checklist<span class="c">${chk}/${t.checklist.length}</span></h4>
          <div class="sub">${t.checklist.map((c,i)=>`<div class="it ${c.done?'done':''}" data-chk="${i}" style="cursor:pointer">${c.done?sIcon('DONE'):sIcon('TODO')}<span class="chkcat">${c.cat}</span><span class="lbl">${esc(c.text)}</span></div>`).join('')}</div></div>
      </div>

      <div ${tab==='sap'?'':'hidden'}>
        <div class="tp-sec" style="margin-top:6px"><h4>Technical objects<span class="c">${t.objects.length}</span><span class="sp"></span><button class="pill" id="addObj" style="height:24px">${ic14('plus')}Link object</button></h4>
          <div class="sub">${t.objects.map(objById).map(o=>`<a class="it" href="#objects/${o.id}"><span class="otype">${o.type}</span><span class="mono">${esc(o.name)}</span><span class="muted" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(o.desc)}</span><span class="sp"></span>${ic('graph','width:14px;height:14px;color:var(--muted)')}</a>`).join('')||'<div class="add">No objects linked</div>'}</div></div>
        <div class="tp-sec"><h4>Transports<span class="c">${trs.length}</span><span class="sp"></span><span class="muted" style="font-weight:400;font-size:12px">DEV → QA → PRD</span></h4>
          <div class="sub">${trs.map(x=>`<div class="it" data-tr="${x.id}" style="cursor:pointer"><span class="mono">${x.id}</span><span class="t2" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(x.text)}</span><span class="sp"></span>${trEnv(x)}</div>`).join('')}
            <div class="add">${ic14('plus')}<input id="trAdd" class="mono" placeholder="Link transport, e.g. DEVK912500 (details come from E070 / E071)"></div></div></div>
      </div>

      <div ${tab==='activity'?'':'hidden'}>
        <ul class="acts" style="margin-top:6px">${acts.map(a=>a.note!=null?`<li class="note"><div class="h"><span class="av" style="width:18px;height:18px;font-size:8.5px">HS</span><b style="color:var(--text-2)">Himanshu</b><span>${ago(a.at.getTime())}</span></div>${esc(a.note)}</li>`
          :`<li><span class="ico">${a.ico}</span><span>${a.html}<span class="when">· ${ago(a.at.getTime())}</span></span></li>`).join('')}</ul>
        <div class="comment"><textarea id="cmt" placeholder="Leave a comment…"></textarea><div class="f" style="gap:8px"><button class="btn" id="toKb" title="Save the fix as a knowledge article">${ic14('book')}Save as fix</button><button class="btn" id="cmtBtn">Comment</button></div></div>
      </div>
     </div>
     <aside class="props">
      ${prop('Status',btn('status',sIcon(t.status)+st(t.status).name))}
      ${prop('Priority',btn('priority',pIcon(t.priority)+t.priority))}
      ${prop('Assignee',btn('assignee',`<span class="av" style="width:18px;height:18px;font-size:8px">${t.assignee===ME?'HS':'?'}</span>${esc(t.assignee)}`))}
      ${prop('Due date',`<label class="pv">${ic('cal','width:14px;height:14px;color:var(--muted)')}<input type="date" data-p="due" value="${t.due.toISOString().slice(0,10)}"></label>`)}
      ${prop('','<span style="padding-left:8px">'+dueHtml(t)+'</span>')}
      <div class="h">Classification</div>
      ${prop('Project',btn('project',dot(prj(t.project).color)+esc(prj(t.project).name)))}
      ${prop('Area',btn('area',ic('folder','width:14px;height:14px;color:var(--muted)')+t.area))}
      ${prop('Tech',btn('tech',dot(TECH_COLOR[t.tech])+t.tech))}
      ${prop('Type',btn('type',ic('tag','width:14px;height:14px;color:var(--muted)')+t.type))}
      ${prop('Environment',btn('environment',ic('env','width:14px;height:14px;color:var(--muted)')+t.environment))}
      ${prop('Requester',`<label class="pv">${ic('user','width:14px;height:14px;color:var(--muted)')}<input data-p="requester" value="${esc(t.requester)}"></label>`)}
      <div class="h">Time</div>
      ${prop('Estimate',`<label class="pv"><input type="number" min="0" step="0.5" data-p="estimate" value="${t.estimate}" style="width:56px"><span class="muted">h</span></label>`)}
      ${prop('Actual',`<span class="pv num" style="cursor:default">${r1(hrs)} h<span class="muted" style="font-weight:400">${t.estimate?` · ${Math.round(hrs/t.estimate*100)}%`:''}</span></span>`)}
      <div class="meter"><i style="width:${Math.min(100,t.estimate?hrs/t.estimate*100:0)}%;${hrs>t.estimate?'background:var(--urgent)':''}"></i></div>
      <div style="display:flex;gap:6px;padding:10px 8px 0"><button class="btn" id="tTimer" style="flex:1">${ic(timerOn&&S.timer.running?'pause':'play','width:13px;height:13px')}${timerOn?(S.timer.running?'Timer running':'Resume'):'Start timer'}</button><button class="btn" id="tLog">Log…</button></div>
     </aside></div>`;
  },
  key(e,k){
    if(k==='j')stepTicket(1);if(k==='k')stepTicket(-1);
    const t=byId(S.ticket);if(!t)return;
    if(k==='s'){menuFor('status',t,$('.props [data-menu="status"]'),v=>setStatus(t,v));e.preventDefault()}
    if(k==='p'){menuFor('priority',t,$('.props [data-menu="priority"]'),v=>setProp(t,'priority',v));e.preventDefault()}
  }
};
$('#bar1Right').addEventListener('click',e=>{const s=e.target.closest('[data-step]');if(s)stepTicket(+s.dataset.step)});
const vt=$('#v-ticket');
vt.addEventListener('click',e=>{
  const t=byId(S.ticket);if(!t)return;
  const tb=e.target.closest('[data-ttab]');if(tb){S.ttab=tb.dataset.ttab;views.ticket.render();return}
  const chk=e.target.closest('[data-chk]');if(chk){const c=t.checklist[chk.dataset.chk];c.done=!c.done;changed();return}
  const ts=e.target.closest('[data-test]');if(ts){const x=t.tests[ts.dataset.test];x.status={open:'pass',pass:'fail',fail:'open'}[x.status];changed();return}
  const tr=e.target.closest('[data-tr]');if(tr){views.transports.panel(tr.dataset.tr);return}
  if(e.target.closest('#tTimer')){S.timer.id===t.id?toggleTimer():startTimer(t.id);views.ticket.render();return}
  if(e.target.closest('#tLog')){openLog(t.id);return}
  if(e.target.closest('#addObj')){DD.openMenu(e.target.closest('#addObj'),OBJECTS.filter(o=>!t.objects.includes(o.id)).map(o=>({label:`${o.type} ${o.name}`,value:o.id,icon:`<span class="otype">${o.type}</span>`})),v=>{t.objects.push(v);changed()});return}
  if(e.target.closest('#cmtBtn')){const v=$('#cmt').value.trim();if(v){t.comments.push({at:new Date(),text:v});DD.pushActivity({kind:'comment',id:t.id,text:v});$('#cmt').value='';changed()}}
  if(e.target.closest('#toKb')){const id='KB-'+(ARTICLES.length+1);
    ARTICLES.unshift({id,type:'Error & fix',title:'Fix: '+t.title,tags:[t.tech],objects:[...t.objects],tickets:[t.id],created:new Date(),error:$('#cmt').value.trim()||'Describe the error…',rootCause:'',location:'',fix:'',test:''});
    toast(`${ic('book')} Article ${id} created`);location.hash='#kb/'+id}
});
vt.addEventListener('change',e=>{const t=byId(S.ticket),p=e.target.dataset.p;if(!t||!p)return;
  setProp(t,p,p==='due'?new Date(e.target.value+'T17:00'):p==='estimate'?+e.target.value:e.target.value)});
vt.addEventListener('keydown',e=>{
  const t=byId(S.ticket);if(!t)return;
  if(e.target.id==='accAdd'&&e.key==='Enter'&&e.target.value.trim()){const v=e.target.value.trim();t.acceptance.push(v);t.tests.push({name:v,steps:'',expected:v,actual:'',status:'open'});e.target.blur();changed();setTimeout(()=>$('#accAdd')?.focus())}
  if(e.target.id==='trAdd'&&e.key==='Enter'){const v=e.target.value.trim().toUpperCase();
    if(!/^[A-Z0-9]{3}K\d{6}$/.test(v)){toast(`${ic('alert')} Not a transport number`);return}
    transports.push({id:v,text:t.title.slice(0,44),ticket:t.id,owner:'HSUDRA',kind:'Workbench',created:new Date(),released:null,qa:null,prd:null,objects:[...t.objects],dependsOn:[],evidence:'',notes:'',rollback:''});
    t.transports.push(v);e.target.blur();toast('Transport linked');changed()}
  if(e.target.id==='tTitle'&&e.key==='Enter'){e.preventDefault();e.target.blur()}
});
vt.addEventListener('focusout',e=>{const t=byId(S.ticket);if(!t)return;
  if(e.target.id==='tTitle'){const v=e.target.innerText.trim();if(v&&v!==t.title)setProp(t,'title',v)}
  if(e.target.id==='tDesc'){const v=e.target.innerText.trim();if(v!==t.description){t.description=v;S.lastUpd=Date.now()}}
});
DD.flatRows=flatRows;DD.weekByActivity=weekByActivity;DD.attention=attention;
})();
