@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - article link'
define view entity ZR_DD_ArticleLink
  as select from zdd_kb_link
  association to parent ZR_DD_Article as _Article on $projection.ArticleUUID = _Article.ArticleUUID
{
  key link_uuid          as LinkUUID,
      article_uuid       as ArticleUUID,
      ticket_uuid        as TicketUUID,
      object_uuid        as ObjectUUID,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Article
}
