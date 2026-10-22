@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'DevDesk - value lists (value help)'
@ObjectModel.resultSet.sizeCategory: #XS
define view entity ZI_DD_Value
  as select from zdd_value
{
  key list_type  as ListType,
      @ObjectModel.text.element: ['Text']
  key code       as Code,
      @Semantics.text: true
      text       as Text,
      sort_order as SortOrder,
      color      as Color,
      wip_limit  as WipLimit,
      is_active  as IsActive
}
