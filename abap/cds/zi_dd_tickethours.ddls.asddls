@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'DevDesk - logged hours per ticket'
define view entity ZI_DD_TicketHours
  as select from zdd_wlog
{
  key ticket_uuid                                   as TicketUUID,
      cast( sum( hours ) as abap.dec(9,2) )         as LoggedHours,
      count( * )                                    as EntryCount
}
group by
  ticket_uuid
