@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'DevDesk - technical object'
define root view entity ZR_DD_Object
  as select from zdd_obj
  composition [0..*] of ZR_DD_ObjectDep as _Dependency
  association [0..1] to ZI_DD_Project   as _Project on $projection.Project = _Project.Project
{
  key object_uuid        as ObjectUUID,
      obj_type           as ObjectType,
      obj_name           as ObjectName,
      description        as Description,
      devclass           as PackageName,
      project            as Project,
      notes              as Notes,
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

      _Dependency,
      _Project
}
