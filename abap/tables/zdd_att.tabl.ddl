@EndUserText.label : 'DevDesk - ticket attachment'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_att {

  key client         : abap.clnt not null;
  key att_uuid       : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  file_name          : abap.char(255);
  mime_type          : abap.char(128);
  file_size          : abap.int4;             // bytes, set from content
  content            : abap.rawstring(0);     // at most 10 MB (validation)
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
