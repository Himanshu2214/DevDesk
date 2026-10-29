@EndUserText.label : 'DevDesk - transport'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_tr {

  key client         : abap.clnt not null;
  key tr_uuid        : sysuuid_x16 not null;
  trkorr             : trkorr;                // e.g. S4DK900123
  ticket_uuid        : sysuuid_x16;           // ZDD_TKT (optional)
  tr_text            : abap.char(60);
  tr_kind            : abap.char(1);          // K workbench, W customizing
  tr_owner           : syuname;
  released_on        : abap.dats;             // action markReleased
  qa_rc              : abap.int1;             // action recordImport
  qa_imported_at     : timestampl;
  prd_rc             : abap.int1;
  prd_imported_at    : timestampl;
  test_evidence      : abap.string(0);
  deploy_notes       : abap.string(0);
  rollback_notes     : abap.string(0);
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  last_changed_by    : abp_lastchange_user;
  last_changed_at    : abp_lastchange_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
