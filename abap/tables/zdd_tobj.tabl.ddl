@EndUserText.label : 'DevDesk - object changed by a ticket'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_tobj {

  key client         : abap.clnt not null;
  key link_uuid      : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  object_uuid        : sysuuid_x16;           // ZDD_OBJ
  change_kind        : abap.char(8);          // NEW, CHANGE, CHECK
  note_text          : abap.char(60);
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
