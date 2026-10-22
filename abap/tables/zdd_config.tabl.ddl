@EndUserText.label : 'DevDesk - configuration'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
define table zdd_config {

  key client : abap.clnt not null;
  key param  : abap.char(30) not null;        // WEEK_HOURS, MISSING_TIME_DAYS, POLL_SECONDS (phase 3: QA_SID, PRD_SID)
  value      : abap.char(255);

}
