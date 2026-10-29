@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - transport (projection)'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_DD_Transport
  provider contract transactional_query
  as projection on ZR_DD_Transport
{
  key TransportUUID,
      @Search.defaultSearchElement: true
      TrKorr,
      TicketUUID,
      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      TrText,
      TrKind,
      TrOwner,
      ReleasedOn,
      QaRc,
      QaImportedAt,
      PrdRc,
      PrdImportedAt,
      Phase,
      TestEvidence,
      DeployNotes,
      RollbackNotes,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChanged,

      _Dependency : redirected to composition child ZC_DD_TransportDep
}
