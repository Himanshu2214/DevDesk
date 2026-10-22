@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - comment'
define view entity ZR_DD_Note
  as select from zdd_note
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key note_uuid          as NoteUUID,
      ticket_uuid        as TicketUUID,
      text               as Text,
      @Semantics.user.createdBy: true
      created_by         as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at         as CreatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
