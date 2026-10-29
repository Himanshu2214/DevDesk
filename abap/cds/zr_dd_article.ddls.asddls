@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - knowledge article'
define root view entity ZR_DD_Article
  as select from zdd_kb
  composition [0..*] of ZR_DD_ArticleLink as _Link
{
  key article_uuid       as ArticleUUID,
      article_no         as ArticleNo,
      // KB-12: readable number, calculated (read-only)
      cast( concat( 'KB-', ltrim( cast( article_no as abap.char(8) ), '0' ) ) as abap.char(12) ) as ArticleId,
      article_type       as ArticleType,
      title              as Title,
      tag_list           as Tags,
      error_text         as ErrorText,
      root_cause         as RootCause,
      fix_location       as FixLocation,
      fix_text           as FixText,
      test_note          as TestNote,
      code_text          as CodeText,
      code_lang          as CodeLang,
      note_text          as NoteText,
      http_method        as HttpMethod,
      endpoint           as Endpoint,
      request_body       as RequestBody,
      response_body      as ResponseBody,
      response_codes     as ResponseCodes,
      auth_reference     as AuthReference,
      steps_text         as StepsText,
      context_text       as ContextText,
      decision_text      as DecisionText,
      consequences       as Consequences,
      @Semantics.user.createdBy: true
      created_by         as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at         as CreatedAt,
      @Semantics.user.lastChangedBy: true
      last_changed_by    as LastChangedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_changed_at    as LastChangedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Link
}
