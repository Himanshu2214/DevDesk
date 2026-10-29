@EndUserText.label : 'DevDesk - article link to ticket or object'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_kb_link {

  key client         : abap.clnt not null;
  key link_uuid      : sysuuid_x16 not null;
  article_uuid       : sysuuid_x16;
  ticket_uuid        : sysuuid_x16;           // either a ticket ...
  object_uuid        : sysuuid_x16;           // ... or an object
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
