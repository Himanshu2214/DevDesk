@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - technical object (projection)'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_DD_Object
  provider contract transactional_query
  as projection on ZR_DD_Object
{
  key ObjectUUID,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'OBJTYPE', element: 'ListType', usage: #FILTER }] }]
      ObjectType,
      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      ObjectName,
      @Search.defaultSearchElement: true
      Description,
      PackageName,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Project', element: 'Project' } }]
      Project,
      Notes,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChanged,

      _Dependency : redirected to composition child ZC_DD_ObjectDep,
      _Project
}
