*"* Behavior implementation of ZR_DD_Transport (DevDesk, phase 2)
*"* Local Types of class ZBP_R_DD_TRANSPORT

CLASS lhc_transport DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    CONSTANTS gc_trkorr_pattern TYPE string VALUE `^[A-Z0-9]{3}[KT][0-9]{6}$`.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Transport RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR Transport RESULT result.

    METHODS markReleased FOR MODIFY
      IMPORTING keys FOR ACTION Transport~markReleased RESULT result.

    METHODS recordImport FOR MODIFY
      IMPORTING keys FOR ACTION Transport~recordImport RESULT result.

    METHODS setTransportDefaults FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Transport~setTransportDefaults.

    METHODS validateTransport FOR VALIDATE ON SAVE
      IMPORTING keys FOR Transport~validateTransport.

ENDCLASS.


CLASS lhc_transport IMPLEMENTATION.

  METHOD get_global_authorizations.
    " Same rule as for tickets: anyone who may call the service may create; changes are checked per instance (owner)
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%action-markReleased = if_abap_behv=>mk-on.
      result-%action-markReleased = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%action-recordImport = if_abap_behv=>mk-on.
      result-%action-recordImport = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.


  METHOD get_instance_authorizations.
    DATA lv_auth LIKE if_abap_behv=>auth-allowed.

    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport FIELDS ( CreatedBy ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_transports)
      FAILED failed.

    LOOP AT lt_transports INTO DATA(ls_transport).
      lv_auth = COND #( WHEN ls_transport-CreatedBy = sy-uname
                        THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky                 = ls_transport-%tky
                      %update              = lv_auth
                      %delete              = lv_auth
                      %action-markReleased = lv_auth
                      %action-recordImport = lv_auth
                      %assoc-_Dependency   = lv_auth ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD markReleased.
    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport FIELDS ( ReleasedOn ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_transports).

    " keeps an existing release date
    MODIFY ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport
        UPDATE FIELDS ( ReleasedOn )
        WITH VALUE #( FOR ls_open IN lt_transports WHERE ( ReleasedOn IS INITIAL )
                      ( %tky = ls_open-%tky ReleasedOn = sy-datlo ) ).

    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_result IN lt_result ( %tky = ls_result-%tky %param = ls_result ) ).
  ENDMETHOD.


  METHOD recordImport.
    DATA lt_qa     TYPE TABLE FOR UPDATE zr_dd_transport\\Transport.
    DATA lt_prd    TYPE TABLE FOR UPDATE zr_dd_transport\\Transport.
    DATA lv_now    TYPE timestampl.
    DATA lv_system TYPE c LENGTH 3.

    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport FIELDS ( ReleasedOn ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_transports).

    GET TIME STAMP FIELD lv_now.

    LOOP AT keys INTO DATA(ls_key).
      lv_system = to_upper( ls_key-%param-TargetSystem ).
      IF lv_system <> 'QA' AND lv_system <> 'PRD'.
        APPEND VALUE #( %tky = ls_key-%tky ) TO failed-transport.
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Target system must be QA or PRD, not "{ lv_system }"| ) )
          TO reported-transport.
        CONTINUE.
      ENDIF.

      READ TABLE lt_transports INTO DATA(ls_transport) WITH KEY TransportUUID = ls_key-TransportUUID.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      " an import means the request was released, even if nobody recorded it
      IF ls_transport-ReleasedOn IS INITIAL.
        ls_transport-ReleasedOn = sy-datlo.
      ENDIF.

      IF lv_system = 'QA'.
        APPEND VALUE #( %tky         = ls_transport-%tky
                        ReleasedOn   = ls_transport-ReleasedOn
                        QaRc         = ls_key-%param-ReturnCode
                        QaImportedAt = lv_now ) TO lt_qa.
      ELSE.
        APPEND VALUE #( %tky          = ls_transport-%tky
                        ReleasedOn    = ls_transport-ReleasedOn
                        PrdRc         = ls_key-%param-ReturnCode
                        PrdImportedAt = lv_now ) TO lt_prd.
      ENDIF.
    ENDLOOP.

    MODIFY ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport
        UPDATE FIELDS ( ReleasedOn QaRc QaImportedAt ) WITH lt_qa
      ENTITY Transport
        UPDATE FIELDS ( ReleasedOn PrdRc PrdImportedAt ) WITH lt_prd.

    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_result IN lt_result ( %tky = ls_result-%tky %param = ls_result ) ).
  ENDMETHOD.


  METHOD setTransportDefaults.
    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport FIELDS ( TrKorr TrKind TrOwner ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_transports).

    MODIFY ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport
        UPDATE FIELDS ( TrKorr TrKind TrOwner )
        WITH VALUE #( FOR ls_transport IN lt_transports
                      ( %tky    = ls_transport-%tky
                        TrKorr  = to_upper( condense( ls_transport-TrKorr ) )
                        TrKind  = COND #( WHEN ls_transport-TrKind IS INITIAL THEN 'K' ELSE ls_transport-TrKind )
                        TrOwner = COND #( WHEN ls_transport-TrOwner IS INITIAL THEN sy-uname ELSE ls_transport-TrOwner ) ) ).
  ENDMETHOD.


  METHOD validateTransport.
    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY Transport FIELDS ( TrKorr TicketUUID TrKind ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_transports).
    IF lt_transports IS INITIAL.
      RETURN.
    ENDIF.

    " the same request must not be tracked twice
    SELECT tr_uuid, trkorr FROM zdd_tr
      FOR ALL ENTRIES IN @lt_transports
      WHERE trkorr = @lt_transports-TrKorr
        AND created_by = @sy-uname
      INTO TABLE @DATA(lt_existing).

    " linked tickets must exist (read through the ticket BO, so new tickets in the same request count)
    READ ENTITIES OF zr_dd_ticket
      ENTITY Ticket FIELDS ( TicketUUID )
      WITH VALUE #( FOR ls_link IN lt_transports WHERE ( TicketUUID IS NOT INITIAL ) ( TicketUUID = ls_link-TicketUUID ) )
      RESULT DATA(lt_tickets).

    LOOP AT lt_transports INTO DATA(ls_transport).

      IF NOT matches( val = ls_transport-TrKorr pcre = gc_trkorr_pattern ).
        APPEND VALUE #( %tky = ls_transport-%tky ) TO failed-transport.
        APPEND VALUE #( %tky = ls_transport-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |"{ ls_transport-TrKorr }" is not a transport request (e.g. S4DK900123)| )
                        %element-TrKorr = if_abap_behv=>mk-on ) TO reported-transport.
      ELSE.
        LOOP AT lt_existing TRANSPORTING NO FIELDS
             WHERE trkorr = ls_transport-TrKorr AND tr_uuid <> ls_transport-TransportUUID.
          EXIT.
        ENDLOOP.
        IF sy-subrc = 0.
          APPEND VALUE #( %tky = ls_transport-%tky ) TO failed-transport.
          APPEND VALUE #( %tky = ls_transport-%tky
                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                        text     = |{ ls_transport-TrKorr } is already in the tracker| )
                          %element-TrKorr = if_abap_behv=>mk-on ) TO reported-transport.
        ENDIF.
      ENDIF.

      IF ls_transport-TicketUUID IS NOT INITIAL AND NOT line_exists( lt_tickets[ TicketUUID = ls_transport-TicketUUID ] ).
        APPEND VALUE #( %tky = ls_transport-%tky ) TO failed-transport.
        APPEND VALUE #( %tky = ls_transport-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'The linked ticket does not exist' )
                        %element-TicketUUID = if_abap_behv=>mk-on ) TO reported-transport.
      ENDIF.

      IF ls_transport-TrKind <> 'K' AND ls_transport-TrKind <> 'W'.
        APPEND VALUE #( %tky = ls_transport-%tky ) TO failed-transport.
        APPEND VALUE #( %tky = ls_transport-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Kind must be K (workbench) or W (customizing)' )
                        %element-TrKind = if_abap_behv=>mk-on ) TO reported-transport.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.

ENDCLASS.


CLASS lhc_transportdependency DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS validateDependency FOR VALIDATE ON SAVE
      IMPORTING keys FOR TransportDependency~validateDependency.

ENDCLASS.


CLASS lhc_transportdependency IMPLEMENTATION.

  METHOD validateDependency.
    READ ENTITIES OF zr_dd_transport IN LOCAL MODE
      ENTITY TransportDependency FIELDS ( TransportUUID DependsOn ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_deps)
      ENTITY TransportDependency BY \_Transport FIELDS ( TrKorr ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_parents).

    LOOP AT lt_deps INTO DATA(ls_dep).
      IF NOT matches( val = ls_dep-DependsOn pcre = `^[A-Z0-9]{3}[KT][0-9]{6}$` ).
        APPEND VALUE #( %tky = ls_dep-%tky ) TO failed-transportdependency.
        APPEND VALUE #( %tky = ls_dep-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |"{ ls_dep-DependsOn }" is not a transport request| )
                        %element-DependsOn = if_abap_behv=>mk-on ) TO reported-transportdependency.
      ELSEIF line_exists( lt_parents[ TransportUUID = ls_dep-TransportUUID TrKorr = ls_dep-DependsOn ] ).
        APPEND VALUE #( %tky = ls_dep-%tky ) TO failed-transportdependency.
        APPEND VALUE #( %tky = ls_dep-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'A transport cannot depend on itself' )
                        %element-DependsOn = if_abap_behv=>mk-on ) TO reported-transportdependency.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
