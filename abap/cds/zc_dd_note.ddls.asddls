@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - comment (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_Note
  as projection on ZR_DD_Note
{
  key NoteUUID,
      TicketUUID,
      Text,
      CreatedBy,
      CreatedAt,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
