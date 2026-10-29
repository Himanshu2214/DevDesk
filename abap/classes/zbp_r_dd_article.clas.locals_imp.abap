*"* Behavior implementation of ZR_DD_Article (DevDesk, phase 2)
*"* Local Types of class ZBP_R_DD_ARTICLE

CLASS lhc_article DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    CONSTANTS:
      gc_nr_object   TYPE c LENGTH 10 VALUE 'ZDD_KB',
      gc_nr_interval TYPE c LENGTH 2  VALUE '01'.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Article RESULT result.

    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR Article RESULT result.

    METHODS assignArticleNo FOR DETERMINE ON SAVE
      IMPORTING keys FOR Article~assignArticleNo.

    METHODS validateArticle FOR VALIDATE ON SAVE
      IMPORTING keys FOR Article~validateArticle.

ENDCLASS.


CLASS lhc_article IMPLEMENTATION.

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

    READ ENTITIES OF zr_dd_article IN LOCAL MODE
      ENTITY Article FIELDS ( CreatedBy ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_articles)
      FAILED failed.

    LOOP AT lt_articles INTO DATA(ls_article).
      lv_auth = COND #( WHEN ls_article-CreatedBy = sy-uname
                        THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky         = ls_article-%tky
                      %update      = lv_auth
                      %delete      = lv_auth
                      %assoc-_Link = lv_auth ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD assignArticleNo.
    DATA lt_update TYPE TABLE FOR UPDATE zr_dd_article\\Article.
    DATA lv_no     TYPE n LENGTH 8.

    READ ENTITIES OF zr_dd_article IN LOCAL MODE
      ENTITY Article FIELDS ( ArticleNo ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_articles).

    DELETE lt_articles WHERE ArticleNo IS NOT INITIAL.
    IF lt_articles IS INITIAL.
      RETURN.
    ENDIF.

    LOOP AT lt_articles INTO DATA(ls_article).
      TRY.
          cl_numberrange_runtime=>number_get(
            EXPORTING nr_range_nr = gc_nr_interval
                      object      = gc_nr_object
            IMPORTING number      = DATA(lv_number) ).
        CATCH cx_number_ranges INTO DATA(lx_number_range).
          APPEND VALUE #( %tky = ls_article-%tky
                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                        text     = lx_number_range->get_text( ) ) )
            TO reported-article.
          CONTINUE.
      ENDTRY.

      lv_no = lv_number.
      APPEND VALUE #( %tky = ls_article-%tky ArticleNo = lv_no ) TO lt_update.
    ENDLOOP.

    MODIFY ENTITIES OF zr_dd_article IN LOCAL MODE
      ENTITY Article UPDATE FIELDS ( ArticleNo ) WITH lt_update.
  ENDMETHOD.


  METHOD validateArticle.
    READ ENTITIES OF zr_dd_article IN LOCAL MODE
      ENTITY Article FIELDS ( Title ArticleType HttpMethod ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_articles).

    SELECT code FROM zdd_value
      WHERE list_type = 'KBTYPE' AND is_active = @abap_true
      INTO TABLE @DATA(lt_types).

    LOOP AT lt_articles INTO DATA(ls_article).

      IF ls_article-Title IS INITIAL.
        APPEND VALUE #( %tky = ls_article-%tky ) TO failed-article.
        APPEND VALUE #( %tky = ls_article-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'Enter a title' )
                        %element-Title = if_abap_behv=>mk-on ) TO reported-article.
      ENDIF.

      IF ls_article-ArticleType IS INITIAL
         OR ( lt_types IS NOT INITIAL AND NOT line_exists( lt_types[ code = ls_article-ArticleType ] ) ).
        APPEND VALUE #( %tky = ls_article-%tky ) TO failed-article.
        APPEND VALUE #( %tky = ls_article-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Type "{ ls_article-ArticleType }" is not in value list KBTYPE| )
                        %element-ArticleType = if_abap_behv=>mk-on ) TO reported-article.
      ENDIF.

      IF ls_article-HttpMethod IS NOT INITIAL
         AND ls_article-HttpMethod <> 'GET' AND ls_article-HttpMethod <> 'POST' AND ls_article-HttpMethod <> 'PUT'
         AND ls_article-HttpMethod <> 'PATCH' AND ls_article-HttpMethod <> 'DELETE' AND ls_article-HttpMethod <> 'HEAD'.
        APPEND VALUE #( %tky = ls_article-%tky ) TO failed-article.
        APPEND VALUE #( %tky = ls_article-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'HTTP method must be GET, POST, PUT, PATCH, DELETE or HEAD' )
                        %element-HttpMethod = if_abap_behv=>mk-on ) TO reported-article.
      ENDIF.

    ENDLOOP.
  ENDMETHOD.

ENDCLASS.


CLASS lhc_articlelink DEFINITION INHERITING FROM cl_abap_behavior_handler.

  PRIVATE SECTION.
    METHODS validateLink FOR VALIDATE ON SAVE
      IMPORTING keys FOR ArticleLink~validateLink.

ENDCLASS.


CLASS lhc_articlelink IMPLEMENTATION.

  METHOD validateLink.
    READ ENTITIES OF zr_dd_article IN LOCAL MODE
      ENTITY ArticleLink FIELDS ( TicketUUID ObjectUUID ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_links).

    " targets are read through their BOs (with the user's authorization)
    READ ENTITIES OF zr_dd_ticket
      ENTITY Ticket FIELDS ( TicketUUID )
      WITH VALUE #( FOR ls_t IN lt_links WHERE ( TicketUUID IS NOT INITIAL ) ( TicketUUID = ls_t-TicketUUID ) )
      RESULT DATA(lt_tickets).
    READ ENTITIES OF zr_dd_object
      ENTITY TechObject FIELDS ( ObjectUUID )
      WITH VALUE #( FOR ls_o IN lt_links WHERE ( ObjectUUID IS NOT INITIAL ) ( ObjectUUID = ls_o-ObjectUUID ) )
      RESULT DATA(lt_objects).

    LOOP AT lt_links INTO DATA(ls_link).
      IF xsdbool( ls_link-TicketUUID IS INITIAL ) = xsdbool( ls_link-ObjectUUID IS INITIAL ).
        APPEND VALUE #( %tky = ls_link-%tky ) TO failed-articlelink.
        APPEND VALUE #( %tky = ls_link-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'A link points to either a ticket or an object' ) )
          TO reported-articlelink.
      ELSEIF ( ls_link-TicketUUID IS NOT INITIAL AND NOT line_exists( lt_tickets[ TicketUUID = ls_link-TicketUUID ] ) )
          OR ( ls_link-ObjectUUID IS NOT INITIAL AND NOT line_exists( lt_objects[ ObjectUUID = ls_link-ObjectUUID ] ) ).
        APPEND VALUE #( %tky = ls_link-%tky ) TO failed-articlelink.
        APPEND VALUE #( %tky = ls_link-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = 'The linked ticket or object does not exist' ) )
          TO reported-articlelink.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
