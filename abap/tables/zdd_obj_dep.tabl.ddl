@EndUserText.label : 'DevDesk - object dependency (impact map edge)'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_obj_dep {

  key client         : abap.clnt not null;
  key dep_uuid       : sysuuid_x16 not null;
  object_uuid        : sysuuid_x16;           // the dependent object
  uses_object_uuid   : sysuuid_x16;           // the object it uses
  dep_kind           : abap.char(8);          // ZDD_VALUE list DEPKIND (USES, EXPOSES, CALLS)
  note_text          : abap.char(60);
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
