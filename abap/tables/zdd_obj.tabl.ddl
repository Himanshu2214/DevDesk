@EndUserText.label : 'DevDesk - technical object'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_obj {

  key client         : abap.clnt not null;
  key object_uuid    : sysuuid_x16 not null;
  obj_type           : abap.char(10);         // ZDD_VALUE list OBJTYPE (TABL, DDLS, CLAS, FIORI, API, ...)
  obj_name           : abap.char(120);
  description        : abap.char(120);
  devclass           : devclass;
  project            : abap.char(10);         // ZDD_PROJECT (optional)
  notes              : abap.string(0);
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  last_changed_by    : abp_lastchange_user;
  last_changed_at    : abp_lastchange_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
