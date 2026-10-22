@EndUserText.label : 'DevDesk - ticket'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_tkt {

  key client         : abap.clnt not null;
  key ticket_uuid    : sysuuid_x16 not null;
  ticket_no          : abap.numc(8);          // number range ZDD_TKT, shown as TK-1042
  title              : abap.char(120);
  description        : abap.string(0);
  status             : abap.char(8);          // BACKLOG TODO PROG TEST BLOCK DONE (action setStatus only)
  priority           : abap.numc(1);          // 1 Urgent, 2 High, 3 Medium, 4 Low
  project            : abap.char(10);         // ZDD_PROJECT
  area               : abap.char(10);         // ZDD_VALUE list AREA
  tech               : abap.char(10);         // ZDD_VALUE list TECH
  ticket_type        : abap.char(10);         // ZDD_VALUE list TYPE
  environment        : abap.char(3);          // DEV QA PRD
  assignee           : syuname;
  requester          : abap.char(60);
  reference          : abap.char(255);
  due_date           : abap.dats;
  estimate_h         : abap.dec(5,2);
  status_changed_at  : timestampl;
  closed_at          : timestampl;
  timer_started_at   : timestampl;            // running timer (actions startTimer / stopTimer)
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  last_changed_by    : abp_lastchange_user;
  last_changed_at    : abp_lastchange_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
