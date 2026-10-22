@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - event (activity and inbox)'
define view entity ZR_DD_Event
  as select from zdd_event
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key event_uuid         as EventUUID,
      ticket_uuid        as TicketUUID,
      event_kind         as EventKind,
      status_from        as StatusFrom,
      status_to          as StatusTo,
      text               as Text,
      event_at           as EventAt,
      event_by           as EventBy,
      is_read            as IsRead,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
