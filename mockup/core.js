// SLATE·SPACE mockup core: helpers, icons, state, mutations, menus, router, sidebar, palette, timer, live updates.
// Screens live in views-*.js and register themselves in DD.views.
(function(){
const {DAY,STATUSES,PRIORITIES,TYPES,PROJECTS,AREAS,TECHS,ENVS,ACTIVITIES,OBJECTS,ARTICLES,tickets,transports,startOfDay,ME}=TD;
const {M,fmtD}=Charts;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const st=k=>STATUSES.find(s=>s.key===k);
const prj=k=>PROJECTS.find(p=>p.key===k);
const act=k=>ACTIVITIES.find(a=>a.key===k);
const byId=id=>tickets.find(t=>t.id===id);
const trById=id=>transports.find(x=>x.id===id);
const objById=id=>OBJECTS.find(o=>o.id===id);
const r1=x=>Math.round(x*10)/10;
const TECH_COLOR={RAP:'#5e6ad2',CDS:'#26b5ce',ABAP:'#8a8f98',OData:'#4cb782',Fiori:'#bb87fc',Integration:'#f2994a',Form:'#e5a3c0'};

/* ---------- Icons ---------- */
function pie(f){
  if(f>=1)return '<circle cx="7" cy="7" r="3.6" fill="currentColor"/>';
  const a=f*2*Math.PI,x=7+3.6*Math.sin(a),y=7-3.6*Math.cos(a);
  return `<path d="M7 7 L7 3.4 A3.6 3.6 0 ${f>.5?1:0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z" fill="currentColor"/>`;
}
function sIcon(key){
  const s=st(key),c=`var(${s.color})`,ring='<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  const wrap=b=>`<svg class="si" viewBox="0 0 14 14" style="color:${c}">${b}</svg>`;
  switch(s.icon){
    case 'dashed':return wrap('<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 1.8"/>');
    case 'empty':return wrap(ring);
    case 'half':return wrap(ring+pie(.5));
    case 'three':return wrap(ring+pie(.75));
    case 'blocked':return wrap('<circle cx="7" cy="7" r="7" fill="currentColor"/><path d="M3.8 7h6.4" stroke="var(--panel)" stroke-width="1.8" stroke-linecap="round"/>');
    case 'done':return wrap('<circle cx="7" cy="7" r="7" fill="currentColor"/><path d="M4.2 7.2l1.9 1.9 3.8-4" fill="none" stroke="var(--panel)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');
  }
}
function pIcon(p){
  if(p==='Urgent')return `<svg class="pi" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="3.5" fill="var(--urgent)"/><path d="M8 4.2v4.6M8 11.3v.2" stroke="var(--panel)" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const lv={High:3,Medium:2,Low:1}[p]||0;
  return `<svg class="pi" viewBox="0 0 16 16">${[0,1,2].map(i=>`<rect x="${2+i*4.5}" y="${10-i*3.5}" width="3" height="${4+i*3.5}" rx="1" fill="${i<lv?'var(--text-2)':'var(--faint)'}"/>`).join('')}</svg>`;
}
const I={ // Lucide icons (ISC, see vendor/LUCIDE-LICENSE.txt), same set as the React app
  home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>',
  my:'<path d="M10.1 2.182a10 10 0 0 1 3.8 0"></path><path d="M13.9 21.818a10 10 0 0 1-3.8 0"></path><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"></path><path d="M2.182 13.9a10 10 0 0 1 0-3.8"></path><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"></path><path d="M21.818 10.1a10 10 0 0 1 0 3.8"></path><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"></path><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"></path>',
  truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path><path d="M15 18H9"></path><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path><circle cx="17" cy="18" r="2"></circle><circle cx="7" cy="18" r="2"></circle>',
  cube:'<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path>',
  book:'<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  clock:'<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"></path><rect x="15" y="5" width="4" height="12" rx="1"></rect><rect x="7" y="8" width="4" height="9" rx="1"></rect>',
  move:'<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
  plus:'<path d="M5 12h14"></path><path d="M12 5v14"></path>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
  list:'<path d="M3 12h.01"></path><path d="M3 18h.01"></path><path d="M3 6h.01"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M8 6h13"></path>',
  board:'<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="M15 3v18"></path>',
  play:'<polygon points="6 3 20 12 6 21 6 3"></polygon>',
  pause:'<rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect>',
  stop:'<rect width="18" height="18" x="3" y="3" rx="2"></rect>',
  up:'<path d="m18 15-6-6-6 6"></path>',
  down:'<path d="m6 9 6 6 6-6"></path>',
  link:'<path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" x2="16" y1="12" y2="12"></line>',
  tr:'<path d="M15 12H3"></path><path d="M17 18H3"></path><path d="M21 6H3"></path>',
  cal:'<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  tag:'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle>',
  check:'<path d="M20 6 9 17l-5-5"></path>',
  search:'<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
  filter:'<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path>',
  x:'<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
  folder:'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>',
  bug:'<path d="m8 2 1.88 1.88"></path><path d="M14.12 3.88 16 2"></path><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"></path><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"></path><path d="M12 20v-9"></path><path d="M6.53 9C4.6 8.8 3 7.1 3 5"></path><path d="M6 13H2"></path><path d="M3 21c0-2.1 1.7-3.9 3.8-4"></path><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"></path><path d="M22 13h-4"></path><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"></path>',
  env:'<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line>',
  file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
  graph:'<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>',
  sun:'<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
  edit:'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path>',
  loader:'<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>'
};
const ic=(n,style='')=>`<svg class="i" data-icon="${n}" viewBox="0 0 24 24" style="${style}">${I[n]}</svg>`;
// icons written straight into index.html are filled from the same map
document.querySelectorAll('svg.i[data-icon]').forEach(s=>{if(!s.innerHTML.trim())s.innerHTML=I[s.dataset.icon]});
const ic14=n=>ic(n,'width:14px;height:14px');
function dueHtml(t,short){
  if(t.status==='DONE')return `<span class="due muted">${fmtD(t.due)}</span>`;
  const d=Math.ceil((startOfDay(t.due)-startOfDay(new Date()))/DAY);
  if(d<0)return `<span class="due over" title="Overdue">${ic('alert','width:13px;height:13px')}${-d}d late</span>`;
  if(d===0)return `<span class="due soon">Today</span>`;
  if(d<=3)return `<span class="due soon">${short?'':'in '}${d}d</span>`;
  return `<span class="due">${fmtD(t.due)}</span>`;
}
const prjChip=k=>{const p=prj(k);return p?`<span class="chip"><i style="background:${p.color}"></i>${esc(p.name)}</span>`:''};
const techTag=k=>`<span class="tag" style="background:${TECH_COLOR[k]}26;color:${TECH_COLOR[k]}">${k}</span>`;
const ago=ms=>{const s=(Date.now()-ms)/1e3;if(s<45)return'just now';if(s<3600)return Math.round(s/60)+'m ago';if(s<86400)return Math.round(s/3600)+'h ago';return Math.round(s/86400)+'d ago'};
function toast(html){const el=$('#toast');el.innerHTML=html;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),2200)}
const isOpen=t=>t.status!=='DONE';
const hours=t=>t.worklog.reduce((s,w)=>s+w.hours,0)+(t.liveHours||0);
const weekStart=(off=0)=>{const t=startOfDay(new Date());return new Date(t.getTime()-((t.getDay()+6)%7)*DAY+off*7*DAY)};
function weekHours(off=0){const a=weekStart(off).getTime(),b=a+7*DAY;let h=0;for(const t of tickets)for(const w of t.worklog)if(w.date>=a&&w.date<b)h+=w.hours;return h+(off===0?tickets.reduce((s,t)=>s+(t.liveHours||0),0):0)}
// open tickets being worked on without time logged in the last 2 working days
function missingTime(){
  const lim=[];let d=startOfDay(new Date()).getTime();while(lim.length<2){d-=DAY;if(TD.isWork(d))lim.push(d)}
  return tickets.filter(t=>['PROG','TEST'].includes(t.status)&&t.id!==S.timer.id&&!t.worklog.some(w=>w.date.getTime()>=lim[1]))
}

/* ---------- State ---------- */
const S={view:'home',tab:'active',project:null,layout:'board',sel:0,ticket:null,lastList:'#list/active',ttab:'overview',
  inboxSel:null,inboxFilter:'all',range:90,brk:'project',week:0,lastUpd:Date.now(),
  timer:{id:null,start:0,acc:0,running:false},activity:[],read:new Set(),
  trProject:'all',trSel:null,obj:null,objQ:'',objType:'all',kbQ:'',kbTypes:new Set(),kbRange:'all',kbTags:new Set(),kbArticle:null};
try{S.layout=localStorage.getItem('devdesk-layout')||'board'}catch(e){}

/* ---------- Activity + mutations (single place, so every screen stays in sync) ---------- */
function seedActivity(){
  const ev=[];
  for(const t of tickets){
    t.history.forEach((h,i)=>ev.push({at:h.at.getTime(),id:t.id,kind:i?'move':'new',to:h.status}));
    t.comments.forEach(c=>ev.push({at:c.at.getTime(),id:t.id,kind:'comment',text:c.text}));
  }
  for(const x of transports){
    if(x.qa)ev.push({at:x.qa.date.getTime()+36e5,id:x.ticket,kind:x.qa.rc>4?'trfail':'tr',tr:x.id,sys:'QA',rc:x.qa.rc});
    if(x.prd)ev.push({at:x.prd.date.getTime()+36e5,id:x.ticket,kind:'tr',tr:x.id,sys:'PRD',rc:x.prd.rc});
  }
  ev.sort((a,b)=>b.at-a.at);S.activity=ev.slice(0,50);
  S.activity.slice(8).forEach(e=>S.read.add(e.at+e.id+e.kind));
}
function pushActivity(e){S.activity.unshift({at:Date.now(),...e});S.activity.length=Math.min(S.activity.length,80)}
function setStatus(t,to,{silent=false}={}){
  if(!t||t.status===to)return;
  t.history.push({status:to,at:new Date()});t.status=to;
  if(to==='TEST')for(const x of transports.filter(x=>x.ticket===t.id&&!x.released)){x.released=new Date()}
  pushActivity({kind:'move',id:t.id,to});
  if(!silent)toast(`${sIcon(to)} ${t.id} moved to ${st(to).name}`);
  changed();
}
function setProp(t,k,v){if(!t||t[k]===v)return;t[k]=v;pushActivity({kind:'prop',id:t.id,prop:k});changed()}
function logTime(t,h,activity,date,comment=''){
  t.worklog.push({date:startOfDay(date||new Date()),hours:h,activity:activity||(t.status==='TEST'?'TEST':t.status==='TODO'?'ANA':'CODE'),comment});
  pushActivity({kind:'time',id:t.id,hours:h});changed();
}

/* ---------- Popover menu ---------- */
let menuCb=null,menuItems=[],menuSel=0,menuAnchor=null;
function openMenu(anchor,items,cb,{search=true}={}){
  menuCb=cb;menuItems=items;menuSel=Math.max(0,items.findIndex(i=>i.checked));
  const m=$('#menu');m.innerHTML=(search?'<input placeholder="Change to…" id="menuQ">':'')+'<div id="menuL"></div>';
  drawMenu('');m.classList.add('on');
  menuAnchor?.setAttribute('aria-expanded','false');menuAnchor=anchor;anchor.setAttribute('aria-expanded','true');
  const r=anchor.getBoundingClientRect(),h=m.offsetHeight,w=m.offsetWidth;
  m.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';m.style.top=(r.bottom+h+8>innerHeight?Math.max(8,r.top-h-4):r.bottom+4)+'px';
  if(search){const q=$('#menuQ');q.focus();q.oninput=()=>{menuSel=0;drawMenu(q.value)}}
}
function drawMenu(q){
  const vis=menuItems.filter(i=>!q||i.label.toLowerCase().includes(q.toLowerCase()));
  $('#menuL').innerHTML=vis.map((it,n)=>`<div class="mi ${n===menuSel?'sel':''}" data-v="${esc(it.value)}">${it.icon||''}<span>${esc(it.label)}</span>${it.checked?`<span class="ck">${ic('check')}</span>`:''}</div>`).join('');
  menuItems._vis=vis;
}
function closeMenu(){$('#menu').classList.remove('on');menuCb=null;menuAnchor?.setAttribute('aria-expanded','false');menuAnchor=null}
$('#menu').addEventListener('click',e=>{const mi=e.target.closest('.mi');if(mi&&menuCb){const cb=menuCb;closeMenu();cb(mi.dataset.v)}});
document.addEventListener('mousedown',e=>{if(!e.target.closest('#menu')&&!e.target.closest('[data-menu]'))closeMenu()});
const dot=c=>`<span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block;margin:0 3px"></span>`;
const MENUS={
  status:t=>STATUSES.map(s=>({label:s.name,value:s.key,icon:sIcon(s.key),checked:t.status===s.key})),
  priority:t=>PRIORITIES.map(p=>({label:p,value:p,icon:pIcon(p),checked:t.priority===p})),
  project:t=>PROJECTS.map(p=>({label:p.name,value:p.key,icon:dot(p.color),checked:t.project===p.key})),
  area:t=>AREAS.map(a=>({label:a,value:a,icon:ic14('folder'),checked:t.area===a})),
  tech:t=>TECHS.map(x=>({label:x,value:x,icon:dot(TECH_COLOR[x]),checked:t.tech===x})),
  type:t=>TYPES.map(x=>({label:x,value:x,icon:ic14('tag'),checked:t.type===x})),
  environment:t=>ENVS.map(x=>({label:x,value:x,icon:ic14('env'),checked:t.environment===x})),
  assignee:t=>[ME,'Unassigned'].map(x=>({label:x,value:x,icon:ic14('user'),checked:t.assignee===x}))
};
function menuFor(kind,t,anchor,apply){openMenu(anchor,MENUS[kind](t),apply)}

/* ---------- Sidebar ---------- */
const VIEWS={
  overdue:{name:'Overdue',icon:()=>`<span style="color:var(--danger);display:grid">${ic('alert')}</span>`,fn:t=>isOpen(t)&&t.due<Date.now()},
  week:{name:'Due this week',icon:()=>ic('cal'),fn:t=>isOpen(t)&&t.due>=Date.now()&&t.due<=Date.now()+7*DAY},
  blocked:{name:'Blocked',icon:()=>sIcon('BLOCK'),fn:t=>t.status==='BLOCK'},
  done:{name:'Recently done',icon:()=>sIcon('DONE'),fn:t=>{const c=M.closedAt(t);return c&&c>=Date.now()-14*DAY}}
};
function renderSide(){
  const nav=[['home','Home','home'],['inbox','Inbox','bell'],['list/active','My tickets','my'],['transports','Transports','truck'],['objects','Objects','cube'],['kb','Knowledge','book'],['timesheet','Timesheet','clock'],['insights','Insights','chart']];
  const unread=DD.views.inbox.items().filter(n=>!S.read.has(n.key)).length;
  $('#navMain').innerHTML=nav.map(([h,l,i])=>`<a class="ni" href="#${h}" data-nav="${h}">${ic(i)}${l}<span class="c num">${h==='inbox'?unread||'':h==='list/active'?tickets.filter(t=>isOpen(t)&&t.status!=='BACKLOG').length:''}</span></a>`).join('');
  $('#navViews').innerHTML=Object.entries(VIEWS).map(([k,v])=>`<a class="ni" href="#list/${k}" data-nav="list/${k}">${v.icon()}${v.name}<span class="c num">${tickets.filter(v.fn).length||''}</span></a>`).join('');
  $('#navProjects').innerHTML=PROJECTS.map(p=>`<a class="ni" href="#project/${p.key}" data-nav="project/${p.key}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<span class="c num">${tickets.filter(t=>t.project===p.key&&isOpen(t)).length||''}</span></a>`).join('');
  const cur=location.hash.slice(1)||'home';
  $$('.ni').forEach(a=>{const n=a.dataset.nav;a.classList.toggle('active',
    n===cur||(n==='list/active'&&['list/backlog','list/all'].includes(cur))||(n.startsWith('project/')&&cur.startsWith(n))||(n==='objects'&&cur.startsWith('objects'))||(n==='kb'&&cur.startsWith('kb')))});
}

/* ---------- Router ---------- */
const views={};
function route(){
  const h=location.hash.slice(1)||'home';
  const cut=h.indexOf('/'),a=cut<0?h:h.slice(0,cut),b=cut<0?'':decodeURIComponent(h.slice(cut+1));
  S.project=null;
  if(a==='ticket'){S.view='ticket';S.ticket=b;S.ttab=route.lastTicket===b?S.ttab:'overview';route.lastTicket=b}
  else if(a==='project'){S.view='list';const [p,q]=b.split('?');S.project=p;S.tab=q||'active';S.lastList=location.hash}
  else if(a==='list'){S.view='list';S.tab=b||'active';S.lastList=location.hash}
  else if(a==='objects'){S.view='objects';S.obj=b||S.obj||OBJECTS[0].id}
  else if(a==='kb'){S.view=b?'article':'kb';S.kbArticle=b}
  else S.view=views[a]?a:'home';
  if(S.view==='list'&&route.prev!==h)S.sel=0;
  route.prev=h;
  $$('.view').forEach(v=>v.hidden=true);
  const host=$('#v-'+S.view);if(host)host.hidden=false;
  $('#body').scrollTop=0;closePanel();
  renderAll(true);
}
function renderAll(fresh){
  renderSide();
  const v=views[S.view];
  $('#crumb').innerHTML=v.crumb?v.crumb():'';
  const b2=v.bar2?v.bar2():null;$('#bar2').hidden=b2==null;$('#bar2').innerHTML=b2||'';
  $('#bar1Right').innerHTML=v.bar1Right?v.bar1Right():'';
  v.render(fresh);
}
// After any data change: re-render the visible screen, keeping typing and scroll intact
function changed(){
  S.lastUpd=Date.now();
  const ae=document.activeElement;
  if(ae&&ae!==document.body&&(ae.isContentEditable||(/INPUT|TEXTAREA|SELECT/.test(ae.tagName)&&ae.closest('#body')))){renderSide();return}
  const body=$('#body'),sc=body.scrollTop;renderAll(false);body.scrollTop=sc;
  if(S.trSel&&$('#panel').classList.contains('on'))views.transports.panel(S.trSel);
}
addEventListener('hashchange',route);

/* ---------- Side panel (transport details) ---------- */
function openPanel(html){$('#panel').innerHTML=html;$('#panel').classList.add('on')}
function closePanel(){$('#panel').classList.remove('on');S.trSel=null}

/* ---------- Global clicks ---------- */
document.addEventListener('click',e=>{
  const nin=e.target.closest('[data-newin]');if(nin){e.stopPropagation();openNew({status:nin.dataset.newin});return}
  const mb=e.target.closest('[data-menu]');
  if(mb){e.preventDefault();e.stopPropagation();
    const t=byId(mb.dataset.tid||mb.closest('[data-id]')?.dataset.id||S.ticket);if(!t)return;
    const kind=mb.dataset.menu;menuFor(kind,t,mb,v=>kind==='status'?setStatus(t,v):setProp(t,kind,v));return}
  if(e.target.closest('[data-close-panel]')){closePanel();return}
  const go=e.target.closest('[data-go]');if(go){location.hash=go.dataset.go;return}
  const row=e.target.closest('.row,.card,.ts tbody tr[data-id],.fi[data-id],.att li[data-id]');
  if(row&&!e.target.closest('.menu')&&row.dataset.id){location.hash='#ticket/'+row.dataset.id}
});
$('#sideNew').onclick=()=>openNew();
$('#sideSearch').onclick=()=>openPalette();

/* ---------- Keyboard ---------- */
document.addEventListener('keydown',e=>{
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||document.activeElement.isContentEditable;
  if($('#menu').classList.contains('on')){
    const vis=menuItems._vis||[];
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){menuSel=(menuSel+(e.key==='ArrowDown'?1:-1)+vis.length)%vis.length;drawMenu($('#menuQ')?.value||'');e.preventDefault();return}
    if(e.key==='Enter'&&vis[menuSel]){const cb=menuCb;closeMenu();cb(vis[menuSel].value);e.preventDefault();return}
    if(e.key==='Escape'){closeMenu();return}
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return}
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&$('#newModal').classList.contains('on')){createTicket();return}
  if(e.key==='Escape'){
    if($('.modal.on')){$$('.modal.on').forEach(m=>m.classList.remove('on'));return}
    if($('#panel').classList.contains('on')){closePanel();return}
    if(typing){document.activeElement.blur();return}
    if(S.view==='ticket'){location.hash=S.lastList;return}
    if(S.view==='article'){location.hash='#kb';return}
  }
  if(typing||e.ctrlKey||e.altKey||e.metaKey||$('.modal.on'))return;
  const k=e.key.toLowerCase();
  if(k==='c'){e.preventDefault();openNew();return}
  if(k==='/'&&S.view==='kb'){e.preventDefault();$('#kbQ')?.focus();return}
  views[S.view].key?.(e,k);
});

/* ---------- New ticket ---------- */
let draft={};
function openNew(pre={}){
  draft={status:'TODO',priority:'Medium',project:S.project||'GST',area:'SD',tech:'ABAP',type:'Change request',environment:'DEV',assignee:ME,...pre};
  $('#nTitle').value='';$('#nDesc').value='';$('#nAcc').value='';$('#nTpl').value='';drawPills();
  $('#newModal').classList.add('on');setTimeout(()=>$('#nTitle').focus(),20);
}
function drawPills(){
  const d=new Date(Date.now()+7*DAY).toISOString().slice(0,10);
  const pill=(k,html)=>`<button class="pill" data-np="${k}">${html}</button>`;
  $('#nPills').innerHTML=pill('status',sIcon(draft.status)+st(draft.status).name)+pill('priority',pIcon(draft.priority)+draft.priority)+
    pill('project',dot(prj(draft.project).color)+esc(prj(draft.project).name))+pill('area',ic14('folder')+draft.area)+pill('tech',dot(TECH_COLOR[draft.tech])+draft.tech)+
    pill('type',ic14('tag')+draft.type)+pill('environment',ic14('env')+draft.environment)+pill('assignee',ic14('user')+draft.assignee)+
    `<input id="nReq" placeholder="Requester" list="reqList" value="${esc(draft.requester||'')}"><datalist id="reqList">${[...new Set(Object.values(TD.REQUESTERS).flat())].map(r=>`<option value="${esc(r)}">`).join('')}</datalist>
     <input id="nDue" type="date" value="${draft.due||d}" title="Due date"><input id="nEst" type="number" min="0" step="0.5" value="${draft.estimate||4}" style="width:70px" title="Estimate (h)">`;
}
$('#nPills').addEventListener('click',e=>{const p=e.target.closest('[data-np]');if(!p)return;const k=p.dataset.np;
  draft.requester=$('#nReq').value;draft.due=$('#nDue').value;draft.estimate=$('#nEst').value;
  menuFor(k,draft,p,v=>{draft[k]=v;drawPills()})});
$('#nTpl').innerHTML='<option value="">Template…</option>'+TD.TPL.slice(0,26).map((t,i)=>`<option value="${i}">${prj(t[0]).name} · ${esc(t[4])}</option>`).join('');
$('#nTpl').onchange=e=>{const tp=TD.TPL[e.target.value];if(!tp)return;Object.assign(draft,{project:tp[0],area:tp[1],tech:tp[2],type:tp[3],requester:TD.REQUESTERS[tp[1]][0]});
  $('#nTitle').value=tp[4];$('#nAcc').value=tp[6].join('\n');draft.objects=tp[5].map(n=>OBJECTS.find(o=>o.name===n)?.id).filter(Boolean);drawPills()};
function createTicket(){
  const title=$('#nTitle').value.trim();if(!title){$('#nTitle').focus();return}
  const id='TK-'+(Math.max(...tickets.map(t=>+t.id.slice(3)))+1),now=new Date();
  const t={id,title,description:$('#nDesc').value.trim(),acceptance:$('#nAcc').value.split('\n').map(x=>x.trim()).filter(Boolean),
    project:draft.project,area:draft.area,tech:draft.tech,type:draft.type,priority:draft.priority,environment:draft.environment,assignee:draft.assignee,
    requester:$('#nReq').value||'–',created:now,due:new Date($('#nDue').value+'T17:00'),estimate:+$('#nEst').value||0,history:[{status:'BACKLOG',at:now}],status:'BACKLOG',
    worklog:[],transports:[],objects:draft.objects||[],comments:[],attachments:[],tests:[],
    checklist:TD.CHECK_CATS.map((c,k)=>({cat:c,text:['Unit tests written and green','Tested end-to-end in QA','Authorization checks verified','Errors logged and shown to the user','Runtime checked with production volume','All objects in the TR, TR released'][k],done:false}))};
  t.tests=t.acceptance.map(a=>({name:a,steps:'',expected:a,actual:'',status:'open'}));
  tickets.push(t);pushActivity({kind:'new',id});
  if(draft.status!=='BACKLOG')setStatus(t,draft.status,{silent:true});
  $('#newModal').classList.remove('on');toast(`${sIcon(t.status)} ${id} created`);changed();location.hash='#ticket/'+id;
}
$('#nCreate').onclick=createTicket;
$$('.modal').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.remove('on')}));
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modal').classList.remove('on'));

/* ---------- Log time dialog (manual entries) ---------- */
function openLog(ticketId){
  const open=tickets.filter(t=>isOpen(t)||t.id===ticketId).sort((a,b)=>b.id.localeCompare(a.id));
  $('#lTicket').innerHTML=open.map(t=>`<option value="${t.id}" ${t.id===ticketId?'selected':''}>${t.id} · ${esc(t.title)}</option>`).join('');
  $('#lAct').innerHTML=ACTIVITIES.map(a=>`<option value="${a.key}">${a.name}</option>`).join('');
  $('#lDate').value=new Date().toISOString().slice(0,10);$('#lHours').value='1';$('#lCmt').value='';
  $('#logModal').classList.add('on');setTimeout(()=>$('#lHours').select(),20);
}
$('#lSave').onclick=()=>{const t=byId($('#lTicket').value),h=+$('#lHours').value;if(!t||!(h>0))return;
  logTime(t,h,$('#lAct').value,new Date($('#lDate').value+'T12:00'),$('#lCmt').value);$('#logModal').classList.remove('on');toast(`${ic('clock')} Logged ${h}h on ${t.id}`)};

/* ---------- Command palette ---------- */
let palSel=0,palItems=[];
const CMDS=[['New ticket','C',()=>openNew()],['Log time…','',()=>openLog(S.ticket)],['Go to Home','',()=>location.hash='#home'],['Go to Inbox','',()=>location.hash='#inbox'],['Go to My tickets','',()=>location.hash='#list/active'],
  ['Go to Transports','',()=>location.hash='#transports'],['Go to Objects','',()=>location.hash='#objects'],['Go to Knowledge','',()=>location.hash='#kb'],['Go to Timesheet','',()=>location.hash='#timesheet'],['Go to Insights','',()=>location.hash='#insights'],
  ['Toggle light / dark theme','',()=>toggleTheme()],['Stop timer and log time','',()=>stopTimer(true)]];
function openPalette(){$('#palModal').classList.add('on');$('#palInput').value='';palSel=0;drawPalette();setTimeout(()=>$('#palInput').focus(),20)}
function drawPalette(){
  const q=$('#palInput').value.trim().toLowerCase(),has=s=>s.toLowerCase().includes(q);
  const res=[];
  if(q){
    tickets.filter(t=>has([t.id,t.title,t.requester,...t.transports].join(' '))).slice(0,6).forEach(t=>res.push({html:`${sIcon(t.status)}<span class="muted num">${t.id}</span><span>${esc(t.title)}</span>`,k:st(t.status).name,run:()=>location.hash='#ticket/'+t.id,g:'Tickets'}));
    OBJECTS.filter(o=>has(o.name+' '+o.desc)).slice(0,5).forEach(o=>res.push({html:`<span class="otype">${o.type}</span><span class="mono">${esc(o.name)}</span>`,k:TD.OBJ_TYPES[o.type],run:()=>location.hash='#objects/'+o.id,g:'Objects'}));
    transports.filter(x=>has(x.id+' '+x.text)).slice(0,4).forEach(x=>res.push({html:`${ic14('truck')}<span class="mono">${x.id}</span><span>${esc(x.text)}</span>`,k:x.ticket,run:()=>{location.hash='#transports';setTimeout(()=>views.transports.panel(x.id),50)},g:'Transports'}));
    ARTICLES.filter(a=>has(a.title+' '+a.tags.join(' '))).slice(0,4).forEach(a=>res.push({html:`${ic14('book')}<span>${esc(a.title)}</span>`,k:a.type,run:()=>location.hash='#kb/'+a.id,g:'Knowledge'}));
  }
  CMDS.filter(c=>!q||has(c[0])).forEach(c=>res.push({html:`${ic('move','width:14px;height:14px;color:var(--muted)')}<span>${c[0]}</span>`,k:c[1],run:c[2],g:'Commands'}));
  palItems=res;palSel=Math.min(palSel,Math.max(0,res.length-1));
  let g='';$('#palList').innerHTML=res.map((it,i)=>(it.g!==g?`<div class="g">${(g=it.g)}</div>`:'')+`<div class="mi ${i===palSel?'sel':''}" data-i="${i}" style="display:flex;align-items:center;gap:9px;height:36px;padding:0 10px;border-radius:6px;cursor:pointer;overflow:hidden;white-space:nowrap">${it.html}<span style="margin-left:auto;color:var(--muted);font-size:12px">${it.k}</span></div>`).join('')||'<div class="empty">No results</div>';
}
$('#palInput').addEventListener('input',()=>{palSel=0;drawPalette()});
$('#palInput').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){palSel=Math.min(palSel+1,palItems.length-1);drawPalette();e.preventDefault()}
  if(e.key==='ArrowUp'){palSel=Math.max(palSel-1,0);drawPalette();e.preventDefault()}
  if(e.key==='Enter'&&palItems[palSel]){$('#palModal').classList.remove('on');palItems[palSel].run()}
});
$('#palList').addEventListener('click',e=>{const it=e.target.closest('[data-i]');if(it){$('#palModal').classList.remove('on');palItems[it.dataset.i].run()}});

/* ---------- Timer ---------- */
function startTimer(id){if(S.timer.id&&S.timer.id!==id)stopTimer(true);S.timer={id,start:Date.now(),acc:0,running:true};toast(`${ic('clock')} Timer started on ${id}`);tick()}
function toggleTimer(){const tm=S.timer;if(!tm.id)return;if(tm.running){tm.acc+=(Date.now()-tm.start)/1e3;tm.running=false}else{tm.start=Date.now();tm.running=true}tick()}
function stopTimer(log){
  const tm=S.timer;if(!tm.id)return;const t=byId(tm.id);const sec=tm.acc+(tm.running?(Date.now()-tm.start)/1e3:0);t.liveHours=0;
  S.timer={id:null,start:0,acc:0,running:false};
  if(log){const h=Math.max(.25,Math.round(sec/900)/4);logTime(t,h);toast(`${ic('clock')} Logged ${h}h on ${t.id}`)}else tick();
}
function tick(){
  const tm=S.timer,sec=tm.id?tm.acc+(tm.running?(Date.now()-tm.start)/1e3:0):0,p=n=>[...String(Math.floor(n)).padStart(2,'0')].map(d=>`<span class="d">${d}</span>`).join('');
  // Poppins has no tabular figures: fixed-width digit cells keep the clock from jittering
  $('#timerClock').innerHTML=`${p(sec/3600)}:${p(sec%3600/60)}:${p(sec%60)}`;
  $('#timerWhat').textContent=tm.id?`${tm.id} · ${byId(tm.id).title}`:'No timer running';
  $('#timerRec').style.visibility=tm.running?'visible':'hidden';
  $('#timerToggle').innerHTML=ic(tm.running?'pause':'play','width:14px;height:14px');
  $('#timerToggle').disabled=$('#timerStop').disabled=!tm.id;
  if(tm.id)byId(tm.id).liveHours=sec/3600;
  $('#lastUpd').textContent=Date.now()-S.lastUpd<45e3?'Up to date':'Updated '+ago(S.lastUpd);
}
$('#timerToggle').onclick=toggleTimer;$('#timerStop').onclick=()=>stopTimer(true);
$('#timerWhat').onclick=()=>S.timer.id&&(location.hash='#ticket/'+S.timer.id);

/* ---------- Theme ---------- */
function toggleTheme(){const r=document.documentElement;r.dataset.theme=r.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('devdesk-theme',r.dataset.theme)}catch(e){}Charts.disposeAll();renderAll(true);themeIcon()}
const themeIcon=()=>{$('#themeBtn').innerHTML=ic(document.documentElement.dataset.theme==='light'?'moon':'sun')};
$('#themeBtn').onclick=toggleTheme;themeIcon();

/* ---------- Live updates ----------
   In the real app changes come from the backend (polling, later ABAP push channel).
   The mockup simulates one every 15 s so screens visibly update without a reload. */
function simulate(){
  const r=TD.rnd(),next={BACKLOG:'TODO',TODO:'PROG',PROG:'TEST',BLOCK:'PROG',TEST:'DONE'};
  const open=tickets.filter(t=>isOpen(t)&&t.id!==S.timer.id&&t.id!==S.ticket);
  if(r<.45&&open.length){const t=open[Math.floor(TD.rnd()*open.length)];setStatus(t,next[t.status],{silent:true})}
  else if(r<.75){
    const x=transports.find(x=>x.released&&!x.qa)||transports.find(x=>x.qa&&x.qa.rc<=4&&!x.prd&&byId(x.ticket).status==='DONE');
    if(x){const sys=x.qa?'PRD':'QA';x[sys==='QA'?'qa':'prd']={rc:0,date:new Date()};pushActivity({kind:'tr',id:x.ticket,tr:x.id,sys,rc:0});changed()}
  }else if(open.length){const t=open[Math.floor(TD.rnd()*open.length)];logTime(t,.5)}
}

function boot(){
  seedActivity();
  const first=tickets.filter(t=>t.status==='PROG').sort((a,b)=>PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority))[0];
  if(first)S.timer={id:first.id,start:Date.now(),acc:3600*1.2,running:true};
  tick();setInterval(tick,1000);setInterval(simulate,15000);
  (document.fonts?document.fonts.ready:Promise.resolve()).then(route);
}

window.DD={$,$$,esc,st,prj,act,byId,trById,objById,r1,TECH_COLOR,sIcon,pIcon,ic,ic14,dueHtml,prjChip,techTag,ago,toast,isOpen,hours,weekStart,weekHours,missingTime,
  S,VIEWS,views,pushActivity,setStatus,setProp,logTime,openMenu,menuFor,MENUS,openNew,openLog,openPanel,closePanel,startTimer,toggleTimer,stopTimer,changed,renderAll,route,dot,boot};
})();
