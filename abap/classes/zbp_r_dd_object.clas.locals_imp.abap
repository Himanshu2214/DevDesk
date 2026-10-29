*"* Behavior implementation of ZR_DD_Object (DevDesk, phase 2)
*"* Local Types of class ZBP_R_DD_OBJECT

CLASS lhc_techobject DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR TechObject RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR TechObject RESULT result.

    METHODS normalizeObject FOR DETERMINE ON MODIFY
      IMPORTING keys FOR TechObject~normalizeObject.

    METHODS validateObject FOR VALIDATE ON SAVE
      IMPORTING keys FOR TechObject~validateObject.

ENDCLASS.


CLASS lhc_techobject IMPLEMENTATION.

  METHOD get_global_authorizations.
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.


  METHOD get_instance_authorizations.
    DATA lv_auth LIKE if_abap_behv=>auth-allowed.

    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY TechObject FIELDS ( CreatedBy ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_objects)
      FAILED failed.

    LOOP AT lt_objects INTO DATA(ls_object).
      lv_auth = COND #( WHEN ls_object-CreatedBy = sy-uname
                        THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky               = ls_object-%tky
                      %update            = lv_auth
                      %delete            = lv_auth
                      %assoc-_Dependency = lv_auth ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD normalizeObject.
    DATA lt_update TYPE TABLE FOR UPDATE zr_dd_object\\TechObject.

    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY TechObject FIELDS ( ObjectType ObjectName PackageName ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_objects).

    LOOP AT lt_objects INTO DATA(ls_object).
      DATA(lv_type) = to_upper( condense( ls_object-ObjectType ) ).
      " Fiori app IDs, destinations and URLs keep their case
      DATA(lv_name) = COND string( WHEN lv_type = 'FIORI' OR lv_type = 'DEST' OR lv_type = 'API'
                                   THEN condense( ls_object-ObjectName )
                                   ELSE to_upper( condense( ls_object-ObjectName ) ) ).
      DATA(lv_package) = to_upper( condense( ls_object-PackageName ) ).
      " only write real changes, so the determination does not trigger itself again
      IF lv_type <> ls_object-ObjectType OR lv_name <> ls_object-ObjectName OR lv_package <> ls_object-PackageName.
        APPEND VALUE #( %tky        = ls_object-%tky
                        ObjectType  = lv_type
                        ObjectName  = lv_name
                        PackageName = lv_package ) TO lt_update.
      ENDIF.
    ENDLOOP.

    IF lt_update IS NOT INITIAL.
      MODIFY ENTITIES OF zr_dd_object IN LOCAL MODE
        ENTITY TechObject UPDATE FIELDS ( ObjectType ObjectName PackageName ) WITH lt_update.
    ENDIF.
  ENDMETHOD.


  METHOD validateObject.
    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY TechObject FIELDS ( ObjectType ObjectName Project ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_objects).
    IF lt_objects IS INITIAL.
      RETURN.
    ENDIF.

    SELECT code FROM zdd_value
      WHERE list_type = 'OBJTYPE' AND is_active = @abap_true
      INTO TABLE @DATA(lt_types).
    SELECT project FROM zdd_project INTO TABLE @DATA(lt_projects).
    " the same object must not be registered twice
    SELECT object_uuid, obj_type, obj_name FROM zdd_obj
      FOR ALL ENTRIES IN @lt_objects
      WHERE obj_name = @lt_objects-ObjectName
        AND created_by = @sy-uname
      INTO TABLE @DATA(lt_existing).

    LOOP AT lt_objects INTO DATA(ls_object).

      IF ls_object-ObjectName IS INITIAL.
        APPEND VALUE #( %tky = ls_object-%tky ) TO failed-techobject.
        APPEND VALUE #( %tky = ls_object-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Enter the object name' )
                        %element-ObjectName = if_abap_behv=>mk-on ) TO reported-techobject.
      ELSE.
        LOOP AT lt_existing TRANSPORTING NO FIELDS
             WHERE obj_type = ls_object-ObjectType AND obj_name = ls_object-ObjectName
               AND object_uuid <> ls_object-ObjectUUID.
          EXIT.
        ENDLOOP.
        IF sy-subrc = 0.
          APPEND VALUE #( %tky = ls_object-%tky ) TO failed-techobject.
          APPEND VALUE #( %tky = ls_object-%tky
                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                        text     = |{ ls_object-ObjectType } { ls_object-ObjectName } is already registered| )
                          %element-ObjectName = if_abap_behv=>mk-on ) TO reported-techobject.
        ENDIF.
      ENDIF.

      " list not maintained yet: accept any type
      IF ls_object-ObjectType IS INITIAL
         OR ( lt_types IS NOT INITIAL AND NOT line_exists( lt_types[ code = ls_object-ObjectType ] ) ).
        APPEND VALUE #( %tky = ls_object-%tky ) TO failed-techobject.
        APPEND VALUE #( %tky = ls_object-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Type "{ ls_object-ObjectType }" is not in value list OBJTYPE| )
                        %element-ObjectType = if_abap_behv=>mk-on ) TO reported-techobject.
      ENDIF.

      IF ls_object-Project IS NOT INITIAL AND NOT line_exists( lt_projects[ project = ls_object-Project ] ).
        APPEND VALUE #( %tky = ls_object-%tky ) TO failed-techobject.
        APPEND VALUE #( %tky = ls_object-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Project "{ ls_object-Project }" is not maintained in ZDD_PROJECT| )
                        %element-Project = if_abap_behv=>mk-on ) TO reported-techobject.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.

ENDCLASS.


CLASS lhc_objectdependency DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS setDependencyDefaults FOR DETERMINE ON MODIFY
      IMPORTING keys FOR ObjectDependency~setDependencyDefaults.

    METHODS validateDependency FOR VALIDATE ON SAVE
      IMPORTING keys FOR ObjectDependency~validateDependency.

ENDCLASS.


CLASS lhc_objectdependency IMPLEMENTATION.

  METHOD setDependencyDefaults.
    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY ObjectDependency FIELDS ( DepKind ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_deps).

    MODIFY ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY ObjectDependency
        UPDATE FIELDS ( DepKind )
        WITH VALUE #( FOR ls_dep IN lt_deps WHERE ( DepKind IS INITIAL )
                      ( %tky = ls_dep-%tky DepKind = 'USES' ) ).
  ENDMETHOD.


  METHOD validateDependency.
    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY ObjectDependency FIELDS ( ObjectUUID UsesObjectUUID DepKind ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_deps).

    " target objects, read through the BO (objects created in the same request count)
    READ ENTITIES OF zr_dd_object IN LOCAL MODE
      ENTITY TechObject FIELDS ( ObjectUUID )
      WITH VALUE #( FOR ls_target IN lt_deps WHERE ( UsesObjectUUID IS NOT INITIAL ) ( ObjectUUID = ls_target-UsesObjectUUID ) )
      RESULT DATA(lt_targets).

    SELECT code FROM zdd_value
      WHERE list_type = 'DEPKIND' AND is_active = @abap_true
      INTO TABLE @DATA(lt_kinds).

    LOOP AT lt_deps INTO DATA(ls_dep).

      IF ls_dep-UsesObjectUUID IS INITIAL OR NOT line_exists( lt_targets[ ObjectUUID = ls_dep-UsesObjectUUID ] ).
        APPEND VALUE #( %tky = ls_dep-%tky ) TO failed-objectdependency.
        APPEND VALUE #( %tky = ls_dep-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'The used object does not exist' )
                        %element-UsesObjectUUID = if_abap_behv=>mk-on ) TO reported-objectdependency.
      ELSEIF ls_dep-UsesObjectUUID = ls_dep-ObjectUUID.
        APPEND VALUE #( %tky = ls_dep-%tky ) TO failed-objectdependency.
        APPEND VALUE #( %tky = ls_dep-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'An object cannot depend on itself' )
                        %element-UsesObjectUUID = if_abap_behv=>mk-on ) TO reported-objectdependency.
      ENDIF.

      IF lt_kinds IS NOT INITIAL AND NOT line_exists( lt_kinds[ code = ls_dep-DepKind ] ).
        APPEND VALUE #( %tky = ls_dep-%tky ) TO failed-objectdependency.
        APPEND VALUE #( %tky = ls_dep-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Kind "{ ls_dep-DepKind }" is not in value list DEPKIND| )
                        %element-DepKind = if_abap_behv=>mk-on ) TO reported-objectdependency.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
