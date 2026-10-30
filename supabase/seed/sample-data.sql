-- Sample data for one SLATE·SPACE account (standalone / Supabase).
-- Run in Supabase → SQL Editor → New query (choose "Run without RLS" if asked). Change the email on the next line if needed.
-- Adds 5 projects, 24 tickets over the last ~90 days (with status history, time, tests, checklists, notes),
-- 17 objects with dependencies, transports in DEV / QA / PRD (one failed) and 5 knowledge articles.
-- Everything it adds is tagged "sample-data", so the remove script at the end of this file can take it out again.
do $$
declare
  v_email text := 'himanshusudra30@gmail.com';
  uid uuid; me text;
  t record; tid uuid; st text; at timestamptz; created timestamptz; steps text[]; i int; d int; n int := 0; tr int := 900200;
  path text[]; acc text[]; obj uuid[]; o record;
  ids uuid[] := '{}';
begin
  select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), email) into uid, me from auth.users where lower(email) = lower(v_email);
  if uid is null then raise exception 'No account with the email %', v_email; end if;
  if exists (select 1 from public.tickets where user_id = uid and "Reference" = 'sample-data') then
    raise exception 'Sample data is already there. Run the remove script at the end of this file first.';
  end if;

  /* ---------- projects ---------- */
  insert into public.projects (user_id, "Project", "Name", "Color", "SortOrder") values
    (uid, 'GST',  'GST & e-invoicing',     '#4EA7FC', 2), (uid, 'GATE', 'Gate entry app',        '#4CB782', 3),
    (uid, 'PPR',  'Production reporting',  '#F2994A', 4), (uid, 'FIN',  'Finance automation',    '#F2C94C', 5),
    (uid, 'CORE', 'Clean core & platform', '#BB87FC', 6)
  on conflict (user_id, "Project") do nothing;

  /* ---------- objects and their dependencies ---------- */
  insert into public.tech_objects (user_id, "Project", "ObjectType", "ObjectName", "Description", "PackageName", "Notes", "CreatedBy", "CreatedAt")
  select uid, p, ty, nm, ds, pk, 'sample-data', me, now() - (80 - k) * interval '1 day'
  from (values
    (1,'GST','PROG','ZSD_SALES_REGISTER','Sales register with GST split','ZSD_GST'), (2,'GST','TABL','ZEINV_LOG','E-invoice request log','ZSD_GST'),
    (3,'GST','CLAS','ZCL_EINV_IRP_CLIENT','IRP API client with retry','ZSD_GST'), (4,'GST','DEST','IRP_GSP','HTTP destination to the GSP',''),
    (5,'GST','API','IRP e-invoice API','Government IRP (generate / cancel IRN)',''), (6,'GST','SSFO','ZSD_TAX_INVOICE','Tax invoice form with QR code','ZSD_GST'),
    (7,'GATE','TABL','ZMM_GATE_HDR','Gate entry header','ZMM_GATE'), (8,'GATE','TABL','ZMM_GATE_ITM','Gate entry items (PO lines)','ZMM_GATE'),
    (9,'GATE','DDLS','ZR_MM_GATEENTRY','Gate entry BO root view','ZMM_GATE'), (10,'GATE','BDEF','ZR_MM_GATEENTRY','Gate entry behavior','ZMM_GATE'),
    (11,'GATE','CLAS','ZBP_R_MM_GATEENTRY','Gate entry behavior pool','ZMM_GATE'), (12,'GATE','SRVB','ZUI_MM_GATE_O4','Gate entry OData V4 binding','ZMM_GATE'),
    (13,'GATE','FIORI','zmm.gateentry','Gate entry app',''), (14,'PPR','PROG','ZPP_MRP_LINK','MRP link report','ZPP_REP'),
    (15,'PPR','DDLS','ZI_PP_PRODDASHBOARD','Scheduled vs actual per order','ZPP_REP'), (16,'FIN','PROG','ZFI_VENDOR_MAIL','Vendor auto-mail','ZFI_AUTO'),
    (17,'CORE','CLAS','ZCL_CA_APPLOG','Application log helper','ZCA_TOOLS')
  ) as v(k, p, ty, nm, ds, pk)
  on conflict (user_id, "ObjectType", "ObjectName") do nothing;
  select array_agg(x."ObjectUUID" order by x.k) into obj from (
    select o2."ObjectUUID", v.k from public.tech_objects o2 join (values
      (1,'PROG','ZSD_SALES_REGISTER'),(2,'TABL','ZEINV_LOG'),(3,'CLAS','ZCL_EINV_IRP_CLIENT'),(4,'DEST','IRP_GSP'),(5,'API','IRP e-invoice API'),
      (6,'SSFO','ZSD_TAX_INVOICE'),(7,'TABL','ZMM_GATE_HDR'),(8,'TABL','ZMM_GATE_ITM'),(9,'DDLS','ZR_MM_GATEENTRY'),(10,'BDEF','ZR_MM_GATEENTRY'),
      (11,'CLAS','ZBP_R_MM_GATEENTRY'),(12,'SRVB','ZUI_MM_GATE_O4'),(13,'FIORI','zmm.gateentry'),(14,'PROG','ZPP_MRP_LINK'),
      (15,'DDLS','ZI_PP_PRODDASHBOARD'),(16,'PROG','ZFI_VENDOR_MAIL'),(17,'CLAS','ZCL_CA_APPLOG')) v(k, ty, nm)
    on o2.user_id = uid and o2."ObjectType" = v.ty and o2."ObjectName" = v.nm) x;
  insert into public.object_deps (user_id, "ObjectUUID", "UsesObjectUUID", "DepKind")
  select uid, obj[a], obj[b], 'USES' from (values (1,2),(3,2),(3,4),(4,5),(6,2),(9,7),(9,8),(10,9),(11,10),(12,10),(13,12),(15,14),(3,17),(16,17),(11,17)) e(a, b);

  /* ---------- tickets: final status, priority, days ago created, due after (days), estimate ---------- */
  for t in select * from (values
    ( 1,'GST','SD','ABAP','CR','Sales register: add GST split columns','DONE','2',88,20,8, array['CGST, SGST and IGST in separate columns','Totals match the billing documents']),
    ( 2,'GST','SD','INTEG','BUG','E-invoice cockpit: retry failed IRN generation','DONE','1',80,10,6, array['Failed requests can be retried','Each retry is logged']),
    ( 3,'GST','SD','INTEG','CR','IRP API: timeout handling and retry with backoff','TEST','2',30,25,10, array['Timeout 60 s','Up to 3 retries with backoff']),
    ( 4,'GST','SD','FORM','CR','Tax invoice form: print IRN QR code','PROG','2',18,16,6, array['QR code printed for invoices with an IRN']),
    ( 5,'GST','SD','ABAP','BUG','Credit notes missing in GSTR-1 extract','TODO','1',6,4,4, array['Credit notes appear in the extract']),
    ( 6,'GATE','MM','RAP','NEW','Gate entry: multiple POs per vehicle','DONE','2',75,30,24, array['One gate entry holds items of several POs','Quantity check per PO item']),
    ( 7,'GATE','MM','RAP','CR','Gate entry: approval with four-eyes check','PROG','2',22,18,12, array['Creator cannot approve','Approval is logged']),
    ( 8,'GATE','MM','FIORI','BUG','Gate entry app: unclear vehicle number message','DONE','3',40,8,2, array['Message names the expected format']),
    ( 9,'GATE','MM','ODATA','BUG','Gate entry OData: $expand to items is slow','BLOCK','2',26,14,6, array['List with items loads in under 2 s']),
    (10,'GATE','MM','FIORI','CR','Gate entry app: scan vehicle number with camera','BACKLOG','4',12,40,10, array['Camera scan fills the vehicle number']),
    (11,'PPR','PP','ABAP','CR','MRP link report: performance on large plants','TEST','1',34,20,12, array['Runtime under 60 s for plant 1000']),
    (12,'PPR','PP','CDS','NEW','Production dashboard: scheduled vs actual','DONE','3',65,25,16, array['Scheduled and actual quantity per order']),
    (13,'PPR','PP','ODATA','CR','Dashboard service: add plant filter','TODO','3',9,12,3, array['Filter by plant with value help']),
    (14,'FIN','FI','ABAP','BUG','Vendor auto-mail fails for blocked vendors','DONE','1',55,5,3, array['Blocked vendors are skipped and listed in the log']),
    (15,'FIN','FI','ABAP','CR','Pending tax invoice reminder: CC to manager','PROG','3',15,12,5, array['Manager in CC from the org assignment']),
    (16,'FIN','FI','FORM','CR','Statement of account: add opening balance','TODO','2',8,3,4, array['Opening balance on the first page']),
    (17,'FIN','FI','INTEG','NEW','Bank statement import via API','BACKLOG','3',5,45,20, array['Statements are imported every morning']),
    (18,'CORE','BASIS','ABAP','CR','Application log helper: add context fields','DONE','3',70,15,4, array['Ticket number and object in every log entry']),
    (19,'CORE','BASIS','ABAP','SUP','ATC findings on custom code: triage','PROG','2',20,10,8, array['Priority 1 findings assigned to tickets']),
    (20,'CORE','BASIS','RAP','NEW','Clean core: replace BAPI calls with released APIs','TODO','3',10,30,16, array['No unreleased API in the sales order process']),
    (21,'GST','SD','ABAP','SUP','Year-end: archive e-invoice log','DONE','4',45,20,2, array['Entries older than 2 years archived']),
    (22,'GATE','MM','RAP','BUG','Gate entry: duplicate number after parallel save','DONE','1',35,4,5, array['Numbers stay unique with parallel users']),
    (23,'PPR','PP','ABAP','BUG','Shift report shows wrong date after midnight','TEST','2',12,8,3, array['Night shift is reported on its start date']),
    (24,'FIN','FI','ABAP','CR','Payment run log: email summary to finance','BACKLOG','4',3,30,4, array['Summary email after each payment run'])
  ) as v(k, project, area, tech, ty, title, status, prio, days_ago, due_after, est, acc)
  loop
    n := n + 1;
    created := date_trunc('day', now()) - t.days_ago * interval '1 day' + interval '10 hours';
    path := case t.status when 'BACKLOG' then array['BACKLOG'] when 'TODO' then array['BACKLOG','TODO'] when 'PROG' then array['BACKLOG','TODO','PROG']
      when 'TEST' then array['BACKLOG','TODO','PROG','TEST'] when 'BLOCK' then array['BACKLOG','TODO','PROG','BLOCK']
      else case when n % 3 = 0 then array['BACKLOG','TODO','PROG','BLOCK','PROG','TEST','DONE'] else array['BACKLOG','TODO','PROG','TEST','DONE'] end end;

    insert into public.tickets (user_id, "Title", "Description", "Status", "Priority", "Project", "Area", "Tech", "TicketType", "Environment",
      "Assignee", "Requester", "Reference", "DueDate", "EstimateHours", "CreatedBy", "CreatedAt", "StatusChangedAt")
    values (uid, t.title, 'Requested by ' || case t.area when 'SD' then 'Sales Ops' when 'MM' then 'Purchasing' when 'FI' then 'Finance' when 'PP' then 'Production planning' else 'IT' end || '.',
      'BACKLOG', t.prio, t.project, t.area, t.tech, t.ty, 'DEV', me,
      case t.area when 'SD' then 'Sales Ops' when 'MM' then 'Purchasing' when 'FI' then 'Finance' when 'PP' then 'Production planning' else 'IT' end,
      'sample-data', (created + t.due_after * interval '1 day')::date, t.est, me, created, created)
    returning "TicketUUID" into tid;
    ids := ids || tid;

    -- status history spread between creation and now (the last step a little before now)
    at := created;
    for i in 2 .. coalesce(array_length(path, 1), 1) loop
      at := at + (extract(epoch from (now() - interval '6 hours' - at)) / (array_length(path, 1) - i + 1.5)) * interval '1 second';
      insert into public.ticket_events (user_id, "TicketUUID", "EventKind", "StatusFrom", "StatusTo", "EventAt", "EventBy", "IsRead")
      values (uid, tid, 'STAT', path[i - 1], path[i], at, me, at < now() - interval '2 days');
      -- time on working days while the ticket was being worked on
      if path[i] in ('TEST', 'DONE', 'BLOCK') or (i = array_length(path, 1) and path[i] = 'PROG') then
        for d in 0 .. 3 loop
          if extract(isodow from at - d * interval '1 day') < 6 and (n + d) % 3 <> 0 then
            insert into public.worklogs (user_id, "TicketUUID", "WorkDate", "Hours", "Activity", "CommentText", "CreatedBy", "CreatedAt")
            values (uid, tid, (at - d * interval '1 day')::date, 0.5 + ((n * 7 + d * 3) % 10) * 0.25,
              case when path[i] = 'TEST' then 'TEST' when (n + d) % 4 = 0 then 'DEBUG' when (n + d) % 5 = 0 then 'ANA' else 'CODE' end, '', me, at);
          end if;
        end loop;
      end if;
    end loop;
    -- open work: some time in the last days, so Home and the timesheet have this week's hours
    if t.status in ('PROG', 'TEST') then
      for d in 0 .. 5 loop
        if extract(isodow from now() - d * interval '1 day') < 6 and (n + d) % 2 = 0 then
          insert into public.worklogs (user_id, "TicketUUID", "WorkDate", "Hours", "Activity", "CreatedBy")
          values (uid, tid, (now() - d * interval '1 day')::date, 1 + ((n + d) % 5) * 0.5, case when t.status = 'TEST' then 'TEST' else 'CODE' end, me);
        end if;
      end loop;
    end if;

    update public.tickets set "Status" = t.status, "StatusChangedAt" = at, "ClosedAt" = case when t.status = 'DONE' then at end where "TicketUUID" = tid;

    insert into public.acceptance (user_id, "TicketUUID", "SortOrder", "Text") select uid, tid, k, a from unnest(t.acc) with ordinality u(a, k);
    insert into public.test_cases (user_id, "TicketUUID", "SortOrder", "TestName", "Expected", "Actual", "TestResult", "TestedAt", "TestedBy")
    select uid, tid, k, a, a, case when t.status = 'DONE' then a else '' end,
      case when t.status = 'DONE' then 'PASS' when t.status = 'TEST' and k = 1 then 'PASS' else 'OPEN' end,
      case when t.status in ('DONE', 'TEST') and (t.status = 'DONE' or k = 1) then at end, case when t.status = 'DONE' or (t.status = 'TEST' and k = 1) then me else '' end
    from unnest(t.acc) with ordinality u(a, k);
    insert into public.checklist_items (user_id, "TicketUUID", "SortOrder", "Category", "Text", "IsDone")
    select uid, tid, v."SortOrder", v."Code", v."Text", t.status = 'DONE' or (t.status = 'TEST' and v."SortOrder" <= 2)
    from public.value_items v where v.user_id = uid and v."ListType" = 'CHECKCAT';
    if t.status in ('PROG', 'BLOCK', 'TEST') then
      insert into public.notes (user_id, "TicketUUID", "Text", "CreatedBy", "CreatedAt") values (uid, tid,
        case t.status when 'BLOCK' then '<p>Waiting for Basis to add the index in QA – raised with the Basis team.</p>'
          when 'TEST' then '<p>Moved to QA. Requester will test on Monday with real data.</p>'
          else '<p>Checked in DEV with test data; waiting for feedback on the layout.</p>' end, me, at);
    end if;

    -- one or two changed objects of the same project
    insert into public.object_links (user_id, "TicketUUID", "ObjectUUID", "ChangeKind")
    select uid, tid, x."ObjectUUID", case when x.rn = 1 then 'CHANGE' else 'CHECK' end
    from (select o2."ObjectUUID", row_number() over (order by o2."ObjectName") rn from public.tech_objects o2
          where o2.user_id = uid and o2."Project" = t.project and o2."Notes" = 'sample-data' order by o2."ObjectName" offset (n % 2) limit 2) x;

    -- a transport for everything that reached development
    if t.status in ('PROG', 'TEST', 'DONE', 'BLOCK') then
      tr := tr + 1;
      insert into public.transports (user_id, "TrKorr", "TicketUUID", "TrText", "TrOwner", "ReleasedOn", "QaRc", "QaImportedAt", "PrdRc", "PrdImportedAt",
        "TestEvidence", "RollbackNotes", "CreatedBy", "CreatedAt")
      values (uid, 'S4DK' || tr, tid, left('TK sample ' || t.title, 60), me,
        case when t.status in ('TEST', 'DONE') then (at - interval '2 days')::date end,
        case when t.k = 11 then 8 when t.k = 3 then 4 else 0 end,
        case when t.status in ('TEST', 'DONE') then at - interval '2 days' end,
        0, case when t.status = 'DONE' then at - interval '6 hours' end,
        case when t.status = 'DONE' then 'Tested in QA with the requester; screenshots in the ticket.' else '' end, 'sample-data', me, created + interval '3 days');
    end if;
  end loop;

  -- the TK- numbers in the transport texts
  update public.transports x set "TrText" = left(tk."TicketId" || ' ' || tk."Title", 60)
  from public.tickets tk where x."TicketUUID" = tk."TicketUUID" and x.user_id = uid and x."RollbackNotes" = 'sample-data';
  insert into public.transport_deps (user_id, "TransportUUID", "DependsOn", "NoteText")
  select uid, x."TransportUUID", 'S4DK900201', 'same table' from public.transports x where x.user_id = uid and x."TrKorr" = 'S4DK900206';

  /* ---------- knowledge base ---------- */
  insert into public.articles (user_id, "ArticleType", "Title", "Tags", "ErrorText", "RootCause", "FixLocation", "FixText", "TestNote", "CreatedBy", "CreatedAt")
  values (uid, 'FIX', 'RAP dump CX_RAP_HANDLER_NOT_IMPLEMENTED on a child action', 'rap,dump,sample-data',
    'Short dump CX_RAP_HANDLER_NOT_IMPLEMENTED when the UI calls an action on a child entity.', 'The action was declared on the child, but the handler class only implemented the root.',
    'ZBP_R_MM_GATEENTRY, local handler for the item', 'Moved the action to the root entity and passed the item key as a parameter.', 'Action works from the list and the object page.', me, now() - interval '40 days');
  insert into public.articles (user_id, "ArticleType", "Title", "Tags", "CodeLang", "CodeText", "NoteText", "CreatedBy", "CreatedAt")
  values (uid, 'SNIP', 'Application log with context fields', 'abap,log,sample-data', 'ABAP',
    E'DATA(lo_log) = zcl_ca_applog=>create( object = ''ZDD'' subobject = ''TICKET'' ).\nlo_log->add_text( |Ticket { lv_ticket }: { lv_text }| ).\nlo_log->save( ).',
    'Always pass the ticket number so the log can be found from SLATE·SPACE.', me, now() - interval '30 days');
  insert into public.articles (user_id, "ArticleType", "Title", "Tags", "HttpMethod", "Endpoint", "RequestBody", "ResponseBody", "ResponseCodes", "AuthReference", "CreatedBy", "CreatedAt")
  values (uid, 'API', 'IRP: generate IRN', 'gst,einvoice,api,sample-data', 'POST', '/eicore/v1.03/Invoice',
    E'{\n  "Version": "1.1",\n  "TranDtls": { "TaxSch": "GST", "SupTyp": "B2B" }\n}', '{ "Irn": "...", "AckNo": 112010000001, "Status": "ACT" }',
    '200 ok, 2150 duplicate IRN, 5002 timeout', 'Token from destination IRP_GSP (no credentials here)', me, now() - interval '22 days');
  insert into public.articles (user_id, "ArticleType", "Title", "Tags", "StepsText", "CreatedBy", "CreatedAt")
  values (uid, 'CONF', 'Publish an OData V4 service group', 'odata,basis,sample-data',
    E'/IWFND/V4_ADMIN\nPublish Service Groups\nSystem alias LOCAL, Get Service Groups\nSelect the group and publish', me, now() - interval '15 days');
  insert into public.articles (user_id, "ArticleType", "Title", "Tags", "ContextText", "DecisionText", "Consequences", "CreatedBy", "CreatedAt")
  values (uid, 'DECI', 'Gate entry: no draft', 'rap,design,sample-data', 'Security staff create entries on a tablet in one step.',
    'Managed BO without draft; every change is saved at once.', 'Validations must give clear messages because there is no draft to fix later.', me, now() - interval '8 days');
  insert into public.article_links (user_id, "ArticleUUID", "ObjectUUID")
  select uid, a."ArticleUUID", o2."ObjectUUID" from public.articles a join public.tech_objects o2 on o2.user_id = uid and o2."Notes" = 'sample-data'
    and ((a."Title" like 'RAP dump%' and o2."ObjectName" = 'ZBP_R_MM_GATEENTRY') or (a."Title" like 'Application log%' and o2."ObjectName" = 'ZCL_CA_APPLOG')
      or (a."Title" like 'IRP:%' and o2."ObjectName" in ('IRP e-invoice API', 'ZCL_EINV_IRP_CLIENT')) or (a."Title" like 'Publish%' and o2."ObjectName" = 'ZUI_MM_GATE_O4')
      or (a."Title" like 'Gate entry: no draft' and o2."ObjectType" = 'DDLS' and o2."ObjectName" = 'ZR_MM_GATEENTRY'))
  where a.user_id = uid and a."Tags" like '%sample-data%';

  raise notice 'Sample data added: % tickets for %', n, v_email;
end $$;

/* ------------------------------------------------------------------------------------------------
   To remove the sample data again, run this (only rows tagged "sample-data" are deleted):

   do $$
   declare uid uuid := (select id from auth.users where lower(email) = lower('himanshusudra30@gmail.com'));
   begin
     delete from public.transports    where user_id = uid and "RollbackNotes" = 'sample-data';
     delete from public.tickets       where user_id = uid and "Reference" = 'sample-data';
     delete from public.articles      where user_id = uid and "Tags" like '%sample-data%';
     delete from public.tech_objects  where user_id = uid and "Notes" = 'sample-data';
     delete from public.projects p    where p.user_id = uid and p."Project" in ('GST','GATE','PPR','FIN','CORE')
       and not exists (select 1 from public.tickets t where t.user_id = uid and t."Project" = p."Project");
   end $$;
   ------------------------------------------------------------------------------------------------ */
