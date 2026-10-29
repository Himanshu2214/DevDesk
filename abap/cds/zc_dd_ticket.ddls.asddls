@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - ticket (projection)'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_DD_Ticket
  provider contract transactional_query
  as projection on ZR_DD_Ticket
{
  key TicketUUID,
      TicketNo,
      TicketId,
      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      Title,
      Description,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'STATUS', element: 'ListType', usage: #FILTER }] }]
      Status,
      Priority,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Project', element: 'Project' } }]
      @ObjectModel.text.element: ['ProjectName']
      Project,
      _Project.Name      as ProjectName,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'AREA', element: 'ListType', usage: #FILTER }] }]
      Area,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'TECH', element: 'ListType', usage: #FILTER }] }]
      Tech,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'TYPE', element: 'ListType', usage: #FILTER }] }]
      TicketType,
      Environment,
      Assignee,
      @Search.defaultSearchElement: true
      Requester,
      Reference,
      DueDate,
      EstimateHours,
      _Hours.LoggedHours as LoggedHours,
      StatusChangedAt,
      ClosedAt,
      TimerStartedAt,
      IsOverdue,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChanged,

      _Acceptance : redirected to composition child ZC_DD_Acceptance,
      _Checklist  : redirected to composition child ZC_DD_ChecklistItem,
      _Test       : redirected to composition child ZC_DD_TestCase,
      _Worklog    : redirected to composition child ZC_DD_Worklog,
      _Note       : redirected to composition child ZC_DD_Note,
      _Event      : redirected to composition child ZC_DD_Event,
      _Attachment : redirected to composition child ZC_DD_Attachment,
      _ObjectLink : redirected to composition child ZC_DD_TicketObject,
      _Project
}
