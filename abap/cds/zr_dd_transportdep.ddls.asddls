@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - transport dependency'
define view entity ZR_DD_TransportDep
  as select from zdd_tr_dep
  association to parent ZR_DD_Transport as _Transport on $projection.TransportUUID = _Transport.TransportUUID
{
  key dep_uuid           as DepUUID,
      tr_uuid            as TransportUUID,
      depends_on         as DependsOn,
      note_text          as NoteText,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Transport
}
