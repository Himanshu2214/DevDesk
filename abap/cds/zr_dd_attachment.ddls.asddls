@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - ticket attachment'
define view entity ZR_DD_Attachment
  as select from zdd_att
  association to parent ZR_DD_Ticket as _Ticket on $projection.TicketUUID = _Ticket.TicketUUID
{
  key att_uuid           as AttUUID,
      ticket_uuid        as TicketUUID,
      file_name          as FileName,
      mime_type          as MimeType,
      file_size          as FileSize,
      // Edm.Binary (base64 in JSON); the UI reads it only for a download ($select)
      content            as Content,
      @Semantics.user.createdBy: true
      created_by         as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at         as CreatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Ticket
}
