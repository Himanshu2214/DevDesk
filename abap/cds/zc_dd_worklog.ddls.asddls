@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - work log entry (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_Worklog
  as projection on ZR_DD_Worklog
{
  key WorklogUUID,
      TicketUUID,
      WorkDate,
      Hours,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'ACTIVITY', element: 'ListType', usage: #FILTER }] }]
      Activity,
      CommentText,
      EntrySource,
      CreatedBy,
      CreatedAt,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
