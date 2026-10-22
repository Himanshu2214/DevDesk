// Metrics computed from ticket records, and the two Insights charts.
(function(){
const {DAY,startOfDay}=TD;
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmtD=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const pct=(arr,p)=>{if(!arr.length)return 0;const a=[...arr].sort((x,y)=>x-y);const i=(a.length-1)*p;const lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)};
const r1=x=>Math.round(x*10)/10;

/* ---------- Metrics ---------- */
const M={
  isOpen:t=>t.status!=='DONE',
  reached(t,key){const h=t.history.find(h=>h.status===key);return h?h.at:null},
  started:t=>(t.history.find(h=>h.status==='PROG')||t.history[0]).at,
  closedAt:t=>{const h=t.history.find(h=>h.status==='DONE');return h?h.at:null},
  cycleDays:t=>(M.closedAt(t)-M.started(t))/DAY,
  hours:t=>t.worklog.reduce((s,w)=>s+w.hours,0)+(t.liveHours||0),
  closedIn(list,days){const from=Date.now()-days*DAY;return list.filter(t=>{const c=M.closedAt(t);return c&&c.getTime()>=from})},
  dailyHours(list,fromMs){
    const m=new Map();
    for(const t of list)for(const w of t.worklog){const k=w.date.getTime();if(k>=fromMs)m.set(k,(m.get(k)||0)+w.hours)}
    const live=list.reduce((s,t)=>s+(t.liveHours||0),0);
    if(live){const k=startOfDay(new Date()).getTime();m.set(k,(m.get(k)||0)+live)}
    return m;
  },
  weekHours(){const t=startOfDay(new Date()).getTime(),mon=t-((new Date(t).getDay()+6)%7)*DAY;let w=0;for(const[,v]of M.dailyHours(TD.tickets,mon))w+=v;return w},
  // Scope / started / completed over a window, like a project progress chart.
  progress(days){
    const end=startOfDay(new Date()).getTime(),from=end-(days-1)*DAY;
    const set=TD.tickets.filter(t=>{const c=M.closedAt(t);return !c||c.getTime()>=from});
    const dates=[],scope=[],started=[],done=[];
    for(let d=from;d<=end;d+=DAY){
      const ms=d===end?Date.now():d+DAY-1;dates.push(new Date(d));
      let s=0,st=0,dn=0;
      for(const t of set){if(t.created.getTime()>ms)continue;s++;
        const a=t.history.find(h=>['PROG','TEST','BLOCK','DONE'].includes(h.status));if(a&&a.at.getTime()<=ms)st++;
        const c=M.closedAt(t);if(c&&c.getTime()<=ms)dn++}
      scope.push(s);started.push(st);done.push(dn);
    }
    return {dates,scope,started,done};
  },
  pct,r1
};

/* ---------- Charts ---------- */
function base(){
  return {
    textStyle:{fontFamily:'Inter, Segoe UI, sans-serif',color:css('--muted'),fontSize:11.5},
    animationDuration:600,animationDurationUpdate:700,animationEasingUpdate:'cubicOut',
    tooltip:{backgroundColor:css('--menu'),borderColor:css('--border-2'),borderWidth:1,padding:[8,10],
      textStyle:{color:css('--text'),fontSize:12,fontFamily:'Inter, Segoe UI, sans-serif'},extraCssText:'box-shadow:0 8px 28px rgba(0,0,0,.3);border-radius:8px;'}
  };
}
const DEF={
  // ring of hours per activity (Home, Timesheet); f.data = [{name,value,color}]
  donut:(f)=>{
    const total=f.data.reduce((s,d)=>s+d.value,0);
    return {...base(),
      tooltip:{...base().tooltip,trigger:'item',formatter:p=>`${p.marker}${p.name}<br><b>${p.value} h</b> · ${p.percent}%`},
      title:{text:`${r1(total)} h`,subtext:f.sub||'this week',left:'center',top:'36%',textStyle:{color:css('--text'),fontSize:20,fontWeight:600,fontFamily:'Inter, Segoe UI, sans-serif'},
        subtextStyle:{color:css('--muted'),fontSize:11}},
      series:[{type:'pie',radius:['66%','88%'],avoidLabelOverlap:false,label:{show:false},padAngle:2,itemStyle:{borderRadius:4,borderColor:css('--panel'),borderWidth:2},
        data:f.data.filter(d=>d.value>0).map(d=>({name:d.name,value:r1(d.value),itemStyle:{color:d.color}}))}]};
  },
  progress:(f)=>{
    const P=M.progress(f.days);
    const n=P.dates.length;
    // projection: completion pace of the last 14 days, continued 21 days ahead
    const pace=(P.done[n-1]-P.done[Math.max(0,n-15)])/14;
    const ahead=21,lab=[...P.dates];for(let i=1;i<=ahead;i++)lab.push(new Date(P.dates[n-1].getTime()+i*DAY));
    const pad=a=>[...a,...Array(ahead).fill(null)];
    const proj=[...Array(n-1).fill(null),P.done[n-1],...[...Array(ahead)].map((_,i)=>Math.min(P.scope[n-1],r1(P.done[n-1]+pace*(i+1))))];
    const line=(name,data,color,extra={})=>({name,type:'line',data,symbol:'none',smooth:.25,lineStyle:{width:1.6,color},itemStyle:{color},...extra});
    const today=fmtD(P.dates[n-1]);
    return {...base(),grid:{left:4,right:12,top:14,bottom:4,containLabel:true},
      tooltip:{...base().tooltip,trigger:'axis',axisPointer:{type:'line',lineStyle:{color:css('--border-2')}},
        formatter:ps=>{const v=ps.filter(p=>p.value!=null);if(!v.length)return'';return `<b>${ps[0].name}</b><br>`+v.map(p=>`${p.marker}${p.seriesName} <b>${p.value}</b>`).join('<br>')}},
      xAxis:{type:'category',boundaryGap:false,data:lab.map(fmtD),axisLine:{lineStyle:{color:css('--axis')}},axisTick:{show:false},
        axisLabel:{color:css('--muted'),fontSize:11,interval:i=>i===0||i===n-1||i===lab.length-1,showMinLabel:true,showMaxLabel:true}},
      yAxis:{type:'value',show:false,max:v=>Math.ceil(v.max*1.08)},
      series:[
        line('Scope',pad(P.scope),css('--st-backlog')),
        line('Started',pad(P.started),css('--st-prog')),
        line('Completed',pad(P.done),css('--accent'),{areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:css('--accent-soft')},{offset:1,color:'transparent'}]}},
          markLine:{symbol:'none',silent:true,label:{show:false},lineStyle:{color:css('--danger'),width:1,type:'solid',opacity:.7},data:[{xAxis:today}]},
          markArea:{silent:true,itemStyle:{color:'rgba(235,87,87,.07)'},data:[[{xAxis:today},{xAxis:fmtD(lab.at(-1))}]]}}),
        line('Projected',proj,css('--accent'),{lineStyle:{width:1.4,color:css('--accent'),type:[3,4]},smooth:false})
      ]};
  },
  hours:(f)=>{
    const n=Math.max(4,Math.round(f.days/7));const t=startOfDay(new Date());const mon=t.getTime()-((t.getDay()+6)%7)*DAY;
    const m=M.dailyHours(TD.tickets,mon-(n-1)*7*DAY);
    const weeks=[...Array(n)].map((_,i)=>{const from=mon-(n-1-i)*7*DAY;let h=0;for(const[k,v]of m)if(k>=from&&k<from+7*DAY)h+=v;return{label:fmtD(new Date(from)),h:r1(h)}});
    return {...base(),grid:{left:4,right:8,top:16,bottom:4,containLabel:true},
      tooltip:{...base().tooltip,trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{color:css('--hover')}},formatter:p=>`Week of ${p[0].name}<br><b>${p[0].value} h</b>`},
      xAxis:{type:'category',data:weeks.map(w=>w.label),axisLine:{lineStyle:{color:css('--axis')}},axisTick:{show:false},axisLabel:{color:css('--muted'),fontSize:11,hideOverlap:true}},
      yAxis:{type:'value',axisLabel:{color:css('--muted'),fontSize:11},splitLine:{lineStyle:{color:css('--grid')}}},
      series:[{type:'bar',barMaxWidth:14,itemStyle:{color:css('--accent'),borderRadius:[3,3,0,0]},data:weeks.map((w,i)=>i===n-1?{value:w.h,itemStyle:{color:css('--accent-2')}}:w.h),
        markLine:{symbol:'none',silent:true,data:[{yAxis:40}],lineStyle:{color:css('--muted'),type:[3,4],width:1},label:{color:css('--muted'),fontSize:11,position:'insideEndTop',formatter:'40 h'}}}]};
  }
};

DEF.donutTs=DEF.donut; // same chart on the timesheet (separate DOM element)
const inst={};
function render(id,f,{fresh=false}={}){
  const el=document.getElementById('ch-'+id);if(!el||el.offsetParent===null)return;
  let c=inst[id];
  if(c&&(c.isDisposed()||c.getDom()!==el)){c.dispose();c=null}
  if(fresh&&c){c.dispose();c=null}
  if(!c){c=echarts.init(el);inst[id]=c}
  c.setOption(DEF[id](f),{notMerge:fresh,lazyUpdate:true});
}
addEventListener('resize',()=>Object.values(inst).forEach(c=>!c.isDisposed()&&c.resize()));
function disposeAll(){Object.values(inst).forEach(c=>c.dispose());for(const k in inst)delete inst[k]}

window.Charts={M,render,disposeAll,css,fmtD};
})();
