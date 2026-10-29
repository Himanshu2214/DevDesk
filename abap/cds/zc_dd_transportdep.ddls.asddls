@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - transport dependency (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_TransportDep
  as projection on ZR_DD_TransportDep
{
  key DepUUID,
      TransportUUID,
      DependsOn,
      NoteText,
      LocalLastChanged,

      _Transport : redirected to parent ZC_DD_Transport
}
