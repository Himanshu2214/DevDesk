@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - ticket'
define root view entity ZR_DD_Ticket
  as select from zdd_tkt
  composition [0..*] of ZR_DD_Acceptance    as _Acceptance
  composition [0..*] of ZR_DD_ChecklistItem as _Checklist
  composition [0..*] of ZR_DD_TestCase      as _Test
  composition [0..*] of ZR_DD_Worklog       as _Worklog
  composition [0..*] of ZR_DD_Note          as _Note
  composition [0..*] of ZR_DD_Event         as _Event
  composition [0..*] of ZR_DD_Attachment    as _Attachment
  composition [0..*] of ZR_DD_TicketObject  as _ObjectLink
  association [0..1] to ZI_DD_TicketHours   as _Hours   on $projection.TicketUUID = _Hours.TicketUUID
  association [0..1] to ZI_DD_Project       as _Project on $projection.Project    = _Project.Project
{
  key ticket_uuid        as TicketUUID,
      ticket_no          as TicketNo,
      // TK-1042: readable number, calculated (read-only)
      cast( concat( 'TK-', ltrim( cast( ticket_no as abap.char(8) ), '0' ) ) as abap.char(12) ) as TicketId,
      title              as Title,
      description        as Description,
      status             as Status,
      priority           as Priority,
      project            as Project,
      area               as Area,
      tech               as Tech,
      ticket_type        as TicketType,
      environment        as Environment,
      assignee           as Assignee,
      requester          as Requester,
      reference          as Reference,
      due_date           as DueDate,
      estimate_h         as EstimateHours,
      status_changed_at  as StatusChangedAt,
      closed_at          as ClosedAt,
      timer_started_at   as TimerStartedAt,
      case when status <> 'DONE' and due_date <> '00000000' and due_date < $session.system_date
           then cast( 'X' as abap_boolean ) else cast( ' ' as abap_boolean ) end as IsOverdue,
      @Semantics.user.createdBy: true
      created_by         as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at         as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by    as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at    as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Acceptance,
      _Checklist,
      _Test,
      _Worklog,
      _Note,
      _Event,
      _Attachment,
      _ObjectLink,
      _Hours,
      _Project
}
