*"* Behavior implementation of ZR_DD_Ticket (DevDesk, phase 1)
*"* Local Types of class ZBP_R_DD_TICKET

CLASS lhc_ticket DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    CONSTANTS:
      BEGIN OF gc_status,
        backlog TYPE zdd_tkt-status VALUE 'BACKLOG',
        todo    TYPE zdd_tkt-status VALUE 'TODO',
        prog    TYPE zdd_tkt-status VALUE 'PROG',
        test    TYPE zdd_tkt-status VALUE 'TEST',
        block   TYPE zdd_tkt-status VALUE 'BLOCK',
        done    TYPE zdd_tkt-status VALUE 'DONE',
      END OF gc_status,
      gc_nr_object   TYPE c LENGTH 10 VALUE 'ZDD_TKT',
      gc_nr_interval TYPE c LENGTH 2  VALUE '01'.

    TYPES tt_values TYPE SORTED TABLE OF zdd_value WITH NON-UNIQUE KEY list_type code.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Ticket RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR Ticket RESULT result.

    METHODS setStatus FOR MODIFY
      IMPORTING keys FOR ACTION Ticket~setStatus RESULT result.

    METHODS startTimer FOR MODIFY
      IMPORTING keys FOR ACTION Ticket~startTimer RESULT result.

    METHODS stopTimer FOR MODIFY
      IMPORTING keys FOR ACTION Ticket~stopTimer RESULT result.

    METHODS setDefaults FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Ticket~setDefaults.

    METHODS createChecklist FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Ticket~createChecklist.

    METHODS assignTicketNo FOR DETERMINE ON SAVE
      IMPORTING keys FOR Ticket~assignTicketNo.

    METHODS validateTicket FOR VALIDATE ON SAVE
      IMPORTING keys FOR Ticket~validateTicket.

    "! True if the code is in the value list, or if the list is not maintained at all
    METHODS value_ok
      IMPORTING it_values     TYPE tt_values
                iv_list       TYPE zdd_value-list_type
                iv_code       TYPE clike
      RETURNING VALUE(rv_ok)  TYPE abap_boolean.

ENDCLASS.


CLASS lhc_ticket IMPLEMENTATION.

  METHOD get_global_authorizations.
    " Personal app: anyone who may call the service may create tickets. Who may change which
    " ticket is decided per instance (owner, see below). An authorization object can be added here later.
    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%update = if_abap_behv=>mk-on.
      result-%update = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%delete = if_abap_behv=>mk-on.
      result-%delete = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%action-setStatus = if_abap_behv=>mk-on.
      result-%action-setStatus = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%action-startTimer = if_abap_behv=>mk-on.
      result-%action-startTimer = if_abap_behv=>auth-allowed.
    ENDIF.
    IF requested_authorizations-%action-stopTimer = if_abap_behv=>mk-on.
      result-%action-stopTimer = if_abap_behv=>auth-allowed.
    ENDIF.
  ENDMETHOD.


  METHOD get_instance_authorizations.
    DATA lv_auth LIKE if_abap_behv=>auth-allowed.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( CreatedBy ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets)
      FAILED failed.

    LOOP AT lt_tickets INTO DATA(ls_ticket).
      " only the person who created a ticket may change it (the access control also hides other users' tickets)
      lv_auth = COND #( WHEN ls_ticket-CreatedBy = sy-uname
                        THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky               = ls_ticket-%tky
                      %update            = lv_auth
                      %delete            = lv_auth
                      %action-setStatus  = lv_auth
                      %action-startTimer = lv_auth
                      %action-stopTimer  = lv_auth
                      %assoc-_Acceptance = lv_auth
                      %assoc-_Checklist  = lv_auth
                      %assoc-_Test       = lv_auth
                      %assoc-_Worklog    = lv_auth
                      %assoc-_Note       = lv_auth
                      %assoc-_Event      = lv_auth ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD setStatus.
    DATA lt_update TYPE TABLE FOR UPDATE zr_dd_ticket\\Ticket.
    DATA lt_events TYPE TABLE FOR CREATE zr_dd_ticket\\Ticket\_Event.
    DATA lv_now    TYPE timestampl.
    DATA lv_new    TYPE zdd_tkt-status.
    DATA lv_cid    TYPE i.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( Status ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    GET TIME STAMP FIELD lv_now.

    LOOP AT keys INTO DATA(ls_key).
      lv_new = to_upper( ls_key-%param-Status ).

      IF lv_new <> gc_status-backlog AND lv_new <> gc_status-todo AND lv_new <> gc_status-prog
         AND lv_new <> gc_status-test AND lv_new <> gc_status-block AND lv_new <> gc_status-done.
        APPEND VALUE #( %tky = ls_key-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Unknown status "{ lv_new }"| ) )
          TO reported-ticket.
        CONTINUE.
      ENDIF.

      READ TABLE lt_tickets INTO DATA(ls_ticket) WITH KEY TicketUUID = ls_key-TicketUUID.
      IF sy-subrc <> 0 OR ls_ticket-Status = lv_new.
        CONTINUE.
      ENDIF.

      lv_cid += 1.
      APPEND VALUE #( %tky            = ls_ticket-%tky
                      Status          = lv_new
                      StatusChangedAt = lv_now
                      ClosedAt        = COND #( WHEN lv_new = gc_status-done THEN lv_now ELSE 0 ) )
        TO lt_update.
      " status history: activity feed, inbox and cycle time are built from these events
      APPEND VALUE #( %tky    = ls_ticket-%tky
                      %target = VALUE #( ( %cid       = |STAT{ lv_cid }|
                                           EventKind  = 'STAT'
                                           StatusFrom = ls_ticket-Status
                                           StatusTo   = lv_new
                                           EventAt    = lv_now
                                           EventBy    = sy-uname ) ) )
        TO lt_events.
    ENDLOOP.

    IF lt_update IS NOT INITIAL.
      MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
        ENTITY Ticket
          UPDATE FIELDS ( Status StatusChangedAt ClosedAt ) WITH lt_update
        ENTITY Ticket
          CREATE BY \_Event FIELDS ( EventKind StatusFrom StatusTo EventAt EventBy ) WITH lt_events.
    ENDIF.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_result IN lt_result ( %tky = ls_result-%tky %param = ls_result ) ).
  ENDMETHOD.


  METHOD startTimer.
    " The UI stops a timer running on another ticket first (one timer at a time).
    DATA lv_now TYPE timestampl.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( TimerStartedAt ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    GET TIME STAMP FIELD lv_now.

    MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket
        UPDATE FIELDS ( TimerStartedAt )
        WITH VALUE #( FOR ls_ticket IN lt_tickets WHERE ( TimerStartedAt IS INITIAL )
                      ( %tky = ls_ticket-%tky TimerStartedAt = lv_now ) ).

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_result IN lt_result ( %tky = ls_result-%tky %param = ls_result ) ).
  ENDMETHOD.


  METHOD stopTimer.
    DATA lt_update   TYPE TABLE FOR UPDATE zr_dd_ticket\\Ticket.
    DATA lt_worklog  TYPE TABLE FOR CREATE zr_dd_ticket\\Ticket\_Worklog.
    DATA lv_now      TYPE timestampl.
    DATA lv_quarters TYPE decfloat34.
    DATA lv_cid      TYPE i.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( Status TimerStartedAt ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    GET TIME STAMP FIELD lv_now.

    LOOP AT lt_tickets INTO DATA(ls_ticket) WHERE TimerStartedAt IS NOT INITIAL.
      DATA(lv_seconds) = cl_abap_tstmp=>subtract( tstmp1 = lv_now tstmp2 = ls_ticket-TimerStartedAt ).
      " quarter hours, at least 0.25 h and at most 24 h
      lv_quarters = round( val = CONV decfloat34( lv_seconds / 900 ) dec = 0 ).
      lv_quarters = nmax( val1 = 1 val2 = nmin( val1 = 96 val2 = lv_quarters ) ).

      lv_cid += 1.
      APPEND VALUE #( %tky    = ls_ticket-%tky
                      %target = VALUE #( ( %cid        = |WL{ lv_cid }|
                                           WorkDate    = sy-datlo
                                           Hours       = lv_quarters / 4
                                           Activity    = SWITCH #( ls_ticket-Status
                                                                   WHEN gc_status-test THEN 'TEST'
                                                                   WHEN gc_status-todo THEN 'ANA'
                                                                   ELSE 'CODE' )
                                           CommentText = 'Timer'
                                           EntrySource = 'TIMER' ) ) )
        TO lt_worklog.
      APPEND VALUE #( %tky = ls_ticket-%tky TimerStartedAt = 0 ) TO lt_update.
    ENDLOOP.

    IF lt_update IS NOT INITIAL.
      MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
        ENTITY Ticket
          UPDATE FIELDS ( TimerStartedAt ) WITH lt_update
        ENTITY Ticket
          CREATE BY \_Worklog FIELDS ( WorkDate Hours Activity CommentText EntrySource ) WITH lt_worklog.
    ENDIF.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_result IN lt_result ( %tky = ls_result-%tky %param = ls_result ) ).
  ENDMETHOD.


  METHOD setDefaults.
    DATA lv_now TYPE timestampl.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( Status Priority DueDate Assignee Environment TicketType ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    GET TIME STAMP FIELD lv_now.
    DATA(lv_due) = CONV d( sy-datlo + 7 ).

    MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket
        UPDATE FIELDS ( Status StatusChangedAt Priority DueDate Assignee Environment TicketType )
        WITH VALUE #( FOR ls_ticket IN lt_tickets
                      ( %tky            = ls_ticket-%tky
                        Status          = COND #( WHEN ls_ticket-Status IS INITIAL THEN gc_status-backlog ELSE ls_ticket-Status )
                        StatusChangedAt = lv_now
                        Priority        = COND #( WHEN ls_ticket-Priority IS INITIAL THEN '3' ELSE ls_ticket-Priority )
                        DueDate         = COND #( WHEN ls_ticket-DueDate IS INITIAL THEN lv_due ELSE ls_ticket-DueDate )
                        Assignee        = COND #( WHEN ls_ticket-Assignee IS INITIAL THEN sy-uname ELSE ls_ticket-Assignee )
                        Environment     = COND #( WHEN ls_ticket-Environment IS INITIAL THEN 'DEV' ELSE ls_ticket-Environment )
                        TicketType      = COND #( WHEN ls_ticket-TicketType IS INITIAL THEN 'CR' ELSE ls_ticket-TicketType ) ) ).
  ENDMETHOD.


  METHOD createChecklist.
    " New tickets get the release checklist from ZDD_VALUE (list CHECKCAT), unless the request already brought one
    DATA lt_create TYPE TABLE FOR CREATE zr_dd_ticket\\Ticket\_Checklist.
    DATA ls_create LIKE LINE OF lt_create.
    DATA lv_cid    TYPE i.

    SELECT code, text, sort_order
      FROM zdd_value
      WHERE list_type = 'CHECKCAT'
        AND is_active = @abap_true
      ORDER BY sort_order
      INTO TABLE @DATA(lt_categories).
    CHECK lt_categories IS NOT INITIAL.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket BY \_Checklist FIELDS ( TicketUUID ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_items).

    LOOP AT keys INTO DATA(ls_key).
      IF line_exists( lt_items[ TicketUUID = ls_key-TicketUUID ] ).
        CONTINUE.
      ENDIF.
      CLEAR ls_create.
      ls_create-%tky = ls_key-%tky.
      LOOP AT lt_categories INTO DATA(ls_category).
        lv_cid += 1.
        APPEND VALUE #( %cid      = |CHK{ lv_cid }|
                        SortOrder = ls_category-sort_order
                        Category  = ls_category-code
                        Text      = ls_category-text
                        IsDone    = abap_false ) TO ls_create-%target.
      ENDLOOP.
      APPEND ls_create TO lt_create.
    ENDLOOP.

    IF lt_create IS NOT INITIAL.
      MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
        ENTITY Ticket
          CREATE BY \_Checklist FIELDS ( SortOrder Category Text IsDone ) WITH lt_create.
    ENDIF.
  ENDMETHOD.


  METHOD assignTicketNo.
    DATA lt_update TYPE TABLE FOR UPDATE zr_dd_ticket\\Ticket.
    DATA lv_no     TYPE n LENGTH 8.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( TicketNo ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    DELETE lt_tickets WHERE TicketNo IS NOT INITIAL.
    CHECK lt_tickets IS NOT INITIAL.

    LOOP AT lt_tickets INTO DATA(ls_ticket).
      TRY.
          cl_numberrange_runtime=>number_get(
            EXPORTING nr_range_nr = gc_nr_interval
                      object      = gc_nr_object
            IMPORTING number      = DATA(lv_number) ).
        CATCH cx_number_ranges INTO DATA(lx_number_range).
          APPEND VALUE #( %tky = ls_ticket-%tky
                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                        text     = lx_number_range->get_text( ) ) )
            TO reported-ticket.
          CONTINUE.
      ENDTRY.

      lv_no = lv_number.
      APPEND VALUE #( %tky = ls_ticket-%tky TicketNo = lv_no ) TO lt_update.
    ENDLOOP.

    MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket UPDATE FIELDS ( TicketNo ) WITH lt_update.
  ENDMETHOD.


  METHOD validateTicket.
    DATA lt_values TYPE tt_values.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Ticket FIELDS ( Title Priority Project Area Tech TicketType Environment EstimateHours )
      WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tickets).

    SELECT project FROM zdd_project WHERE is_active = @abap_true INTO TABLE @DATA(lt_projects).
    SELECT * FROM zdd_value WHERE is_active = @abap_true INTO TABLE @lt_values.

    LOOP AT lt_tickets INTO DATA(ls_ticket).

      IF ls_ticket-Title IS INITIAL.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Enter a title' )
                        %element-Title = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF ls_ticket-Priority < '1' OR ls_ticket-Priority > '4'.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Priority must be 1 (Urgent) to 4 (Low)' )
                        %element-Priority = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF ls_ticket-Project IS INITIAL
         OR ( lt_projects IS NOT INITIAL AND NOT line_exists( lt_projects[ project = ls_ticket-Project ] ) ).
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Project "{ ls_ticket-Project }" is not maintained in ZDD_PROJECT| )
                        %element-Project = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF value_ok( it_values = lt_values iv_list = 'AREA' iv_code = ls_ticket-Area ) = abap_false.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Area "{ ls_ticket-Area }" is not in value list AREA| )
                        %element-Area = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF value_ok( it_values = lt_values iv_list = 'TECH' iv_code = ls_ticket-Tech ) = abap_false.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Tech "{ ls_ticket-Tech }" is not in value list TECH| )
                        %element-Tech = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF value_ok( it_values = lt_values iv_list = 'TYPE' iv_code = ls_ticket-TicketType ) = abap_false.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Type "{ ls_ticket-TicketType }" is not in value list TYPE| )
                        %element-TicketType = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF ls_ticket-Environment <> 'DEV' AND ls_ticket-Environment <> 'QA' AND ls_ticket-Environment <> 'PRD'.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Environment must be DEV, QA or PRD' )
                        %element-Environment = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

      IF ls_ticket-EstimateHours < 0.
        APPEND VALUE #( %tky = ls_ticket-%tky ) TO failed-ticket.
        APPEND VALUE #( %tky = ls_ticket-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'The estimate cannot be negative' )
                        %element-EstimateHours = if_abap_behv=>mk-on ) TO reported-ticket.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.


  METHOD value_ok.
    IF NOT line_exists( it_values[ list_type = iv_list ] ).
      rv_ok = abap_true.        " list not maintained yet: accept any value
      RETURN.
    ENDIF.
    rv_ok = xsdbool( iv_code IS NOT INITIAL AND line_exists( it_values[ list_type = iv_list code = iv_code ] ) ).
  ENDMETHOD.

ENDCLASS.


CLASS lhc_testcase DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS stampResult FOR DETERMINE ON MODIFY
      IMPORTING keys FOR TestCase~stampResult.

ENDCLASS.


CLASS lhc_testcase IMPLEMENTATION.

  METHOD stampResult.
    DATA lv_now TYPE timestampl.

    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY TestCase FIELDS ( TestResult ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_tests).

    GET TIME STAMP FIELD lv_now.

    " new test cases start as OPEN (only written when empty, so this does not trigger itself again)
    MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY TestCase
        UPDATE FIELDS ( TestResult )
        WITH VALUE #( FOR ls_open IN lt_tests WHERE ( TestResult IS INITIAL )
                      ( %tky = ls_open-%tky TestResult = 'OPEN' ) )
      ENTITY TestCase
        UPDATE FIELDS ( TestedAt TestedBy )
        WITH VALUE #( FOR ls_test IN lt_tests WHERE ( TestResult IS NOT INITIAL )
                      ( %tky     = ls_test-%tky
                        TestedAt = COND #( WHEN ls_test-TestResult = 'PASS' OR ls_test-TestResult = 'FAIL' THEN lv_now ELSE 0 )
                        TestedBy = COND #( WHEN ls_test-TestResult = 'PASS' OR ls_test-TestResult = 'FAIL' THEN sy-uname ELSE space ) ) ).
  ENDMETHOD.

ENDCLASS.


CLASS lhc_worklog DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS setWorklogDefaults FOR DETERMINE ON MODIFY
      IMPORTING keys FOR Worklog~setWorklogDefaults.

    METHODS validateWorklog FOR VALIDATE ON SAVE
      IMPORTING keys FOR Worklog~validateWorklog.

ENDCLASS.


CLASS lhc_worklog IMPLEMENTATION.

  METHOD setWorklogDefaults.
    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Worklog FIELDS ( WorkDate Activity EntrySource ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_entries).

    DELETE lt_entries WHERE WorkDate IS NOT INITIAL AND Activity IS NOT INITIAL AND EntrySource IS NOT INITIAL.
    CHECK lt_entries IS NOT INITIAL.

    MODIFY ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Worklog
        UPDATE FIELDS ( WorkDate Activity EntrySource )
        WITH VALUE #( FOR ls_entry IN lt_entries
                      ( %tky        = ls_entry-%tky
                        WorkDate    = COND #( WHEN ls_entry-WorkDate IS INITIAL THEN sy-datlo ELSE ls_entry-WorkDate )
                        Activity    = COND #( WHEN ls_entry-Activity IS INITIAL THEN 'CODE' ELSE ls_entry-Activity )
                        EntrySource = COND #( WHEN ls_entry-EntrySource IS INITIAL THEN 'MANUAL' ELSE ls_entry-EntrySource ) ) ).
  ENDMETHOD.


  METHOD validateWorklog.
    READ ENTITIES OF zr_dd_ticket IN LOCAL MODE
      ENTITY Worklog FIELDS ( WorkDate Hours Activity ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_entries).

    SELECT code FROM zdd_value
      WHERE list_type = 'ACTIVITY' AND is_active = @abap_true
      INTO TABLE @DATA(lt_activities).

    LOOP AT lt_entries INTO DATA(ls_entry).

      IF ls_entry-Hours <= 0 OR ls_entry-Hours > 24.
        APPEND VALUE #( %tky = ls_entry-%tky ) TO failed-worklog.
        APPEND VALUE #( %tky = ls_entry-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Hours must be more than 0 and at most 24' )
                        %element-Hours = if_abap_behv=>mk-on ) TO reported-worklog.
      ENDIF.

      IF ls_entry-WorkDate > sy-datlo.
        APPEND VALUE #( %tky = ls_entry-%tky ) TO failed-worklog.
        APPEND VALUE #( %tky = ls_entry-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Time cannot be logged for a future date' )
                        %element-WorkDate = if_abap_behv=>mk-on ) TO reported-worklog.
      ENDIF.

      IF lt_activities IS NOT INITIAL AND NOT line_exists( lt_activities[ code = ls_entry-Activity ] ).
        APPEND VALUE #( %tky = ls_entry-%tky ) TO failed-worklog.
        APPEND VALUE #( %tky = ls_entry-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Activity "{ ls_entry-Activity }" is not in value list ACTIVITY| )
                        %element-Activity = if_abap_behv=>mk-on ) TO reported-worklog.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
