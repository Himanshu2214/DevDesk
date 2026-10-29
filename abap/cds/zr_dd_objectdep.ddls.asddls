@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - object dependency'
define view entity ZR_DD_ObjectDep
  as select from zdd_obj_dep
  association to parent ZR_DD_Object as _Object on $projection.ObjectUUID = _Object.ObjectUUID
{
  key dep_uuid           as DepUUID,
      object_uuid        as ObjectUUID,
      uses_object_uuid   as UsesObjectUUID,
      dep_kind           as DepKind,
      note_text          as NoteText,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_changed as LocalLastChanged,

      _Object
}
