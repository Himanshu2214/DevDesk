@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - knowledge article (projection)'
@Metadata.allowExtensions: true
@Search.searchable: true
define root view entity ZC_DD_Article
  provider contract transactional_query
  as projection on ZR_DD_Article
{
  key ArticleUUID,
      ArticleNo,
      ArticleId,
      @Consumption.valueHelpDefinition: [{ entity: { name: 'ZI_DD_Value', element: 'Code' },
                                           additionalBinding: [{ localConstant: 'KBTYPE', element: 'ListType', usage: #FILTER }] }]
      ArticleType,
      @Search.defaultSearchElement: true
      @Search.fuzzinessThreshold: 0.8
      Title,
      @Search.defaultSearchElement: true
      Tags,
      ErrorText,
      RootCause,
      FixLocation,
      FixText,
      TestNote,
      CodeText,
      CodeLang,
      NoteText,
      HttpMethod,
      Endpoint,
      RequestBody,
      ResponseBody,
      ResponseCodes,
      AuthReference,
      StepsText,
      ContextText,
      DecisionText,
      Consequences,
      CreatedBy,
      CreatedAt,
      LastChangedBy,
      LastChangedAt,
      LocalLastChanged,

      _Link : redirected to composition child ZC_DD_ArticleLink
}
