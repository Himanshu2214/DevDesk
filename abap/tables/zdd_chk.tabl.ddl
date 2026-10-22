@EndUserText.label : 'DevDesk - release checklist item'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_chk {

  key client         : abap.clnt not null;
  key item_uuid      : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  sort_order         : abap.int2;
  category           : abap.char(10);         // ZDD_VALUE list CHECKCAT (UNIT INTEG AUTH ERROR PERF TRANSPORT)
  text               : abap.char(120);
  is_done            : abap_boolean;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
