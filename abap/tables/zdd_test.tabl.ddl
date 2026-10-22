@EndUserText.label : 'DevDesk - test case'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_test {

  key client         : abap.clnt not null;
  key test_uuid      : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  sort_order         : abap.int2;
  test_name          : abap.char(255);
  test_steps         : abap.char(1000);
  expected           : abap.char(255);
  actual             : abap.char(255);
  test_result        : abap.char(4);          // OPEN PASS FAIL
  tested_at          : timestampl;
  tested_by          : syuname;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
