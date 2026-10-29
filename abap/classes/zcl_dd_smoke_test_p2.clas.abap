"! DevDesk phase 2 smoke test - run in ADT with F9 (console application).
"! Registers two objects with a dependency, creates a ticket with an object link and an attachment,
"! tracks a transport with a dependency and a QA import, writes a knowledge article and deletes everything again.
CLASS zcl_dd_smoke_test_p2 DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

  PRIVATE SECTION.
    "! Set to abap_false to keep the test data for a look in the app
    CONSTANTS gc_delete_afterwards TYPE abap_boolean VALUE abap_true.

    METHODS ok
      IMPORTING iv_failed     TYPE abap_boolean
      RETURNING VALUE(rv_text) TYPE string.

ENDCLASS.


CLASS zcl_dd_smoke_test_p2 IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.
    DATA lv_article TYPE sysuuid_x16.

    " 1. Object registry: a table and a class, then "class uses table"
    MODIFY ENTITIES OF zr_dd_object
      ENTITY TechObject
        CREATE FIELDS ( ObjectType ObjectName Description Project )
        WITH VALUE #( ( %cid = 'O1' ObjectType = 'TABL' ObjectName = 'zdd_smoke_tab' Description = 'Smoke test table' Project = 'CORE' )
                      ( %cid = 'O2' ObjectType = 'CLAS' ObjectName = 'zcl_dd_smoke_cls' Description = 'Smoke test class' Project = 'CORE' ) )
      MAPPED DATA(ls_obj_mapped)
      FAILED DATA(ls_obj_failed).
    COMMIT ENTITIES RESPONSE OF zr_dd_object FAILED DATA(ls_obj_commit) REPORTED DATA(ls_obj_reported).
    IF ls_obj_failed IS NOT INITIAL OR ls_obj_commit IS NOT INITIAL.
      out->write( '1. Objects FAILED (did ZDD_SETUP run? It fills value list OBJTYPE)' ).
      LOOP AT ls_obj_reported-techobject INTO DATA(ls_obj_msg) WHERE %msg IS BOUND.
        out->write( |   { ls_obj_msg-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
      RETURN.
    ENDIF.
    DATA(lv_table) = ls_obj_mapped-techobject[ %cid = 'O1' ]-ObjectUUID.
    DATA(lv_class) = ls_obj_mapped-techobject[ %cid = 'O2' ]-ObjectUUID.

    MODIFY ENTITIES OF zr_dd_object
      ENTITY TechObject CREATE BY \_Dependency FIELDS ( UsesObjectUUID )
        WITH VALUE #( ( ObjectUUID = lv_class %target = VALUE #( ( %cid = 'D1' UsesObjectUUID = lv_table ) ) ) )
      FAILED ls_obj_failed.
    COMMIT ENTITIES RESPONSE OF zr_dd_object FAILED ls_obj_commit.
    READ ENTITIES OF zr_dd_object
      ENTITY TechObject BY \_Dependency ALL FIELDS WITH VALUE #( ( ObjectUUID = lv_class ) ) RESULT DATA(lt_deps)
      ENTITY TechObject ALL FIELDS WITH VALUE #( ( ObjectUUID = lv_table ) ) RESULT DATA(lt_tables).
    out->write( |1. Objects { ok( xsdbool( ls_obj_failed IS NOT INITIAL OR ls_obj_commit IS NOT INITIAL ) ) }: | &&
                |name { COND string( WHEN lt_tables IS NOT INITIAL THEN lt_tables[ 1 ]-ObjectName ELSE '-' ) } (expect ZDD_SMOKE_TAB), | &&
                |dependencies { lines( lt_deps ) } kind { COND string( WHEN lt_deps IS NOT INITIAL THEN lt_deps[ 1 ]-DepKind ELSE '-' ) } (expect 1 USES)| ).

    " 2. Ticket with an object link and a small attachment
    MODIFY ENTITIES OF zr_dd_ticket
      ENTITY Ticket
        CREATE FIELDS ( Title Project Area Tech TicketType )
        WITH VALUE #( ( %cid = 'T1' Title = 'DevDesk phase 2 smoke test' Project = 'CORE' Area = 'BASIS' Tech = 'RAP' TicketType = 'CR' ) )
        CREATE BY \_ObjectLink FIELDS ( ObjectUUID )
        WITH VALUE #( ( %cid_ref = 'T1' %target = VALUE #( ( %cid = 'L1' ObjectUUID = lv_class ) ) ) )
        CREATE BY \_Attachment FIELDS ( FileName MimeType Content )
        WITH VALUE #( ( %cid_ref = 'T1' %target = VALUE #( ( %cid = 'F1' FileName = 'hello.txt' MimeType = 'text/plain'
                                                             Content = cl_abap_conv_codepage=>create_out( )->convert( `Hello` ) ) ) ) )
      MAPPED DATA(ls_tkt_mapped)
      FAILED DATA(ls_tkt_failed).
    COMMIT ENTITIES RESPONSE OF zr_dd_ticket FAILED DATA(ls_tkt_commit) REPORTED DATA(ls_tkt_reported).
    IF ls_tkt_failed IS NOT INITIAL OR ls_tkt_commit IS NOT INITIAL.
      out->write( '2. Ticket FAILED' ).
      LOOP AT ls_tkt_reported-objectlink INTO DATA(ls_link_msg) WHERE %msg IS BOUND.
        out->write( |   Object link: { ls_link_msg-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
      LOOP AT ls_tkt_reported-attachment INTO DATA(ls_att_msg) WHERE %msg IS BOUND.
        out->write( |   Attachment: { ls_att_msg-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
      RETURN.
    ENDIF.
    DATA(lv_ticket) = ls_tkt_mapped-ticket[ 1 ]-TicketUUID.
    READ ENTITIES OF zr_dd_ticket
      ENTITY Ticket ALL FIELDS WITH VALUE #( ( TicketUUID = lv_ticket ) ) RESULT DATA(lt_ticket)
      ENTITY Ticket BY \_Attachment FIELDS ( FileSize MimeType ) WITH VALUE #( ( TicketUUID = lv_ticket ) ) RESULT DATA(lt_files)
      ENTITY Ticket BY \_ObjectLink FIELDS ( ChangeKind ) WITH VALUE #( ( TicketUUID = lv_ticket ) ) RESULT DATA(lt_links).
    out->write( |2. Ticket { COND string( WHEN lt_ticket IS NOT INITIAL THEN lt_ticket[ 1 ]-TicketId ELSE '-' ) }: | &&
                |attachment size { COND string( WHEN lt_files IS NOT INITIAL THEN |{ lt_files[ 1 ]-FileSize }| ELSE '-' ) } (expect 5), | &&
                |object links { lines( lt_links ) } kind { COND string( WHEN lt_links IS NOT INITIAL THEN lt_links[ 1 ]-ChangeKind ELSE '-' ) } (expect 1 CHANGE)| ).

    " 3. Transport linked to the ticket, one dependency, then imported into QA with RC 4
    DATA(lv_trkorr) = CONV trkorr( |ZZZK{ sy-uzeit }| ).
    MODIFY ENTITIES OF zr_dd_transport
      ENTITY Transport
        CREATE FIELDS ( TrKorr TrText TicketUUID )
        WITH VALUE #( ( %cid = 'R1' TrKorr = lv_trkorr TrText = 'DevDesk smoke test' TicketUUID = lv_ticket ) )
        CREATE BY \_Dependency FIELDS ( DependsOn )
        WITH VALUE #( ( %cid_ref = 'R1' %target = VALUE #( ( %cid = 'R1D' DependsOn = 'ZZZK000001' ) ) ) )
      MAPPED DATA(ls_tr_mapped)
      FAILED DATA(ls_tr_failed).
    COMMIT ENTITIES RESPONSE OF zr_dd_transport FAILED DATA(ls_tr_commit) REPORTED DATA(ls_tr_reported).
    IF ls_tr_failed IS NOT INITIAL OR ls_tr_commit IS NOT INITIAL.
      out->write( '3. Transport FAILED' ).
      LOOP AT ls_tr_reported-transport INTO DATA(ls_tr_msg) WHERE %msg IS BOUND.
        out->write( |   { ls_tr_msg-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
      RETURN.
    ENDIF.
    DATA(lv_transport) = ls_tr_mapped-transport[ 1 ]-TransportUUID.
    MODIFY ENTITIES OF zr_dd_transport
      ENTITY Transport EXECUTE recordImport
        FROM VALUE #( ( TransportUUID = lv_transport %param-TargetSystem = 'QA' %param-ReturnCode = 4 ) )
      FAILED ls_tr_failed.
    COMMIT ENTITIES.
    READ ENTITIES OF zr_dd_transport
      ENTITY Transport ALL FIELDS WITH VALUE #( ( TransportUUID = lv_transport ) ) RESULT DATA(lt_transport)
      ENTITY Transport BY \_Dependency ALL FIELDS WITH VALUE #( ( TransportUUID = lv_transport ) ) RESULT DATA(lt_tr_deps).
    IF lt_transport IS NOT INITIAL.
      DATA(ls_transport) = lt_transport[ 1 ].
      out->write( |3. Transport { ls_transport-TrKorr } { ok( xsdbool( ls_tr_failed IS NOT INITIAL ) ) }: phase { ls_transport-Phase }, RC { ls_transport-QaRc }, | &&
                  |released { ls_transport-ReleasedOn DATE = USER }, dependencies { lines( lt_tr_deps ) } (expect QA, 4, today, 1)| ).
    ENDIF.

    " 4. Knowledge article (error & fix), linked to the class
    MODIFY ENTITIES OF zr_dd_article
      ENTITY Article
        CREATE FIELDS ( ArticleType Title Tags ErrorText FixText )
        WITH VALUE #( ( %cid = 'K1' ArticleType = 'FIX' Title = 'DevDesk smoke test article' Tags = 'smoke,rap'
                        ErrorText = 'Example error' FixText = 'Example fix' ) )
        CREATE BY \_Link FIELDS ( ObjectUUID )
        WITH VALUE #( ( %cid_ref = 'K1' %target = VALUE #( ( %cid = 'K1L' ObjectUUID = lv_class ) ) ) )
      MAPPED DATA(ls_kb_mapped)
      FAILED DATA(ls_kb_failed).
    COMMIT ENTITIES RESPONSE OF zr_dd_article FAILED DATA(ls_kb_commit) REPORTED DATA(ls_kb_reported).
    IF ls_kb_failed IS NOT INITIAL OR ls_kb_commit IS NOT INITIAL.
      out->write( '4. Article FAILED (number range ZDD_KB maintained? value list KBTYPE filled?)' ).
      LOOP AT ls_kb_reported-article INTO DATA(ls_kb_msg) WHERE %msg IS BOUND.
        out->write( |   { ls_kb_msg-%msg->if_message~get_text( ) }| ).
      ENDLOOP.
    ELSE.
      lv_article = ls_kb_mapped-article[ 1 ]-ArticleUUID.
      READ ENTITIES OF zr_dd_article
        ENTITY Article FIELDS ( ArticleId ) WITH VALUE #( ( ArticleUUID = lv_article ) ) RESULT DATA(lt_article)
        ENTITY Article BY \_Link ALL FIELDS WITH VALUE #( ( ArticleUUID = lv_article ) ) RESULT DATA(lt_kb_links).
      out->write( |4. Article { COND string( WHEN lt_article IS NOT INITIAL THEN lt_article[ 1 ]-ArticleId ELSE '-' ) } OK, | &&
                  |links { lines( lt_kb_links ) } (expect 1)| ).
    ENDIF.

    " 5. Clean up (the ticket and article numbers stay used)
    IF gc_delete_afterwards = abap_true.
      IF lv_article IS NOT INITIAL.
        MODIFY ENTITIES OF zr_dd_article ENTITY Article DELETE FROM VALUE #( ( ArticleUUID = lv_article ) ).
      ENDIF.
      MODIFY ENTITIES OF zr_dd_transport ENTITY Transport DELETE FROM VALUE #( ( TransportUUID = lv_transport ) ).
      MODIFY ENTITIES OF zr_dd_ticket ENTITY Ticket DELETE FROM VALUE #( ( TicketUUID = lv_ticket ) ).
      MODIFY ENTITIES OF zr_dd_object ENTITY TechObject DELETE FROM VALUE #( ( ObjectUUID = lv_class ) ( ObjectUUID = lv_table ) ).
      COMMIT ENTITIES.
      out->write( '5. Test data deleted' ).
    ENDIF.
  ENDMETHOD.


  METHOD ok.
    rv_text = COND #( WHEN iv_failed = abap_true THEN `FAILED` ELSE `OK` ).
  ENDMETHOD.

ENDCLASS.
