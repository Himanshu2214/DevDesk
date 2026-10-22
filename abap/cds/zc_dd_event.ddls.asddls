@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - event (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_Event
  as projection on ZR_DD_Event
{
  key EventUUID,
      TicketUUID,
      EventKind,
      StatusFrom,
      StatusTo,
      Text,
      EventAt,
      EventBy,
      IsRead,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
