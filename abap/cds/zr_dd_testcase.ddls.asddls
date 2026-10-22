@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - test case'
define view entity ZR_DD_TestCase
  as select from zdd_test
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key test_uuid          as TestUUID,
      ticket_uuid        as TicketUUID,
      sort_order         as SortOrder,
      test_name          as TestName,
      test_steps         as TestSteps,
      expected           as Expected,
      actual             as Actual,
      test_result        as TestResult,
      tested_at          as TestedAt,
      tested_by          as TestedBy,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
