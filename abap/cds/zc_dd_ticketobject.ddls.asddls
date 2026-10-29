@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - object changed by a ticket (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_TicketObject
  as projection on ZR_DD_TicketObject
{
  key LinkUUID,
      TicketUUID,
      ObjectUUID,
      ChangeKind,
      NoteText,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
