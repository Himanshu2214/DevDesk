@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - acceptance criterion'
define view entity ZR_DD_Acceptance
  as select from zdd_acc
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key acc_uuid           as AccUUID,
      ticket_uuid        as TicketUUID,
      sort_order         as SortOrder,
      text               as Text,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
