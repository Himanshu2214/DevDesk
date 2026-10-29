*&---------------------------------------------------------------------*
*& Report ZDD_SETUP
*&---------------------------------------------------------------------*
*& DevDesk: fills the value lists (ZDD_VALUE), projects (ZDD_PROJECT)
*& and configuration (ZDD_CONFIG) with defaults.
*& Existing entries are kept unless P_RESET is set, so it is safe to run
*& again after you changed texts or colours.
*& The projects are examples - adjust them to your own work afterwards.
*&---------------------------------------------------------------------*
REPORT zdd_setup.

PARAMETERS:
  p_proj  AS CHECKBOX DEFAULT 'X',      " also create the example projects
  p_reset AS CHECKBOX DEFAULT ' '.      " overwrite existing entries

START-OF-SELECTION.
  DATA lt_values   TYPE STANDARD TABLE OF zdd_value WITH EMPTY KEY.
  DATA lt_projects TYPE STANDARD TABLE OF zdd_project WITH EMPTY KEY.
  DATA lt_config   TYPE STANDARD TABLE OF zdd_config WITH EMPTY KEY.
  DATA lv_values   TYPE i.
  DATA lv_config   TYPE i.
  DATA lv_projects TYPE i.

  lt_values = VALUE #( is_active = abap_true
    ( list_type = 'STATUS'   code = 'BACKLOG'   text = 'Backlog'                                sort_order = 1 color = '#8A8F98' )
    ( list_type = 'STATUS'   code = 'TODO'      text = 'To do'                                  sort_order = 2 color = '#4EA7FC' )
    ( list_type = 'STATUS'   code = 'PROG'      text = 'In progress'                            sort_order = 3 color = '#F0BF00' wip_limit = 4 )
    ( list_type = 'STATUS'   code = 'TEST'      text = 'Testing'                                sort_order = 4 color = '#26B5CE' wip_limit = 5 )
    ( list_type = 'STATUS'   code = 'BLOCK'     text = 'Blocked'                                sort_order = 5 color = '#EB5757' )
    ( list_type = 'STATUS'   code = 'DONE'      text = 'Done'                                   sort_order = 6 color = '#4CB782' )
    ( list_type = 'AREA'     code = 'SD'        text = 'Sales and Distribution'                 sort_order = 1 )
    ( list_type = 'AREA'     code = 'MM'        text = 'Materials Management'                   sort_order = 2 )
    ( list_type = 'AREA'     code = 'FI'        text = 'Finance'                                sort_order = 3 )
    ( list_type = 'AREA'     code = 'PP'        text = 'Production Planning'                    sort_order = 4 )
    ( list_type = 'AREA'     code = 'PS'        text = 'Project System'                         sort_order = 5 )
    ( list_type = 'AREA'     code = 'BASIS'     text = 'Basis / technical'                      sort_order = 6 )
    ( list_type = 'TECH'     code = 'RAP'       text = 'RAP'                                    sort_order = 1 color = '#5E6AD2' )
    ( list_type = 'TECH'     code = 'CDS'       text = 'CDS'                                    sort_order = 2 color = '#26B5CE' )
    ( list_type = 'TECH'     code = 'ABAP'      text = 'ABAP'                                   sort_order = 3 color = '#8A8F98' )
    ( list_type = 'TECH'     code = 'ODATA'     text = 'OData'                                  sort_order = 4 color = '#4CB782' )
    ( list_type = 'TECH'     code = 'FIORI'     text = 'Fiori / UI5'                            sort_order = 5 color = '#BB87FC' )
    ( list_type = 'TECH'     code = 'INTEG'     text = 'Integration'                            sort_order = 6 color = '#F2994A' )
    ( list_type = 'TECH'     code = 'FORM'      text = 'Form'                                   sort_order = 7 color = '#E5A3C0' )
    ( list_type = 'TYPE'     code = 'BUG'       text = 'Bug'                                    sort_order = 1 )
    ( list_type = 'TYPE'     code = 'CR'        text = 'Change request'                         sort_order = 2 )
    ( list_type = 'TYPE'     code = 'NEW'       text = 'New development'                        sort_order = 3 )
    ( list_type = 'TYPE'     code = 'SUP'       text = 'Support'                                sort_order = 4 )
    ( list_type = 'ACTIVITY' code = 'CODE'      text = 'Coding'                                 sort_order = 1 color = '#5E6AD2' )
    ( list_type = 'ACTIVITY' code = 'DEBUG'     text = 'Debugging'                              sort_order = 2 color = '#EB5757' )
    ( list_type = 'ACTIVITY' code = 'TEST'      text = 'Testing'                                sort_order = 3 color = '#26B5CE' )
    ( list_type = 'ACTIVITY' code = 'ANA'       text = 'Analysis'                               sort_order = 4 color = '#4CB782' )
    ( list_type = 'ACTIVITY' code = 'MEET'      text = 'Meetings'                               sort_order = 5 color = '#F2994A' )
    ( list_type = 'ACTIVITY' code = 'DOC'       text = 'Documentation'                          sort_order = 6 color = '#8A8F98' )
    ( list_type = 'CHECKCAT' code = 'UNIT'      text = 'Unit tests written and green'           sort_order = 1 )
    ( list_type = 'CHECKCAT' code = 'INTEG'     text = 'Tested end-to-end in QA'                sort_order = 2 )
    ( list_type = 'CHECKCAT' code = 'AUTH'      text = 'Authorization checks verified'          sort_order = 3 )
    ( list_type = 'CHECKCAT' code = 'ERROR'     text = 'Errors logged and shown to the user'    sort_order = 4 )
    ( list_type = 'CHECKCAT' code = 'PERF'      text = 'Runtime checked with production volume' sort_order = 5 )
    ( list_type = 'CHECKCAT' code = 'TRANSPORT' text = 'All objects in the TR, TR released'     sort_order = 6 ) ).

  lt_projects = VALUE #( is_active = abap_true
    ( project = 'GST'  name = 'GST & e-invoicing'     color = '#4EA7FC' sort_order = 1 )
    ( project = 'GATE' name = 'Gate entry app'        color = '#4CB782' sort_order = 2 )
    ( project = 'PPR'  name = 'Production reporting'  color = '#F2994A' sort_order = 3 )
    ( project = 'FIN'  name = 'Finance automation'    color = '#F2C94C' sort_order = 4 )
    ( project = 'CORE' name = 'Clean core & platform' color = '#BB87FC' sort_order = 5 ) ).

  lt_config = VALUE #(
    ( param = 'WEEK_HOURS'        value = '40' )
    ( param = 'MISSING_TIME_DAYS' value = '2' )
    ( param = 'POLL_SECONDS'      value = '30' ) ).

  IF p_reset = abap_true.
    MODIFY zdd_value FROM TABLE @lt_values.
  ELSE.
    INSERT zdd_value FROM TABLE @lt_values ACCEPTING DUPLICATE KEYS.
  ENDIF.
  lv_values = sy-dbcnt.

  IF p_reset = abap_true.
    MODIFY zdd_config FROM TABLE @lt_config.
  ELSE.
    INSERT zdd_config FROM TABLE @lt_config ACCEPTING DUPLICATE KEYS.
  ENDIF.
  lv_config = sy-dbcnt.

  IF p_proj = abap_true.
    IF p_reset = abap_true.
      MODIFY zdd_project FROM TABLE @lt_projects.
    ELSE.
      INSERT zdd_project FROM TABLE @lt_projects ACCEPTING DUPLICATE KEYS.
    ENDIF.
    lv_projects = sy-dbcnt.
  ENDIF.

  COMMIT WORK.

  WRITE: / |ZDD_VALUE:   { lv_values } of { lines( lt_values ) } entries written|,
         / |ZDD_CONFIG:  { lv_config } of { lines( lt_config ) } entries written|,
         / |ZDD_PROJECT: { lv_projects } entries written|.
  IF p_reset = abap_false.
    WRITE / 'Existing entries were kept (tick P_RESET to overwrite them).'.
  ENDIF.
