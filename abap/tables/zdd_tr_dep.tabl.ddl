@EndUserText.label : 'DevDesk - transport dependency'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_tr_dep {

  key client         : abap.clnt not null;
  key dep_uuid       : sysuuid_x16 not null;
  tr_uuid            : sysuuid_x16;
  depends_on         : trkorr;                // must be imported before tr_uuid
  note_text          : abap.char(60);
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
