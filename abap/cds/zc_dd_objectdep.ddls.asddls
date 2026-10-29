@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - object dependency (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_ObjectDep
  as projection on ZR_DD_ObjectDep
{
  key DepUUID,
      ObjectUUID,
      UsesObjectUUID,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'DEPKIND', element: 'ListType', usage: #FILTER }] }]
      DepKind,
      NoteText,
      LocalLastChanged,

      _Object : redirected to parent ZC_DD_Object
}
