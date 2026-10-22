@EndUserText.label : 'DevDesk - work log entry'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_wlog {

  key client         : abap.clnt not null;
  key wlog_uuid      : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  work_date          : abap.dats;
  hours              : abap.dec(4,2);
  activity           : abap.char(5);          // ZDD_VALUE list ACTIVITY (CODE DEBUG TEST ANA MEET DOC)
  comment_text       : abap.char(255);
  entry_source       : abap.char(6);          // TIMER or MANUAL
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
