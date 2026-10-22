// Sample data for the mockup (stands in for the backend). Deterministic, so every reload looks the same.
// Tickets carry full status history and work logs; objects, transports and articles link to them.
(function(){
const DAY=864e5;
const STATUSES=[
  {key:'BACKLOG',name:'Backlog',    color:'--st-backlog',icon:'dashed'},
  {key:'TODO',   name:'To do',      color:'--st-todo',   icon:'empty'},
  {key:'PROG',   name:'In progress',color:'--st-prog',   icon:'half',  wip:4},
  {key:'TEST',   name:'Testing',    color:'--st-test',   icon:'three', wip:5},
  {key:'BLOCK',  name:'Blocked',    color:'--st-block',  icon:'blocked'},
  {key:'DONE',   name:'Done',       color:'--st-done',   icon:'done'}
];
const PRIORITIES=['Urgent','High','Medium','Low'];
const TYPES=['Bug','Change request','New development','Support'];
const PROJECTS=[
  {key:'GST', name:'GST & e-invoicing',     color:'#4ea7fc'},
  {key:'GATE',name:'Gate entry app',        color:'#4cb782'},
  {key:'PPR', name:'Production reporting',  color:'#f2994a'},
  {key:'FIN', name:'Finance automation',    color:'#f2c94c'},
  {key:'CORE',name:'Clean core & platform', color:'#bb87fc'}
];
const AREAS=['SD','MM','FI','PP','PS','Basis'];
const TECHS=['RAP','CDS','ABAP','OData','Fiori','Integration','Form'];
const ENVS=['DEV','QA','PRD'];
const ACTIVITIES=[
  {key:'CODE', name:'Coding',        color:'#5e6ad2'},
  {key:'DEBUG',name:'Debugging',     color:'#eb5757'},
  {key:'TEST', name:'Testing',       color:'#26b5ce'},
  {key:'ANA',  name:'Analysis',      color:'#4cb782'},
  {key:'MEET', name:'Meetings',      color:'#f2994a'},
  {key:'DOC',  name:'Documentation', color:'#8a8f98'}
];
const CHECK_CATS=['Unit test','Integration','Authorization','Error handling','Performance','Transport readiness'];
const OBJ_TYPES={TABL:'Table',DDLS:'CDS view',BDEF:'Behavior definition',CLAS:'Class',PROG:'Report',TRAN:'Transaction',SRVD:'Service definition',SRVB:'Service binding',FIORI:'Fiori app',SSFO:'Smart Form',DEST:'Destination (SM59)',API:'External API',FUGR:'Function group'};
const ME='Himanshu Sudra';

/* ---------- Technical object registry with dependencies (from -> to = "to is built on from") ---------- */
const O=(type,name,desc,project,pkg)=>({type,name,desc,project,pkg,system:'DEV'});
const OBJECTS=[
  O('TABL','ZMM_GATE_HDR','Gate entry header','GATE','ZMM_GATE'),O('TABL','ZMM_GATE_ITM','Gate entry items (PO lines per vehicle)','GATE','ZMM_GATE'),
  O('DDLS','ZI_GateEntry','Gate entry – interface view with PO data','GATE','ZMM_GATE'),O('DDLS','ZR_GateEntry','Gate entry – RAP business object root','GATE','ZMM_GATE'),
  O('BDEF','ZR_GateEntry','Behavior: create, approve, print gate pass','GATE','ZMM_GATE'),O('CLAS','ZBP_R_GATEENTRY','Behavior implementation (validations, approval)','GATE','ZMM_GATE'),
  O('DDLS','ZC_GateEntry','Projection for the Fiori app','GATE','ZMM_GATE'),O('SRVD','ZUI_GATEENTRY','Service definition','GATE','ZMM_GATE'),
  O('SRVB','ZUI_GATEENTRY_O4','OData V4 UI binding','GATE','ZMM_GATE'),O('FIORI','ZMM_GATE_APP','Gate entry Fiori Elements app','GATE','ZMM_GATE'),
  O('CLAS','ZCL_MM_PO_READER','Reads open purchase order items','GATE','ZMM_GATE'),O('SSFO','ZMM_GATE_PASS','Gate pass print form','GATE','ZMM_GATE'),
  O('DDLS','ZI_BillingItemTax','Billing items with CGST/SGST/IGST and HSN','GST','ZSD_GST'),O('CLAS','ZCL_SD_SALES_REG_DATA','Sales register data selection','GST','ZSD_GST'),
  O('PROG','ZSD_SALES_REGISTER','Sales register ALV report','GST','ZSD_GST'),O('TRAN','ZSDREG','Transaction for the sales register','GST','ZSD_GST'),
  O('API','E-invoice IRP – generate IRN','External e-invoice registration API','GST','ZSD_EINV'),O('DEST','ZEINV_IRP_API','HTTP destination to the IRP (SSL, timeout 60 s)','GST','ZSD_EINV'),
  O('CLAS','ZCL_SD_EINV_CLIENT','E-invoice client: build JSON, call IRP, retry','GST','ZSD_EINV'),O('TABL','ZSD_EINV_LOG','E-invoice request/response log','GST','ZSD_EINV'),
  O('PROG','ZSD_EINV_COCKPIT','E-invoice cockpit (status, retry, cancel)','GST','ZSD_EINV'),O('SSFO','ZSD_TAX_INVOICE','Tax invoice form with IRN QR code','GST','ZSD_EINV'),
  O('DDLS','ZI_VendorOpenItems','Vendor open items for reminder mails','FIN','ZFI_AUTO'),O('CLAS','ZCL_FI_VENDOR_MAIL','Builds and sends vendor reminder mails','FIN','ZFI_AUTO'),
  O('PROG','ZFI_VENDOR_AUTOMAIL','Vendor auto-mail job','FIN','ZFI_AUTO'),O('PROG','ZFI_TAX_INV_REMINDER','Pending tax invoice reminder job','FIN','ZFI_AUTO'),
  O('PROG','ZFI_STMT_OF_ACCOUNT','Statement of account','FIN','ZFI_AUTO'),O('SSFO','ZFI_SOA_FORM','Statement of account form','FIN','ZFI_AUTO'),
  O('PROG','ZPP_MRP_LINK','MRP link report','PPR','ZPP_REP'),O('DDLS','ZI_ProdOrderStatus','Production order status (scheduled vs actual)','PPR','ZPP_REP'),
  O('DDLS','ZC_ProdOrderDashboard','Analytical query for the production dashboard','PPR','ZPP_REP'),O('SRVD','ZUI_PRODDASH','Production dashboard service','PPR','ZPP_REP'),
  O('FIORI','ZPP_DASH','Production dashboard app','PPR','ZPP_REP'),
  O('CLAS','ZCL_APPLOG_HELPER','Application log helper (SLG1) used by jobs and BOs','CORE','ZBC_TOOLS'),O('CLAS','ZCL_BCS_MAIL_HELPER','Mail helper (BCS) with attachments','CORE','ZBC_TOOLS'),
  O('PROG','ZBC_TR_CLEANUP','Lists obsolete transports in DEV','CORE','ZBC_TOOLS'),O('DDLS','ZI_CustomCodeFindings','ATC findings for custom code','CORE','ZBC_TOOLS')
];
OBJECTS.forEach((o,i)=>o.id='OB'+(i+1));
const ob=n=>OBJECTS.find(o=>o.name===n&&o.type!=='BDEF')||OBJECTS.find(o=>o.name===n);
const obT=(t,n)=>OBJECTS.find(o=>o.type===t&&o.name===n);
const DEPS=[
  [ob('ZMM_GATE_HDR'),ob('ZI_GateEntry')],[ob('ZMM_GATE_ITM'),ob('ZI_GateEntry')],[ob('ZI_GateEntry'),obT('DDLS','ZR_GateEntry')],
  [obT('DDLS','ZR_GateEntry'),obT('BDEF','ZR_GateEntry')],[obT('BDEF','ZR_GateEntry'),ob('ZBP_R_GATEENTRY')],[obT('DDLS','ZR_GateEntry'),ob('ZC_GateEntry')],
  [ob('ZC_GateEntry'),ob('ZUI_GATEENTRY')],[ob('ZUI_GATEENTRY'),ob('ZUI_GATEENTRY_O4')],[ob('ZUI_GATEENTRY_O4'),ob('ZMM_GATE_APP')],
  [ob('ZCL_MM_PO_READER'),ob('ZBP_R_GATEENTRY')],[ob('ZMM_GATE_HDR'),ob('ZMM_GATE_PASS')],[ob('ZCL_APPLOG_HELPER'),ob('ZBP_R_GATEENTRY')],
  [ob('ZI_BillingItemTax'),ob('ZCL_SD_SALES_REG_DATA')],[ob('ZCL_SD_SALES_REG_DATA'),ob('ZSD_SALES_REGISTER')],[ob('ZSD_SALES_REGISTER'),ob('ZSDREG')],
  [ob('E-invoice IRP – generate IRN'),ob('ZEINV_IRP_API')],[ob('ZEINV_IRP_API'),ob('ZCL_SD_EINV_CLIENT')],[ob('ZCL_SD_EINV_CLIENT'),ob('ZSD_EINV_COCKPIT')],
  [ob('ZSD_EINV_LOG'),ob('ZSD_EINV_COCKPIT')],[ob('ZCL_APPLOG_HELPER'),ob('ZCL_SD_EINV_CLIENT')],[ob('ZI_BillingItemTax'),ob('ZSD_TAX_INVOICE')],[ob('ZSD_EINV_LOG'),ob('ZSD_TAX_INVOICE')],
  [ob('ZI_VendorOpenItems'),ob('ZCL_FI_VENDOR_MAIL')],[ob('ZCL_FI_VENDOR_MAIL'),ob('ZFI_VENDOR_AUTOMAIL')],[ob('ZCL_BCS_MAIL_HELPER'),ob('ZCL_FI_VENDOR_MAIL')],
  [ob('ZCL_BCS_MAIL_HELPER'),ob('ZFI_TAX_INV_REMINDER')],[ob('ZFI_SOA_FORM'),ob('ZFI_STMT_OF_ACCOUNT')],[ob('ZCL_APPLOG_HELPER'),ob('ZFI_VENDOR_AUTOMAIL')],
  [ob('ZI_ProdOrderStatus'),ob('ZC_ProdOrderDashboard')],[ob('ZC_ProdOrderDashboard'),ob('ZUI_PRODDASH')],[ob('ZUI_PRODDASH'),ob('ZPP_DASH')],[ob('ZI_ProdOrderStatus'),ob('ZPP_MRP_LINK')],
  [ob('ZI_CustomCodeFindings'),ob('ZBC_TR_CLEANUP')]
].map(([a,b])=>({from:a.id,to:b.id}));

/* ---------- Ticket templates: [project, area, tech, type, title, objects, acceptance] ---------- */
const TPL=[
  ['GST','SD','ABAP','Change request','Sales register: add GST split columns',['ZSD_SALES_REGISTER','ZCL_SD_SALES_REG_DATA','ZI_BillingItemTax'],['CGST, SGST and IGST in separate columns','Totals match the billing documents','Excel export keeps the new columns']],
  ['GST','SD','Integration','Bug','E-invoice cockpit: retry failed IRN generation',['ZSD_EINV_COCKPIT','ZCL_SD_EINV_CLIENT','ZSD_EINV_LOG'],['Failed requests can be retried from the cockpit','Each retry is logged in ZSD_EINV_LOG']],
  ['GST','SD','Integration','Change request','IRP API: timeout handling and retry with backoff',['ZCL_SD_EINV_CLIENT','ZEINV_IRP_API'],['Timeout raised to 60 s','Up to 3 retries with backoff','Final failure visible in SLG1']],
  ['GST','SD','Form','Change request','Tax invoice form: print IRN QR code',['ZSD_TAX_INVOICE'],['QR code printed for every invoice with an IRN','Layout unchanged for invoices without IRN']],
  ['GST','SD','CDS','New development','Billing tax CDS: add HSN code and tax rate',['ZI_BillingItemTax'],['HSN and tax rate per item','No duplicate rows for split conditions']],
  ['GST','SD','Integration','Support','How to reprocess a failed e-invoice',[],['Steps documented in the knowledge base']],
  ['GATE','MM','RAP','New development','Gate entry: multiple POs per vehicle',['ZR_GateEntry','ZBP_R_GATEENTRY','ZMM_GATE_ITM'],['One gate entry can hold items from several POs','Quantity check per PO item']],
  ['GATE','MM','RAP','Change request','Gate entry: approval action with four-eyes check',['ZBP_R_GATEENTRY'],['Creator cannot approve','Approval is logged with user and time']],
  ['GATE','MM','Fiori','Bug','Gate entry app: unclear vehicle number message',['ZMM_GATE_APP','ZC_GateEntry'],['Message names the expected format']],
  ['GATE','MM','OData','Bug','Gate entry OData: $expand to items is slow',['ZUI_GATEENTRY_O4','ZI_GateEntry'],['List with items loads in under 2 s for 500 entries']],
  ['GATE','MM','ABAP','Bug','Open PO reader ignores deleted items',['ZCL_MM_PO_READER'],['Deleted PO items are not offered']],
  ['GATE','MM','Form','Change request','Gate pass print: add security sign-off box',['ZMM_GATE_PASS'],['Sign-off box on every printed gate pass']],
  ['PPR','PP','ABAP','Change request','MRP link report: performance on large plants',['ZPP_MRP_LINK'],['Runtime under 60 s for plant 1000']],
  ['PPR','PP','CDS','New development','Production dashboard: scheduled vs actual',['ZI_ProdOrderStatus','ZC_ProdOrderDashboard'],['Scheduled and actual quantity per order','Delay in days per order']],
  ['PPR','PP','OData','Change request','Dashboard service: add plant filter',['ZUI_PRODDASH'],['Filter by plant works with value help']],
  ['PPR','PP','Fiori','New development','Production dashboard tile in the launchpad',['ZPP_DASH'],['Tile visible for the PP planner role']],
  ['PPR','PP','ABAP','Bug','Confirmation exit: wrong scrap quantity',[],['Scrap quantity equals the confirmed scrap']],
  ['FIN','FI','ABAP','Bug','Vendor auto-mail fails for blocked vendors',['ZFI_VENDOR_AUTOMAIL','ZCL_FI_VENDOR_MAIL'],['Blocked vendors are skipped and listed in the log']],
  ['FIN','FI','ABAP','Change request','Pending tax invoice reminder: CC to manager',['ZFI_TAX_INV_REMINDER','ZCL_BCS_MAIL_HELPER'],['Manager in CC from the org assignment']],
  ['FIN','FI','Form','Change request','Statement of account: add opening balance',['ZFI_STMT_OF_ACCOUNT','ZFI_SOA_FORM'],['Opening balance on the first page','Matches FBL1N for the period']],
  ['FIN','FI','CDS','New development','Vendor open items CDS for the mail job',['ZI_VendorOpenItems'],['Only open, due items per vendor']],
  ['FIN','FI','ABAP','New development','Bank statement upload validation report',[],['Shows statement lines without a match']],
  ['CORE','Basis','ABAP','Change request','Application log helper: add context fields',['ZCL_APPLOG_HELPER'],['Ticket number and object in every log entry']],
  ['CORE','Basis','ABAP','Change request','Clean up obsolete transports in DEV',['ZBC_TR_CLEANUP'],['List of TRs older than 1 year with no objects']],
  ['CORE','Basis','ABAP','Support','ATC findings on custom code: triage',['ZI_CustomCodeFindings'],['Priority 1 findings assigned to tickets']],
  ['CORE','Basis','ABAP','Change request','Mail helper: switch to BCS attachment API',['ZCL_BCS_MAIL_HELPER'],['PDF and XLSX attachments work','Existing callers unchanged']]
];
const REQUESTERS={SD:['Sales Ops','Billing team'],MM:['Purchasing','Stores'],FI:['Finance','Tax team','Accounts payable'],PP:['Production planning'],PS:['Projects'],Basis:['IT']};
const DUR={BACKLOG:[1,18],TODO:[1,7],PROG:[3,14],BLOCK:[3,9],TEST:[2,9]};

let seed=20261022;
const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const pick=a=>a[Math.floor(rnd()*a.length)];
const between=(a,b)=>a+rnd()*(b-a);
const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const NOW=new Date(),TODAY=startOfDay(NOW);
const isWork=d=>{const w=new Date(d).getDay();return w>0&&w<6};

const tickets=[],transports=[];
let trSeq=912300;
const N=78,SPAN=160;
for(let i=0;i<N;i++){
  const tp=TPL[i%TPL.length],cycle=Math.floor(i/TPL.length);
  const created=new Date(TODAY.getTime()-(SPAN-(i/N)*SPAN-between(0,2))*DAY);
  created.setHours(9+Math.floor(rnd()*8),Math.floor(rnd()*60));
  if(created>NOW)created.setTime(NOW.getTime()-36e5*(1+i%5));
  const prio=rnd()<.1?'Urgent':rnd()<.35?'High':rnd()<.8?'Medium':'Low';
  const t={
    id:'TK-'+(1001+i),title:tp[4]+(cycle===1?' – follow-up':cycle===2?' – phase 2':''),project:tp[0],area:tp[1],tech:tp[2],type:tp[3],priority:prio,
    environment:tp[3]==='Bug'?pick(['PRD','PRD','QA']):'DEV',assignee:rnd()<.9?ME:'Unassigned',requester:pick(REQUESTERS[tp[1]]),
    created,due:new Date(created.getTime()+between(prio==='Urgent'?2:8,prio==='Urgent'?6:30)*DAY),estimate:Math.round(between(2,14)),
    description:`Requested by ${'{R}'}. ${tp[3]==='Bug'?'Reported in '+'{E}'+'; steps to reproduce in the attachment.':'Details agreed in the requirement call.'}`,
    acceptance:[...tp[6]],objects:tp[5].map(n=>ob(n).id),history:[],worklog:[],transports:[],comments:[],
    attachments:rnd()<.5?[{name:tp[3]==='Bug'?'error_screenshot.png':'requirement.pdf',size:Math.round(between(80,900))+' KB'}]:[],
    tests:[],checklist:[]
  };
  t.description=t.description.replace('{R}',t.requester).replace('{E}',t.environment);
  // walk the workflow up to now
  let at=created.getTime();
  const path=['BACKLOG','TODO','PROG'];if(rnd()<.25)path.push('BLOCK','PROG');path.push('TEST','DONE');
  for(const s of path){
    if(at>NOW.getTime())break;
    t.history.push({status:s,at:new Date(at)});
    if(s==='DONE')break;
    let d=between(...DUR[s]);if(prio==='Urgent')d*=.5;at+=d*DAY;
    if(['TODO','PROG','TEST'].includes(s)){
      const from=startOfDay(t.history.at(-1).at).getTime();
      for(let day=from;day<Math.min(at,NOW.getTime());day+=DAY){
        if(!isWork(day)||rnd()<.45)continue;
        const act=s==='TODO'?'ANA':s==='TEST'?(rnd()<.7?'TEST':'DEBUG'):(rnd()<.55?'CODE':rnd()<.65?'DEBUG':'DOC');
        t.worklog.push({date:new Date(day),hours:Math.round(between(.5,s==='PROG'?2.5:1.25)*4)/4,activity:act,comment:''});
        if(rnd()<.12)t.worklog.push({date:new Date(day),hours:.5,activity:'MEET',comment:'Alignment with '+t.requester});
      }
    }
  }
  t.status=t.history.at(-1).status;
  const reached=k=>t.history.some(h=>h.status===k);
  // transports once development started
  if(reached('PROG')&&t.type!=='Support'){
    const n=1+(rnd()<.35?1:0);
    for(let k=0;k<n;k++){
      const done=t.status==='DONE',test=reached('TEST');
      const fail=test&&!done&&rnd()<.15;
      const relDay=test?new Date(t.history.find(h=>h.status==='TEST').at):null;
      const tr={id:'DEVK'+(trSeq++),text:(t.title+(k?' (part 2)':'')).slice(0,60),ticket:t.id,owner:'HSUDRA',kind:'Workbench',
        created:new Date(t.history.find(h=>h.status==='PROG').at),released:relDay,
        qa:test?{rc:fail?8:(rnd()<.2?4:0),date:relDay}:null,prd:done?{rc:0,date:t.history.at(-1).at}:null,
        objects:[...t.objects],dependsOn:k?['DEVK'+(trSeq-2)]:[],
        evidence:test?(fail?'':'Unit tests passed in DEV; user test in QA '+(done?'signed off':'pending')):'',
        notes:done?'Imported with the regular PRD window.':'',rollback:k?'Import part 1 again; part 2 only adds the form.':'Re-import the previous version from version management.'};
      t.transports.push(tr.id);transports.push(tr);
    }
  }
  // tests and checklist
  const testsDone=reached('TEST');
  t.tests=t.acceptance.map((a,k)=>({name:a,steps:'Run with test data set '+(k+1),expected:a,actual:t.status==='DONE'?a:'',status:t.status==='DONE'?'pass':testsDone&&rnd()<.6?(rnd()<.2?'fail':'pass'):'open'}));
  t.checklist=CHECK_CATS.map((c,k)=>({cat:c,text:['Unit tests written and green','Tested end-to-end in QA','Authorization checks verified','Errors logged and shown to the user','Runtime checked with production volume','All objects in the TR, TR released'][k],
    done:t.status==='DONE'||(testsDone&&k<3)||(reached('PROG')&&k===0&&rnd()<.6)}));
  tickets.push(t);
}
// a few comments on active work
tickets.filter(t=>['PROG','TEST','BLOCK'].includes(t.status)).forEach((t,i)=>{
  t.comments.push({at:new Date(t.history.at(-1).at.getTime()+36e5*3),text:[
    'Checked in DEV with test data; output matches the requirement. Waiting for user feedback on the layout.',
    'Root cause found: the selection ignored the deletion flag. Fix in the reader class, regression test added.',
    'Blocked until the requester confirms the expected rounding for IGST.',
    'QA import failed with RC 8 – missing message class. Added it to a new TR.'][i%4]});
});

// one failed QA import, so the tracker shows the error state
{const tt=tickets.find(t=>t.status==='TEST'&&t.transports.length);
 if(tt){const x=transports.find(x=>x.id===tt.transports[0]);x.qa.rc=8;x.evidence='';x.notes='RC 8: message class missing in QA – include it in a new TR.'}}

/* ---------- Knowledge base ---------- */
const kb=(id,type,title,tags,objects,tickets,days,body)=>({id,type,title,tags,objects:objects.map(n=>ob(n).id),tickets,created:new Date(TODAY.getTime()-days*DAY),...body});
const ARTICLES=[
  kb('KB-1','Error & fix','CX_RAP_HANDLER_NOT_IMPLEMENTED when reading a child entity',['RAP','authorization','dump'],['ZBP_R_GATEENTRY'],['TK-1008'],12,{
    error:'Short dump CX_RAP_HANDLER_NOT_IMPLEMENTED (GLOBAL_AUTHORIZATION) when the UI reads items of a gate entry.',
    rootCause:'An action was defined on the authorization-dependent child entity. The framework then expects a global authorization handler for the child, which does not exist.',
    location:'Behavior definition ZR_GateEntry, child entity Item; dump in CL_RAP_... handler dispatch',
    fix:'Move the action to the root entity and pass the item keys as parameter. Keep children "authorization dependent by _Root" without own actions.',
    test:'Reading items and running the action as a normal user – no dump, authorization still enforced.'}),
  kb('KB-2','Error & fix','OData V4: $orderby inside $expand is rejected',['OData','RAP'],['ZUI_GATEENTRY_O4'],['TK-1010'],20,{
    error:'HTTP 400 "Query option $orderby is not supported" for Items?$expand=_Item($orderby=ItemNo).',
    rootCause:'The RAP OData V4 runtime on this release does not support system query options inside a nested $expand.',
    location:'Frontend request builder',fix:'Sort the expanded collection in the browser, or read the child entity set with its own $orderby.',test:'Items appear in item order; request returns 200.'}),
  kb('KB-3','Error & fix','IRP API call times out after 30 seconds',['Integration','HTTP','SM59'],['ZCL_SD_EINV_CLIENT','ZEINV_IRP_API'],['TK-1003'],35,{
    error:'HTTP_COMMUNICATION_FAILURE, "timeout occurred" for large invoices.',
    rootCause:'Default ICM / destination timeout of 30 s; the IRP sometimes needs 40 s at month end.',
    location:'ZCL_SD_EINV_CLIENT->POST_INVOICE, after cl_http_client=>create_by_destination',
    fix:'Timeout set to 60 s in the destination, 3 retries with backoff (2 s, 8 s, 30 s); final failure written to ZSD_EINV_LOG and SLG1.',
    test:'Simulated slow response with a mock endpoint; retries logged, no duplicate IRN.'}),
  kb('KB-4','Error & fix','Fonts and logos missing in the UI5 app on the company network',['Fiori','frontend','network'],[],[],60,{
    error:'App renders with fallback fonts; console shows blocked requests to CDN hosts.',rootCause:'The company network blocks public CDNs.',
    location:'index.html / vite config',fix:'Bundle fonts and images into the build (vite assetsInlineLimit) and switch off UI5 default font loading.',test:'App opened from the SAP host with CDN access blocked – fonts OK.'}),
  kb('KB-5','Snippet','Write messages to the application log (SLG1)',['ABAP','logging'],['ZCL_APPLOG_HELPER'],['TK-1023'],8,{lang:'ABAP',code:
`DATA(lo_log) = cl_bali_log=>create_with_header(
                 cl_bali_header_setter=>create( object      = 'ZDD'
                                                subobject   = 'IMPORTS'
                                                external_id = CONV #( lv_ticket ) ) ).
lo_log->add_item( cl_bali_message_setter=>create( severity = if_bali_constants=>c_severity_error
                                                  id       = 'ZDD'
                                                  number   = '010'
                                                  variable_1 = CONV #( lv_trkorr ) ) ).
cl_bali_log_db=>get_instance( )->save_log( log = lo_log assign_to_current_appl_job = abap_true ).`,
    note:'Released API (cl_bali_*), works in jobs and RAP handlers. Wrap in TRY ... CATCH cx_bali_runtime.'}),
  kb('KB-6','Snippet','Run a RAP action from a report and commit',['RAP','EML','ABAP'],[],['TK-1024'],15,{lang:'ABAP',code:
`MODIFY ENTITIES OF zr_dd_ticket
  ENTITY Ticket
  EXECUTE refreshTransports FROM VALUE #( FOR k IN lt_keys ( TicketUUID = k ) )
  FAILED DATA(ls_failed)
  REPORTED DATA(ls_reported).

IF ls_failed IS INITIAL.
  COMMIT ENTITIES RESPONSE OF zr_dd_ticket FAILED DATA(ls_commit_failed).
ELSE.
  ROLLBACK ENTITIES.
ENDIF.`,note:'COMMIT ENTITIES is required outside the RAP framework (reports, jobs).'}),
  kb('KB-7','Snippet','ABAP SQL: first successful import per transport',['ABAP','SQL','TMS'],[],[],42,{lang:'ABAP',code:
`SELECT trkorr, MIN( import_date ) AS first_import
  FROM @lt_history AS h
  WHERE rc <= 4
  GROUP BY trkorr
  INTO TABLE @DATA(lt_first).`,note:'Internal table as data source (FROM @itab) – re-imports keep the first date.'}),
  kb('KB-8','API example','DevDesk OData: change a ticket status',['OData','DevDesk'],[],[],3,{method:'POST',endpoint:"/sap/opu/odata4/sap/zui_dd_ticket_o4/srvd/sap/zui_dd_ticket/0001/Ticket(TicketUUID=<uuid>)/com.sap.gateway.srvd.zui_dd_ticket.v0001.setStatus",
    request:'{\n  "Status": "TEST"\n}',response:'200 OK – the ticket with Status "TEST", StatusChangedAt set',codes:'200 OK · 400 invalid status · 412 ETag mismatch (reload first)',auth:'SAP login (same host); CSRF token from a GET with X-CSRF-Token: Fetch'}),
  kb('KB-9','API example','E-invoice provider: generate IRN (example payload)',['Integration','HTTP'],['E-invoice IRP – generate IRN','ZCL_SD_EINV_CLIENT'],['TK-1002'],50,{method:'POST',endpoint:'<IRP base URL from destination ZEINV_IRP_API>/invoice',
    request:'{\n  "DocDtls": { "Typ": "INV", "No": "<billing doc>", "Dt": "<dd/mm/yyyy>" },\n  "ItemList": [ ... ]\n}',response:'{ "Irn": "<64 chars>", "SignedQRCode": "<jwt>" }',codes:'200 OK · 400 validation error (details in ErrorDetails) · 401 token expired',auth:'Credentials in the SM59 destination / secure store – never in tickets or articles'}),
  kb('KB-10','Config note','Publish an OData V4 service binding',['OData','RAP','setup'],['ZUI_GATEENTRY_O4'],[],25,{steps:['Activate the service definition and binding in ADT.','Click "Publish" in the binding (or /IWFND/V4_ADMIN → Publish service group).','Check the service URL in the binding; test with the preview.','Assign S_SERVICE for the service to the role.']}),
  kb('KB-11','Config note','Deploy a BSP app with /UI5/UI5_REPOSITORY_LOAD',['Fiori','deploy'],[],[],30,{steps:['Build the app (npm run build) – dist folder.','SE38 /UI5/UI5_REPOSITORY_LOAD: name, package, transport, upload dist.','Run /UI5/APP_INDEX_CALCULATE for the app.','Open /sap/bc/ui5_ui5/sap/<app>/index.html and hard-refresh.']}),
  kb('KB-12','Design decision','Managed RAP without draft for DevDesk',['RAP','DevDesk','architecture'],[],[],2,{context:'The UI saves every change immediately (status from the list, inline title, checklist ticks).',
    decision:'Managed BO without draft; every change is one PATCH or action with an ETag. New tickets are one deep POST.',consequences:'No edit/activate round trips; validations still run on save. Unsaved-change handling stays in the browser.'}),
  kb('KB-13','Design decision','Read transport objects live from E071',['Transports','DevDesk'],[],[],2,{context:'Objects in a TR change until release; copies go stale.',decision:'Store only the ticket ↔ TR link and import status; read objects from E070/E071 (request and tasks) through CDS.',consequences:'Always current. E071 is not a released API – wrapped in one class.'})
];

window.TD={DAY,STATUSES,PRIORITIES,TYPES,PROJECTS,AREAS,TECHS,ENVS,ACTIVITIES,CHECK_CATS,OBJ_TYPES,OBJECTS,DEPS,ARTICLES,TPL,REQUESTERS,ME,
  tickets,transports,NOW,TODAY,startOfDay,isWork,rnd,nextTr:()=>'DEVK'+(trSeq++)};
})();
