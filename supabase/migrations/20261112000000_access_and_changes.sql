-- 1. Access levels for sharing (projects and single tickets):
--      view    – read the ticket and everything below it
--      comment – view, plus add comments and log time (and change or remove their own)
--      edit    – change everything except delete / move to another project / share (what sharing did before)
--    Existing shares keep 'edit'. The owner changes a level any time.
-- 2. Change history: every change to a ticket's fields is recorded with who made it, old and new value; a change can be
--    undone. Tickets changed by someone else since you last opened them are flagged in the ticket list.

/* ---------- 1. access levels ---------- */
alter table public.project_shares add column "Access" text not null default 'edit' check ("Access" in ('view', 'comment', 'edit'));
alter table public.ticket_shares  add column "Access" text not null default 'edit' check ("Access" in ('view', 'comment', 'edit'));
-- the owner changes the level (only that column)
grant update ("Access") on public.project_shares, public.ticket_shares to authenticated;
create policy shares_level on public.project_shares for update to authenticated
  using (public.session_verified() and owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ticket_shares_level on public.ticket_shares for update to authenticated
  using (public.session_verified() and owner_id = auth.uid()) with check (owner_id = auth.uid());

/** what the current user may do with a ticket: 'owner', 'edit', 'comment', 'view' or null (the best of project and ticket share) */
create function public.ticket_access(p_ticket uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when t.user_id = auth.uid() then 'owner'
    else (select a from unnest(array[
            (select s."Access" from public.project_shares s where s.owner_id = t.user_id and s."Project" = t."Project" and s.member_id = auth.uid()),
            (select s."Access" from public.ticket_shares s where s."TicketUUID" = t."TicketUUID" and s.member_id = auth.uid())]) a
          where a is not null order by array_position(array['edit', 'comment', 'view'], a) limit 1)
  end
  from public.tickets t where t."TicketUUID" = p_ticket;
$$;
create function public.can_edit_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.ticket_access(p_ticket) in ('owner', 'edit'), false) $$;
create function public.can_comment_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.ticket_access(p_ticket) in ('owner', 'edit', 'comment'), false) $$;
/** a member may add tickets to a project shared with them only with edit access */
create function public.can_add_to_project(p_owner uuid, p_project text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or exists (select 1 from public.project_shares s
    where s.owner_id = p_owner and s."Project" = p_project and s.member_id = auth.uid() and s."Access" = 'edit');
$$;
grant execute on function public.ticket_access(uuid), public.can_edit_ticket(uuid), public.can_comment_ticket(uuid),
  public.can_add_to_project(uuid, text) to authenticated;

-- tickets: everyone with access reads; only edit access changes; adding to a shared project needs edit access there
drop policy tickets_add on public.tickets;
create policy tickets_add on public.tickets for insert to authenticated
  with check (public.session_verified() and public.can_add_to_project(user_id, "Project"));
drop policy tickets_change on public.tickets;
create policy tickets_change on public.tickets for update to authenticated
  using (public.session_verified() and (user_id = auth.uid() or public.can_edit_ticket("TicketUUID")))
  with check (public.session_verified() and (user_id = auth.uid() or public.can_edit_ticket("TicketUUID")));

-- rows below a ticket: comments and time with comment access (own rows); everything else with edit access
do $$
declare t text; own_ok boolean;
begin
  foreach t in array array['acceptance','test_cases','checklist_items','worklogs','notes','ticket_events','attachments','object_links'] loop
    own_ok := t in ('worklogs', 'notes', 'ticket_events');
    execute format('drop policy ticket_rows_add on public.%I', t);
    execute format('drop policy ticket_rows_change on public.%I', t);
    execute format('drop policy ticket_rows_delete on public.%I', t);
    execute format($p$create policy ticket_rows_add on public.%I for insert to authenticated
      with check (public.session_verified() and user_id = auth.uid() and %s)$p$, t,
      case when own_ok then 'public.can_comment_ticket("TicketUUID")' else 'public.can_edit_ticket("TicketUUID")' end);
    execute format($p$create policy ticket_rows_change on public.%I for update to authenticated
      using (public.session_verified() and (public.can_edit_ticket("TicketUUID") %s))
      with check (public.session_verified() and (public.can_edit_ticket("TicketUUID") %s))$p$, t,
      case when own_ok then 'or (user_id = auth.uid() and public.can_comment_ticket("TicketUUID"))' else '' end,
      case when own_ok then 'or (user_id = auth.uid() and public.can_comment_ticket("TicketUUID"))' else '' end);
    execute format($p$create policy ticket_rows_delete on public.%I for delete to authenticated
      using (public.session_verified() and (public.can_edit_ticket("TicketUUID") %s))$p$, t,
      case when own_ok then 'or (user_id = auth.uid() and public.can_comment_ticket("TicketUUID"))' else '' end);
  end loop;
end $$;

-- transports linked to a shared ticket: changing them needs edit access to that ticket
drop policy transports_add on public.transports;
create policy transports_add on public.transports for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and ("TicketUUID" is null or public.can_edit_ticket("TicketUUID")));
drop policy transports_change on public.transports;
create policy transports_change on public.transports for update to authenticated
  using (public.session_verified() and (user_id = auth.uid() or ("TicketUUID" is not null and public.can_edit_ticket("TicketUUID"))))
  with check (public.session_verified() and (user_id = auth.uid() or ("TicketUUID" is not null and public.can_edit_ticket("TicketUUID")))
              and ("TicketUUID" is null or public.can_edit_ticket("TicketUUID")));
create function public.can_edit_transport(p_transport uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.transports x where x."TransportUUID" = p_transport
                 and (x.user_id = auth.uid() or (x."TicketUUID" is not null and public.can_edit_ticket(x."TicketUUID"))));
$$;
grant execute on function public.can_edit_transport(uuid) to authenticated;
drop policy transport_deps_add on public.transport_deps;
create policy transport_deps_add on public.transport_deps for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and public.can_edit_transport("TransportUUID"));
drop policy transport_deps_delete on public.transport_deps;
create policy transport_deps_delete on public.transport_deps for delete to authenticated
  using (public.session_verified() and public.can_edit_transport("TransportUUID"));

-- timeline dependencies between tickets: edit access to the ticket that depends
drop policy links_add on public.ticket_links;
create policy links_add on public.ticket_links for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and public.can_edit_ticket("ToTicket") and public.can_see_ticket("FromTicket"));
drop policy links_delete on public.ticket_links;
create policy links_delete on public.ticket_links for delete to authenticated
  using (public.session_verified() and public.can_edit_ticket("ToTicket") and public.can_see_ticket("FromTicket"));

-- attachment files: anyone who sees the attachment may open it; removing it needs edit access (or it is your file)
drop policy attachments_shared_delete on storage.objects;
create policy attachments_shared_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.session_verified() and exists (select 1 from public.attachments a
    where a."AttUUID"::text = split_part(name, '/', 2) and a.user_id::text = split_part(name, '/', 1) and public.can_edit_ticket(a."TicketUUID")));

/* sharing with a level; members lists show it */
drop function public.share_project(text, text);
create function public.share_project(p_project text, p_email text, p_access text default 'edit') returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if p_access not in ('view', 'comment', 'edit') then raise exception 'Unknown access level' using errcode = '22023'; end if;
  if not exists (select 1 from public.projects where user_id = auth.uid() and "Project" = p_project) then
    raise exception 'Only your own projects can be shared' using errcode = '42501';
  end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  insert into public.project_shares (owner_id, "Project", member_id, "Access") values (auth.uid(), p_project, m, p_access)
    on conflict (owner_id, "Project", member_id) do update set "Access" = excluded."Access";
  return public.user_label(m);
end $$;
drop function public.share_ticket(uuid, text);
create function public.share_ticket(p_ticket uuid, p_email text, p_access text default 'edit') returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if p_access not in ('view', 'comment', 'edit') then raise exception 'Unknown access level' using errcode = '22023'; end if;
  if not exists (select 1 from public.tickets where "TicketUUID" = p_ticket and user_id = auth.uid()) then
    raise exception 'Only your own tickets can be shared' using errcode = '42501';
  end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  insert into public.ticket_shares ("TicketUUID", owner_id, member_id, "Access") values (p_ticket, auth.uid(), m, p_access)
    on conflict ("TicketUUID", member_id) do update set "Access" = excluded."Access";
  update public.tickets set "LastChangedAt" = now() where "TicketUUID" = p_ticket;
  return public.user_label(m);
end $$;
drop function public.project_members(text);
create function public.project_members(p_project text) returns table (member_id uuid, email text, name text, since timestamptz, access text)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt", s."Access"
  from public.project_shares s join auth.users u on u.id = s.member_id
  where s.owner_id = auth.uid() and s."Project" = p_project and public.session_verified()
  order by s."CreatedAt";
$$;
drop function public.ticket_members(uuid);
create function public.ticket_members(p_ticket uuid) returns table (member_id uuid, email text, name text, since timestamptz, access text)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt", s."Access"
  from public.ticket_shares s join auth.users u on u.id = s.member_id
  where s."TicketUUID" = p_ticket and s.owner_id = auth.uid() and public.session_verified()
  order by s."CreatedAt";
$$;
revoke all on function public.share_project(text, text, text), public.project_members(text),
  public.share_ticket(uuid, text, text), public.ticket_members(uuid) from public, anon;
grant execute on function public.share_project(text, text, text), public.project_members(text),
  public.share_ticket(uuid, text, text), public.ticket_members(uuid) to authenticated;

/* ---------- 2. change history ---------- */
create table public.ticket_changes (
  "ChangeUUID" uuid primary key default gen_random_uuid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  user_id      uuid references auth.users on delete set null,
  "Field"      text not null,
  "OldValue"   jsonb,
  "NewValue"   jsonb,
  "ChangedAt"  timestamptz not null default now()
);
create index on public.ticket_changes ("TicketUUID", "ChangedAt" desc);
alter table public.ticket_changes enable row level security;
create policy changes_read on public.ticket_changes for select to authenticated
  using (public.session_verified() and public.can_see_ticket("TicketUUID"));
grant select on public.ticket_changes to authenticated;
grant select, insert, update, delete on public.ticket_changes to service_role;

/** the fields whose changes are recorded (not timestamps or the running timer) */
create function public.tracked_fields() returns text[] language sql immutable as $$
  select array['Title','Description','Status','Priority','Project','Area','Tech','TicketType','Environment','Assignee',
               'Requester','Reference','DueDate','PlannedStart','EstimateHours']
$$;
create function public.record_ticket_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach f in array public.tracked_fields() loop
    if (o -> f) is distinct from (n -> f) then
      insert into public.ticket_changes ("TicketUUID", user_id, "Field", "OldValue", "NewValue")
      values (new."TicketUUID", coalesce(auth.uid(), new.user_id), f, o -> f, n -> f);
    end if;
  end loop;
  return null;
end $$;
create trigger tickets_changes after update on public.tickets for each row execute function public.record_ticket_changes();

/** names for the history: everyone whose change you can see (shares make user_label work) */
create function public.ticket_change_list(p_ticket uuid) returns table
  ("ChangeUUID" uuid, "Field" text, "OldValue" jsonb, "NewValue" jsonb, "ChangedAt" timestamptz, "By" text, "Mine" boolean)
language sql stable security invoker set search_path = public as $$
  select c."ChangeUUID", c."Field", c."OldValue", c."NewValue", c."ChangedAt",
    coalesce(public.user_label(c.user_id), 'Someone'), c.user_id = auth.uid()
  from public.ticket_changes c where c."TicketUUID" = p_ticket order by c."ChangedAt" desc limit 200;
$$;
/** puts a field back to its value before the change – only while nobody has changed it again */
create function public.undo_ticket_change(p_change uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare c public.ticket_changes; cur jsonb;
begin
  select * into c from public.ticket_changes where "ChangeUUID" = p_change;
  if not found then raise exception 'This change no longer exists' using errcode = 'P0002'; end if;
  if not public.can_edit_ticket(c."TicketUUID") then raise exception 'You can only view this ticket' using errcode = '42501'; end if;
  select to_jsonb(t) -> c."Field" into cur from public.tickets t where t."TicketUUID" = c."TicketUUID";
  if cur is distinct from c."NewValue" then raise exception 'It was changed again since – undo the newer change first' using errcode = '22023'; end if;
  execute format('update public.tickets set %1$I = (jsonb_populate_record(null::public.tickets, jsonb_build_object(%1$L, $1))).%1$I where "TicketUUID" = $2', c."Field")
    using c."OldValue", c."TicketUUID";
end $$;
grant execute on function public.ticket_change_list(uuid), public.undo_ticket_change(uuid) to authenticated;

/* ---------- 3. "changed by someone else since you last looked" ---------- */
create table public.ticket_seen (
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  "SeenAt"     timestamptz not null default now(),
  primary key (user_id, "TicketUUID")
);
alter table public.ticket_seen enable row level security;
create policy own_seen on public.ticket_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_ticket("TicketUUID"));
grant select, insert, update, delete on public.ticket_seen to authenticated, service_role;
create function public.mark_ticket_seen(p_ticket uuid) returns void
language sql security invoker set search_path = public as $$
  insert into public.ticket_seen ("TicketUUID") values (p_ticket) on conflict (user_id, "TicketUUID") do update set "SeenAt" = now();
$$;
grant execute on function public.mark_ticket_seen(uuid) to authenticated;

/* ticket list: your access level, and whether someone else changed or commented since you last opened it */
create or replace view public.tickets_v with (security_invoker = true) as
  select t."TicketUUID", t.user_id, t."TicketNo", t."TicketId", t."Title", t."Description", t."Status", t."Priority",
    public.project_key(t.user_id, t."Project") as "Project", t."Area", t."Tech", t."TicketType", t."Environment", t."Assignee",
    t."Requester", t."Reference", t."DueDate", t."PlannedStart", t."EstimateHours", t."StatusChangedAt", t."ClosedAt", t."TimerStartedAt",
    t."CreatedBy", t."CreatedAt", t."LastChangedAt",
    coalesce(p."Name", t."Project") as "ProjectName",
    coalesce((select sum(w."Hours") from public.worklogs w where w."TicketUUID" = t."TicketUUID"), 0)::float8 as "LoggedHours",
    (t."Status" <> 'DONE' and t."DueDate" is not null and t."DueDate" < current_date) as "IsOverdue",
    case when t.user_id = auth.uid() then null else public.user_label(t.user_id) end as "SharedBy",
    case when t.user_id = auth.uid() then null when public.ticket_shared_with_me(t."TicketUUID") then 'ticket' else 'project' end as "SharedVia",
    case when t.user_id = auth.uid() then (select count(*) from public.ticket_shares s where s."TicketUUID" = t."TicketUUID")::int else 0 end as "Shares",
    public.ticket_access(t."TicketUUID") as "Access",
    (exists (select 1 from public.ticket_changes c where c."TicketUUID" = t."TicketUUID" and c.user_id is distinct from auth.uid()
               and c."ChangedAt" > coalesce(sn."SeenAt", '-infinity'))
     or exists (select 1 from public.notes n where n."TicketUUID" = t."TicketUUID" and n.user_id <> auth.uid()
               and n."CreatedAt" > coalesce(sn."SeenAt", '-infinity'))) as "ChangedByOthers"
  from public.tickets t
  left join public.projects p on p.user_id = t.user_id and p."Project" = t."Project"
  left join public.ticket_seen sn on sn.user_id = auth.uid() and sn."TicketUUID" = t."TicketUUID";
grant select on public.tickets_v to authenticated, service_role;
