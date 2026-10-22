@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'DevDesk - projects (value help)'
@ObjectModel.resultSet.sizeCategory: #XS
define view entity ZI_DD_Project
  as select from zdd_project
{
      @ObjectModel.text.element: ['Name']
  key project    as Project,
      @Semantics.text: true
      name       as Name,
      color      as Color,
      sort_order as SortOrder,
      is_active  as IsActive
}
