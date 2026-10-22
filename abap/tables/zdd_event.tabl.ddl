@EndUserText.label : 'DevDesk - event (activity and inbox)'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdd_event {

  key client         : abap.clnt not null;
  key event_uuid     : sysuuid_x16 not null;
  ticket_uuid        : sysuuid_x16;
  event_kind         : abap.char(4);          // STAT status change (phase 3 adds TRIM / TRER)
  status_from        : abap.char(8);
  status_to          : abap.char(8);
  text               : abap.char(255);
  event_at           : timestampl;
  event_by           : syuname;
  is_read            : abap_boolean;
  local_last_changed : abp_locinst_lastchange_tstmpl;

}
