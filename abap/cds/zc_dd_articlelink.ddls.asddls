@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - article link (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_ArticleLink
  as projection on ZR_DD_ArticleLink
{
  key LinkUUID,
      ArticleUUID,
      TicketUUID,
      ObjectUUID,
      LocalLastChanged,

      _Article : redirected to parent ZC_DD_Article
}
