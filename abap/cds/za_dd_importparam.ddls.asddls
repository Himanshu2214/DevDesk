@EndUserText.label: 'DevDesk - recordImport parameter'
define abstract entity ZA_DD_ImportParam
{
  TargetSystem : abap.char(3);    // QA or PRD
  ReturnCode   : abap.int1;       // 0 ok, 4 warning, 8 error, 12 aborted
}
