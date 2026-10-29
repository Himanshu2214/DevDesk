@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - ticket attachment (projection)'
@Metadata.allowExtensions: true
define view entity ZC_DD_Attachment
  as projection on ZR_DD_Attachment
{
  key AttUUID,
      TicketUUID,
      FileName,
      MimeType,
      FileSize,
      Content,
      CreatedBy,
      CreatedAt,
      LocalLastChanged,

      _Ticket : redirected to parent ZC_DD_Ticket
}
