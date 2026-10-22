@EndUserText.label : 'DevDesk - acceptance criterion'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_acc {

  key client         : abap.clnt not null;
  key acc_uuid       : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  sort_order         : abap.int2;
  text               : abap.char(255);
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
