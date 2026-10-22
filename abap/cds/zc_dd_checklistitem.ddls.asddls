@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - release checklist item (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_ChecklistItem
  as projection on ZR_DD_ChecklistItem
{
  key ItemUUID,
      TicketUUID,
      SortOrder,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'CHECKCAT', element: 'ListType', usage: #FILTER }] }]
      Category,
      Text,
      IsDone,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
