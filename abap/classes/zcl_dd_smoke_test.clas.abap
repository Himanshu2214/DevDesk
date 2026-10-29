"! DevDesk phase 1 smoke test - run in ADT with F9 (console application).
"! Creates a ticket with acceptance criteria and a test case, changes the status,
"! runs the timer, logs time, reads everything back and deletes the ticket again.
CLASS zcl_dd_smoke_test DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

  PRIVATE SECTION.
    "! Set to abap_false to keep the test ticket for a look in the service preview
    CONSTANTS gc_delete_afterwards TYPE abap_boolean VALUE abap_true.

    METHODS write_messages
      IMPORTING is_reported TYPE RESPONSE FOR REPORTED LATE zr_dd_ticket
                io_out      TYPE REF TO if_oo_adt_classrun_out.

ENDCLASS.


CLASS zcl_dd_smoke_test IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.

    " 1. Deep create: ticket + 2 acceptance criteria + 1 test case
    MODIFY ENTITIES OF zr_dd_ticket
      ENTITY Ticket
        CREATE FIELDS ( Title Description Project Area Tech TicketType EstimateHours )
        WITH VALUE #( ( %cid          = 'T1'
                        Title         = 'DevDesk smoke test'
                        Description   = 'Created by ZCL_DD_SMOKE_TEST'
                        Project       = 'CORE'
                        Area          = 'BASIS'
                        Tech          = 'RAP'
                        TicketType    = 'CR'
                        EstimateHours = 2 ) )
        CREATE BY \_Acceptance FIELDS ( SortOrder Text )
        WITH VALUE #( ( %cid_ref = 'T1'
                        %target  = VALUE #( ( %cid = 'A1' SortOrder = 1 Text = 'A ticket can be created' )
                                            ( %cid = 'A2' SortOrder = 2 Text = 'Status changes are recorded' ) ) ) )
        CREATE BY \_Test FIELDS ( SortOrder TestName Expected )
        WITH VALUE #( ( %cid_ref = 'T1'
                        %target  = VALUE #( ( %cid = 'C1' SortOrder = 1 TestName = 'Create and read back' Expected = 'All fields filled' ) ) ) )
      MAPPED DATA(ls_mapped)
      FAILED DATA(ls_failed).

    IF ls_failed IS NOT INITIAL.
      out->write( '1. Create FAILED (check the authorization and the value lists)' ).
      ROLLBACK ENTITIES.
      RETURN.
    ENDIF.

    COMMIT ENTITIES RESPONSE OF zr_dd_ticket
      FAILED DATA(ls_commit_failed) REPORTED DATA(ls_commit_reported).
    IF ls_commit_failed IS NOT INITIAL.
      out->write( '1. Save FAILED - validation messages:' ).
      write_messages( is_reported = ls_commit_reported io_out = out ).
      RETURN.
    ENDIF.

    DATA(lv_uuid) = ls_mapped-ticket[ 1 ]-TicketUUID.
    out->write( '1. Ticket created' ).

    " 2. Status Backlog -> In progress (writes a STAT event)
    MODIFY ENTITIES OF zr_dd_ticket
      ENTITY Ticket EXECUTE setStatus FROM VALUE #( ( TicketUUID = lv_uuid %param-Status = 'PROG' ) )
      FAILED ls_failed.
    COMMIT ENTITIES.
    out->write( |2. setStatus PROG { COND string( WHEN ls_failed IS INITIAL THEN 'OK' ELSE 'FAILED' ) }| ).

    " 3. Timer start + stop (logs at least 0.25 h), plus one manual entry and a comment
    MODIFY ENTITIES OF zr_dd_ticket
      ENTITY Ticket EXECUTE startTimer FROM VALUE #( ( TicketUUID = lv_uuid ) ).
    COMMIT ENTITIES.
    MODIFY ENTITIES OF zr_dd_ticket
      ENTITY Ticket EXECUTE stopTimer FROM VALUE #( ( TicketUUID = lv_uuid ) )
      ENTITY Ticket CREATE BY \_Worklog FIELDS ( WorkDate Hours Activity CommentText )
        WITH VALUE #( ( TicketUUID = lv_uuid
                        %target    = VALUE #( ( %cid = 'W1' WorkDate = sy-datlo Hours = '1.5' Activity = 'DEBUG' CommentText = 'Smoke test' ) ) ) )
      ENTITY Ticket CREATE BY \_Note FIELDS ( Text )
        WITH VALUE #( ( TicketUUID = lv_uuid %target = VALUE #( ( %cid = 'N1' Text = 'Smoke test comment' ) ) ) )
      FAILED ls_failed.
    COMMIT ENTITIES RESPONSE OF zr_dd_ticket FAILED ls_commit_failed REPORTED ls_commit_reported.
    out->write( |3. Timer, work log and comment { COND string( WHEN ls_failed IS INITIAL AND ls_commit_failed IS INITIAL THEN 'OK' ELSE 'FAILED' ) }| ).
    write_messages( is_reported = ls_commit_reported io_out = out ).

    " 4. Read everything back
    READ ENTITIES OF zr_dd_ticket
      ENTITY Ticket ALL FIELDS WITH VALUE #( ( TicketUUID = lv_uuid ) ) RESULT DATA(lt_ticket)
      ENTITY Ticket BY \_Event ALL FIELDS WITH VALUE #( ( TicketUUID = lv_uuid ) ) RESULT DATA(lt_events)
      ENTITY Ticket BY \_Checklist ALL FIELDS WITH VALUE #( ( TicketUUID = lv_uuid ) ) RESULT DATA(lt_checklist)
      ENTITY Ticket BY \_Worklog ALL FIELDS WITH VALUE #( ( TicketUUID = lv_uuid ) ) RESULT DATA(lt_worklog)
      ENTITY Ticket BY \_Test ALL FIELDS WITH VALUE #( ( TicketUUID = lv_uuid ) ) RESULT DATA(lt_tests).

    READ TABLE lt_ticket INDEX 1 INTO DATA(ls_ticket).
    IF sy-subrc <> 0.
      out->write( '4. Ticket could not be read back' ).
      RETURN.
    ENDIF.
    DATA(lv_hours) = REDUCE decfloat34( INIT h = CONV decfloat34( 0 ) FOR w IN lt_worklog NEXT h = h + w-Hours ).
    out->write( |4. { ls_ticket-TicketId }: status { ls_ticket-Status }, priority { ls_ticket-Priority }, due { ls_ticket-DueDate DATE = USER }, assignee { ls_ticket-Assignee }| ).
    out->write( |   events { lines( lt_events ) } (expect 1), checklist items { lines( lt_checklist ) } (expect 6 after ZDD_SETUP), | &&
                |work log { lines( lt_worklog ) } entries / { lv_hours } h (expect 2 / at least 1.75), test result { COND string( WHEN lt_tests IS NOT INITIAL THEN lt_tests[ 1 ]-TestResult ELSE '-' ) } (expect OPEN)| ).

    " 5. Clean up
    IF gc_delete_afterwards = abap_true.
      MODIFY ENTITIES OF zr_dd_ticket
        ENTITY Ticket DELETE FROM VALUE #( ( TicketUUID = lv_uuid ) ).
      COMMIT ENTITIES.
      out->write( '5. Test ticket deleted (the ticket number stays used)' ).
    ENDIF.
  ENDMETHOD.


  METHOD write_messages.
    LOOP AT is_reported-ticket INTO DATA(ls_ticket) WHERE %msg IS BOUND.
      io_out->write( |   Ticket: { ls_ticket-%msg->if_message~get_text( ) }| ).
    ENDLOOP.
    LOOP AT is_reported-worklog INTO DATA(ls_worklog) WHERE %msg IS BOUND.
      io_out->write( |   Work log: { ls_worklog-%msg->if_message~get_text( ) }| ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
