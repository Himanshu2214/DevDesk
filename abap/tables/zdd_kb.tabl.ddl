@EndUserText.label : 'DevDesk - knowledge article'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_kb {

  key client         : abap.clnt not null;
  key article_uuid   : sysuuid_x16 not null;
  article_no         : abap.numc(8);          // number range ZDD_KB, shown as KB-12
  article_type       : abap.char(4);          // ZDD_VALUE list KBTYPE: SNIP FIX API CONF DECI
  title              : abap.char(120);
  tag_list           : abap.char(255);        // comma separated
  // FIX - error and fix journal
  error_text         : abap.string(0);
  root_cause         : abap.string(0);
  fix_location       : abap.char(255);
  fix_text           : abap.string(0);
  test_note          : abap.string(0);
  // SNIP - code snippet
  code_text          : abap.string(0);
  code_lang          : abap.char(10);
  note_text          : abap.string(0);
  // API - request example (never store credentials)
  http_method        : abap.char(7);
  endpoint           : abap.char(255);
  request_body       : abap.string(0);
  response_body      : abap.string(0);
  response_codes     : abap.char(255);
  auth_reference     : abap.char(255);
  // CONF - configuration steps, one per line
  steps_text         : abap.string(0);
  // DECI - design decision
  context_text       : abap.string(0);
  decision_text      : abap.string(0);
  consequences       : abap.string(0);
  created_by         : abp_creation_user;
  created_at         : abp_creation_tstmpl;
  last_changed_by    : abp_lastchange_user;
  last_changed_at    : abp_lastchange_tstmpl;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
