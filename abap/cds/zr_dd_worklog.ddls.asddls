@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - work log entry'
define view entity ZR_DD_Worklog
  as select from zdd_wlog
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key wlog_uuid          as WorklogUUID,
      ticket_uuid        as TicketUUID,
      work_date          as WorkDate,
      hours              as Hours,
      activity           as Activity,
      comment_text       as CommentText,
      entry_source       as EntrySource,
      @Semantics.user.createdBy: true
      created_by         as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at         as CreatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
