-- SLATE·SPACE standalone backend (Supabase / Postgres).
-- Column names are the app's field names (same as the SAP OData service), so the frontend needs no mapping.
-- Every row belongs to one user (user_id). Row level security only returns a user's own rows, and only for a
-- session that has passed the emailed 2-step code (public.session_verified()).


/* ---------------------------------------------------------------------------
   2-step login: codes and verified sessions (written only by the edge functions)
   --------------------------------------------------------------------------- */
create table public.login_codes (
  session_id uuid primary key,
  user_id    uuid not null references auth.users on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  sent_at    timestamptz not null default now()
);
create table public.verified_sessions (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.login_codes enable row level security;        -- no policies: only the service role (edge functions) can use it
alter table public.verified_sessions enable row level security;

/** True when the caller's current session has entered its emailed code */
create or replace function public.session_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.verified_sessions v
    where v.user_id = auth.uid() and v.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;
grant execute on function public.session_verified() to authenticated;

/* ---------------------------------------------------------------------------
   Settings lists and projects (seeded per user on sign-up)
   --------------------------------------------------------------------------- */
create table public.counters (
  user_id    uuid primary key references auth.users on delete cascade default auth.uid(),
  ticket_seq int not null default 1001,
  kb_seq     int not null default 1
);
create table public.projects (
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  "Project"   text not null,
  "Name"      text not null,
  "Color"     text not null default '#4EA7FC',
  "SortOrder" int  not null default 0,
  "IsActive"  boolean not null default true,
  primary key (user_id, "Project")
);
create table public.value_items (
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  "ListType"  text not null,
  "Code"      text not null,
  "Text"      text not null,
  "SortOrder" int  not null default 0,
  "Color"     text not null default '',
  "WipLimit"  int  not null default 0,
  "IsActive"  boolean not null default true,
  primary key (user_id, "ListType", "Code")
);

/* ---------------------------------------------------------------------------
   Tickets and their children
   --------------------------------------------------------------------------- */
create table public.tickets (
  "TicketUUID"      uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketNo"        text not null default '',
  "TicketId"        text not null default '',
  "Title"           text not null check (length(trim("Title")) > 0),
  "Description"     text not null default '',
  "Status"          text not null default 'BACKLOG' check ("Status" in ('BACKLOG','TODO','PROG','TEST','BLOCK','DONE')),
  "Priority"        text not null default '3' check ("Priority" in ('1','2','3','4')),
  "Project"         text not null default '',
  "Area"            text not null default '',
  "Tech"            text not null default '',
  "TicketType"      text not null default '',
  "Environment"     text not null default 'DEV',
  "Assignee"        text not null default '',
  "Requester"       text not null default '',
  "Reference"       text not null default '',
  "DueDate"         date,
  "EstimateHours"   numeric(6,2) not null default 0 check ("EstimateHours" >= 0),
  "StatusChangedAt" timestamptz default now(),
  "ClosedAt"        timestamptz,
  "TimerStartedAt"  timestamptz,
  "CreatedBy"       text not null default '',
  "CreatedAt"       timestamptz not null default now(),
  "LastChangedAt"   timestamptz not null default now(),
  unique (user_id, "TicketNo")
);
create index on public.tickets (user_id, "LastChangedAt");

create table public.acceptance (
  "AccUUID"    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "SortOrder"  int not null default 0,
  "Text"       text not null default ''
);
create table public.test_cases (
  "TestUUID"   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "SortOrder"  int not null default 0,
  "TestName"   text not null default '',
  "TestSteps"  text not null default '',
  "Expected"   text not null default '',
  "Actual"     text not null default '',
  "TestResult" text not null default 'OPEN' check ("TestResult" in ('OPEN','PASS','FAIL')),
  "TestedAt"   timestamptz,
  "TestedBy"   text not null default ''
);
create table public.checklist_items (
  "ItemUUID"   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "SortOrder"  int not null default 0,
  "Category"   text not null default '',
  "Text"       text not null default '',
  "IsDone"     boolean not null default false
);
create table public.worklogs (
  "WorklogUUID" uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID"  uuid not null references public.tickets on delete cascade,
  "WorkDate"    date not null default current_date check ("WorkDate" <= current_date + 1),
  "Hours"       numeric(5,2) not null check ("Hours" > 0 and "Hours" <= 24),
  "Activity"    text not null default 'CODE',
  "CommentText" text not null default '',
  "EntrySource" text not null default 'MANUAL',
  "CreatedBy"   text not null default '',
  "CreatedAt"   timestamptz not null default now()
);
create index on public.worklogs (user_id, "WorkDate");
create table public.notes (
  "NoteUUID"   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "Text"       text not null default '',
  "CreatedBy"  text not null default '',
  "CreatedAt"  timestamptz not null default now()
);
create table public.ticket_events (
  "EventUUID"  uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "EventKind"  text not null default 'STAT',
  "StatusFrom" text not null default '',
  "StatusTo"   text not null default '',
  "Text"       text not null default '',
  "EventAt"    timestamptz not null default now(),
  "EventBy"    text not null default '',
  "IsRead"     boolean not null default false
);
create index on public.ticket_events (user_id, "EventAt" desc);
create table public.attachments (                -- file content lives in storage bucket "attachments" at <user_id>/<AttUUID>
  "AttUUID"    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "FileName"   text not null,
  "MimeType"   text not null default 'application/octet-stream',
  "FileSize"   int  not null check ("FileSize" > 0 and "FileSize" <= 10485760),
  "CreatedBy"  text not null default '',
  "CreatedAt"  timestamptz not null default now()
);

/* ---------------------------------------------------------------------------
   Phase 2: transports, object registry, knowledge base
   --------------------------------------------------------------------------- */
create table public.tech_objects (
  "ObjectUUID"    uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  "ObjectType"    text not null,
  "ObjectName"    text not null check (length(trim("ObjectName")) > 0),
  "Description"   text not null default '',
  "PackageName"   text not null default '',
  "Project"       text not null default '',
  "Notes"         text not null default '',
  "CreatedBy"     text not null default '',
  "CreatedAt"     timestamptz not null default now(),
  "LastChangedAt" timestamptz not null default now(),
  unique (user_id, "ObjectType", "ObjectName")
);
create table public.object_deps (
  "DepUUID"        uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade default auth.uid(),
  "ObjectUUID"     uuid not null references public.tech_objects on delete cascade,
  "UsesObjectUUID" uuid not null references public.tech_objects on delete cascade,
  "DepKind"        text not null default 'USES',
  "NoteText"       text not null default '',
  check ("ObjectUUID" <> "UsesObjectUUID")
);
create table public.object_links (               -- ticket ↔ object
  "LinkUUID"   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "ObjectUUID" uuid not null references public.tech_objects on delete cascade,
  "ChangeKind" text not null default 'CHANGE' check ("ChangeKind" in ('NEW','CHANGE','CHECK')),
  "NoteText"   text not null default '',
  unique ("TicketUUID", "ObjectUUID")
);
create table public.transports (
  "TransportUUID" uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  "TrKorr"        text not null check ("TrKorr" ~ '^[A-Z0-9]{3}[KT][0-9]{6}$'),
  "TicketUUID"    uuid references public.tickets on delete set null,
  "TrText"        text not null default '' check (length("TrText") <= 60),
  "TrKind"        text not null default 'K',
  "TrOwner"       text not null default '',
  "ReleasedOn"    date,
  "QaRc"          int not null default 0,
  "QaImportedAt"  timestamptz,
  "PrdRc"         int not null default 0,
  "PrdImportedAt" timestamptz,
  "Phase"         text generated always as (
                    case when "PrdImportedAt" is not null then case when "PrdRc" > 4 then 'FAILED' else 'PRD' end
                         when "QaImportedAt"  is not null then case when "QaRc"  > 4 then 'FAILED' else 'QA'  end
                         else 'DEV' end) stored,
  "TestEvidence"  text not null default '',
  "DeployNotes"   text not null default '',
  "RollbackNotes" text not null default '',
  "CreatedBy"     text not null default '',
  "CreatedAt"     timestamptz not null default now(),
  "LastChangedAt" timestamptz not null default now(),
  unique (user_id, "TrKorr")
);
create table public.transport_deps (
  "DepUUID"       uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  "TransportUUID" uuid not null references public.transports on delete cascade,
  "DependsOn"     text not null check ("DependsOn" ~ '^[A-Z0-9]{3}[KT][0-9]{6}$'),
  "NoteText"      text not null default ''
);
create table public.articles (
  "ArticleUUID"   uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  "ArticleNo"     text not null default '',
  "ArticleId"     text not null default '',
  "ArticleType"   text not null default 'SNIP' check ("ArticleType" in ('SNIP','FIX','API','CONF','DECI')),
  "Title"         text not null check (length(trim("Title")) > 0),
  "Tags" text not null default '', "ErrorText" text not null default '', "RootCause" text not null default '',
  "FixLocation" text not null default '', "FixText" text not null default '', "TestNote" text not null default '',
  "CodeText" text not null default '', "CodeLang" text not null default '', "NoteText" text not null default '',
  "HttpMethod" text not null default '', "Endpoint" text not null default '', "RequestBody" text not null default '',
  "ResponseBody" text not null default '', "ResponseCodes" text not null default '', "AuthReference" text not null default '',
  "StepsText" text not null default '', "ContextText" text not null default '', "DecisionText" text not null default '',
  "Consequences" text not null default '',
  "CreatedBy"     text not null default '',
  "CreatedAt"     timestamptz not null default now(),
  "LastChangedAt" timestamptz not null default now()
);
create table public.article_links (
  "LinkUUID"    uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  "ArticleUUID" uuid not null references public.articles on delete cascade,
  "TicketUUID"  uuid references public.tickets on delete cascade,
  "ObjectUUID"  uuid references public.tech_objects on delete cascade,
  check (("TicketUUID" is null) <> ("ObjectUUID" is null))
);

/* ---------------------------------------------------------------------------
   Ticket list view: derived fields the SAP CDS view calculates (project name, logged hours, overdue)
   --------------------------------------------------------------------------- */
create view public.tickets_v with (security_invoker = true) as
  select t.*,
    coalesce(p."Name", t."Project") as "ProjectName",
    coalesce((select sum(w."Hours") from public.worklogs w where w."TicketUUID" = t."TicketUUID"), 0)::float8 as "LoggedHours",
    (t."Status" <> 'DONE' and t."DueDate" is not null and t."DueDate" < current_date) as "IsOverdue"
  from public.tickets t
  left join public.projects p on p.user_id = t.user_id and p."Project" = t."Project";

/* ---------------------------------------------------------------------------
   Access: explicit grants (works with "Automatically expose new tables" turned off), then
   row level security: own rows, verified session only. The anon role gets nothing; the 2-step tables
   (login_codes, verified_sessions) are granted to no one – only the edge functions' service role uses them.
   --------------------------------------------------------------------------- */
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
-- the edge functions (service role) write the 2-step codes; it bypasses RLS but still needs table privileges
grant select, insert, update, delete on public.login_codes, public.verified_sessions to service_role;
grant select on public.tickets_v to authenticated;
do $$
declare t text;
begin
  foreach t in array array['counters','projects','value_items','tickets','acceptance','test_cases','checklist_items','worklogs','notes',
    'ticket_events','attachments','tech_objects','object_deps','object_links','transports','transport_deps','articles','article_links']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy own_rows on public.%I for all to authenticated
                     using (user_id = auth.uid() and public.session_verified())
                     with check (user_id = auth.uid() and public.session_verified())$p$, t);
  end loop;
end $$;

/* ---------------------------------------------------------------------------
   Business rules (what the RAP determinations do on SAP)
   --------------------------------------------------------------------------- */
-- ticket number per user: TK-1001, TK-1002, …; article number KB-1, KB-2, …
create or replace function public.assign_ticket_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.counters (user_id) values (new.user_id) on conflict (user_id) do nothing;
  update public.counters set ticket_seq = ticket_seq + 1 where user_id = new.user_id returning ticket_seq - 1 into n;
  new."TicketNo" := lpad(n::text, 8, '0');
  new."TicketId" := 'TK-' || n;
  return new;
end $$;
create trigger tickets_no before insert on public.tickets for each row execute function public.assign_ticket_no();

create or replace function public.assign_article_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.counters (user_id) values (new.user_id) on conflict (user_id) do nothing;
  update public.counters set kb_seq = kb_seq + 1 where user_id = new.user_id returning kb_seq - 1 into n;
  new."ArticleNo" := lpad(n::text, 8, '0');
  new."ArticleId" := 'KB-' || n;
  return new;
end $$;
create trigger articles_no before insert on public.articles for each row execute function public.assign_article_no();

-- LastChangedAt on the roots
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin new."LastChangedAt" := now(); return new; end $$;
create trigger tickets_touch before update on public.tickets for each row execute function public.touch_row();
create trigger transports_touch before update on public.transports for each row execute function public.touch_row();
create trigger objects_touch before update on public.tech_objects for each row execute function public.touch_row();
create trigger articles_touch before update on public.articles for each row execute function public.touch_row();

-- a change below a ticket marks the ticket as changed (the list polls on LastChangedAt)
create or replace function public.touch_ticket() returns trigger language plpgsql as $$
begin
  update public.tickets set "LastChangedAt" = now() where "TicketUUID" = coalesce(new."TicketUUID", old."TicketUUID");
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['acceptance','test_cases','checklist_items','worklogs','notes','attachments','object_links'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.touch_ticket()', t || '_touch', t);
  end loop;
end $$;

-- a change below a transport / object / article marks the root as changed
create or replace function public.touch_root() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'transport_deps' then
    update public.transports set "LastChangedAt" = now() where "TransportUUID" = coalesce(new."TransportUUID", old."TransportUUID");
  elsif tg_table_name = 'object_deps' then
    update public.tech_objects set "LastChangedAt" = now() where "ObjectUUID" = coalesce(new."ObjectUUID", old."ObjectUUID");
  else
    update public.articles set "LastChangedAt" = now() where "ArticleUUID" = coalesce(new."ArticleUUID", old."ArticleUUID");
  end if;
  return null;
end $$;
create trigger transport_deps_touch after insert or delete on public.transport_deps for each row execute function public.touch_root();
create trigger object_deps_touch after insert or delete on public.object_deps for each row execute function public.touch_root();
create trigger article_links_touch after insert or delete on public.article_links for each row execute function public.touch_root();

-- status change writes the history event and the status timestamps (RLS applies: security invoker)
create or replace function public.set_status(p_ticket uuid, p_status text, p_by text default '') returns void
language plpgsql set search_path = public as $$
declare old_status text;
begin
  select "Status" into old_status from public.tickets where "TicketUUID" = p_ticket for update;
  if not found then raise exception 'Ticket not found'; end if;
  if old_status = p_status then return; end if;
  update public.tickets set "Status" = p_status, "StatusChangedAt" = now(),
    "ClosedAt" = case when p_status = 'DONE' then now() else null end
  where "TicketUUID" = p_ticket;
  insert into public.ticket_events ("TicketUUID", "EventKind", "StatusFrom", "StatusTo", "EventBy", "IsRead")
  values (p_ticket, 'STAT', old_status, p_status, p_by, true);
end $$;
grant execute on function public.set_status(uuid, text, text) to authenticated;

-- stopping the timer logs the time in quarter hours (min 0.25 h, max 24 h)
create or replace function public.stop_timer(p_ticket uuid, p_by text default '') returns void
language plpgsql set search_path = public as $$
declare started timestamptz; st text; quarters int;
begin
  select "TimerStartedAt", "Status" into started, st from public.tickets where "TicketUUID" = p_ticket for update;
  if started is null then return; end if;
  quarters := greatest(1, least(96, round(extract(epoch from (now() - started)) / 900)::int));
  insert into public.worklogs ("TicketUUID", "WorkDate", "Hours", "Activity", "CommentText", "EntrySource", "CreatedBy")
  values (p_ticket, current_date, quarters / 4.0,
          case st when 'TEST' then 'TEST' when 'TODO' then 'ANA' else 'CODE' end, 'Timer', 'TIMER', p_by);
  update public.tickets set "TimerStartedAt" = null where "TicketUUID" = p_ticket;
end $$;
grant execute on function public.stop_timer(uuid, text) to authenticated;

/* ---------------------------------------------------------------------------
   New account: starter lists and one project
   --------------------------------------------------------------------------- */
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.counters (user_id) values (new.id) on conflict do nothing;
  insert into public.projects (user_id, "Project", "Name", "Color", "SortOrder") values (new.id, 'GEN', 'General', '#4C7DFF', 1);
  insert into public.value_items (user_id, "ListType", "Code", "Text", "SortOrder", "Color", "WipLimit")
  select new.id, v.* from (values
    ('STATUS','BACKLOG','Backlog',1,'#8A8F98',0), ('STATUS','TODO','To do',2,'#4EA7FC',0), ('STATUS','PROG','In progress',3,'#F0BF00',4),
    ('STATUS','TEST','Testing',4,'#26B5CE',5), ('STATUS','BLOCK','Blocked',5,'#EB5757',0), ('STATUS','DONE','Done',6,'#4CB782',0),
    ('AREA','SD','Sales and Distribution',1,'',0), ('AREA','MM','Materials Management',2,'',0), ('AREA','FI','Finance',3,'',0),
    ('AREA','PP','Production Planning',4,'',0), ('AREA','PS','Project System',5,'',0), ('AREA','BASIS','Basis / technical',6,'',0),
    ('TECH','RAP','RAP',1,'#5E6AD2',0), ('TECH','CDS','CDS',2,'#26B5CE',0), ('TECH','ABAP','ABAP',3,'#8A8F98',0), ('TECH','ODATA','OData',4,'#4CB782',0),
    ('TECH','FIORI','Fiori / UI5',5,'#BB87FC',0), ('TECH','INTEG','Integration',6,'#F2994A',0), ('TECH','FORM','Form',7,'#E5A3C0',0),
    ('TYPE','BUG','Bug',1,'',0), ('TYPE','CR','Change request',2,'',0), ('TYPE','NEW','New development',3,'',0), ('TYPE','SUP','Support',4,'',0),
    ('ACTIVITY','CODE','Coding',1,'#5E6AD2',0), ('ACTIVITY','DEBUG','Debugging',2,'#EB5757',0), ('ACTIVITY','TEST','Testing',3,'#26B5CE',0),
    ('ACTIVITY','ANA','Analysis',4,'#4CB782',0), ('ACTIVITY','MEET','Meetings',5,'#F2994A',0), ('ACTIVITY','DOC','Documentation',6,'#8A8F98',0),
    ('CHECKCAT','UNIT','Unit tests written and green',1,'',0), ('CHECKCAT','INTEG','Tested end-to-end in QA',2,'',0),
    ('CHECKCAT','AUTH','Authorization checks verified',3,'',0), ('CHECKCAT','ERROR','Errors logged and shown to the user',4,'',0),
    ('CHECKCAT','PERF','Runtime checked with production volume',5,'',0), ('CHECKCAT','TRANSPORT','All objects in the TR, TR released',6,'',0),
    ('OBJTYPE','TABL','Table',1,'#4EA7FC',0), ('OBJTYPE','DDLS','CDS view',2,'#26B5CE',0), ('OBJTYPE','BDEF','Behavior definition',3,'#5E6AD2',0),
    ('OBJTYPE','CLAS','Class',4,'#F0BF00',0), ('OBJTYPE','PROG','Report',5,'#8A8F98',0), ('OBJTYPE','FUGR','Function group',6,'#8A8F98',0),
    ('OBJTYPE','TRAN','Transaction',7,'#8A8F98',0), ('OBJTYPE','SRVD','Service definition',8,'#4CB782',0), ('OBJTYPE','SRVB','Service binding',9,'#4CB782',0),
    ('OBJTYPE','SSFO','Smart Form / Adobe form',10,'#E5A3C0',0), ('OBJTYPE','FIORI','Fiori app',11,'#BB87FC',0), ('OBJTYPE','DEST','Destination (SM59)',12,'#F2994A',0),
    ('OBJTYPE','API','External API',13,'#EB5757',0),
    ('KBTYPE','SNIP','Snippet',1,'',0), ('KBTYPE','FIX','Error & fix',2,'',0), ('KBTYPE','API','API example',3,'',0), ('KBTYPE','CONF','Config note',4,'',0), ('KBTYPE','DECI','Design decision',5,'',0),
    ('DEPKIND','USES','uses',1,'',0), ('DEPKIND','EXPOSES','exposes',2,'',0), ('DEPKIND','CALLS','calls',3,'',0)
  ) as v;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

/* ---------------------------------------------------------------------------
   Attachment files: private bucket, one folder per user, verified sessions only
   --------------------------------------------------------------------------- */
insert into storage.buckets (id, name, public, file_size_limit) values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;
create policy attachments_own on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text and public.session_verified())
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text and public.session_verified());
