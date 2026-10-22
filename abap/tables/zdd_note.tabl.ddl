@EndUserText.label : 'DevDesk - comment'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_note {

  key client         : abap.clnt not null;
  key note_uuid      : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  text               : abap.string(0);
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
