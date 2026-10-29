@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - object changed by a ticket'
define view entity ZR_DD_TicketObject
  as select from zdd_tobj
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key link_uuid          as LinkUUID,
      ticket_uuid        as TicketUUID,
      object_uuid        as ObjectUUID,
      change_kind        as ChangeKind,
      note_text          as NoteText,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
