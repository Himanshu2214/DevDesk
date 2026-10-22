@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - release checklist item'
define view entity ZR_DD_ChecklistItem
  as select from zdd_chk
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key item_uuid          as ItemUUID,
      ticket_uuid        as TicketUUID,
      sort_order         as SortOrder,
      category           as Category,
      text               as Text,
      is_done            as IsDone,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
