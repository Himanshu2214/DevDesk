@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - acceptance criterion (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_Acceptance
  as projection on ZR_DD_Acceptance
{
  key AccUUID,
      TicketUUID,
      SortOrder,
      Text,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
