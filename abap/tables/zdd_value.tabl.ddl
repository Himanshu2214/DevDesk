@EndUserText.label : 'DevDesk - value lists'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
define table zdd_value {

  key client    : abap.clnt not null;
  key list_type : abap.char(10) not null;     // STATUS AREA TECH TYPE ACTIVITY CHECKCAT
  key code      : abap.char(10) not null;
  text          : abap.char(60);
  sort_order    : abap.int2;
  color         : abap.char(7);
  wip_limit     : abap.int2;                  // STATUS only, 0 = no limit
  is_active     : abap_boolean;

}
