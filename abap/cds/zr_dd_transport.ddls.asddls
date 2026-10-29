@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - transport'
define root view entity ZR_DD_Transport
  as select from zdd_tr
  composition [0..*] of ZR_DD_TransportDep as _Dependency
{
  key tr_uuid            as TransportUUID,
      trkorr             as TrKorr,
      ticket_uuid        as TicketUUID,
      tr_text            as TrText,
      tr_kind            as TrKind,
      tr_owner           as TrOwner,
      released_on        as ReleasedOn,
      qa_rc              as QaRc,
      qa_imported_at     as QaImportedAt,
      prd_rc             as PrdRc,
      prd_imported_at    as PrdImportedAt,
      // tracker column: DEV (not imported yet), QA, PRD, FAILED (last import ended with RC > 4)
      cast( case when prd_imported_at > 0 and prd_rc > 4 then 'FAILED'
                 when prd_imported_at > 0                 then 'PRD'
                 when qa_imported_at > 0 and qa_rc > 4   then 'FAILED'
                 when qa_imported_at > 0                  then 'QA'
                 else 'DEV' end as abap.char(6) ) as Phase,
      test_evidence      as TestEvidence,
      deploy_notes       as DeployNotes,
      rollback_notes     as RollbackNotes,
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

      _Dependency
}
