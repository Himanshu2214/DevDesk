@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - test case (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_TestCase
  as projection on ZR_DD_TestCase
{
  key TestUUID,
      TicketUUID,
      SortOrder,
      TestName,
      TestSteps,
      Expected,
      Actual,
      TestResult,
      TestedAt,
      TestedBy,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
