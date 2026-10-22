@EndUserText.label : 'DevDesk - projects'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
define table zdd_project {

  key client  : abap.clnt not null;
  key project : abap.char(10) not null;
  name        : abap.char(60);
  color       : abap.char(7);                 // hex colour for the UI, e.g. #4EA7FC
  sort_order  : abap.int2;
  is_active   : abap_boolean;

}
