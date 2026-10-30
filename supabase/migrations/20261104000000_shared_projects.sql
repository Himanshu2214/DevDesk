-- Teams: share a project with other SLATE·SPACE accounts. Members see and edit the project's tickets with everything
-- below them (time, notes, tests, checklist, files, object links, history) and transports linked to those tickets;
-- they can create tickets in it. Only the owner deletes tickets and manages members; members can leave.
-- Everything else stays private. Existing rows are not changed.
--
-- Project codes are per user (everyone has "GEN"), so a member sees a shared project as "<code>@<first 8 characters of
-- the owner's id>"; the views translate on the way out and a trigger on the way in.

create table public.project_shares (
  owner_id    uuid not null default auth.uid(),
  "Project"   text not null,
  member_id   uuid not null references auth.users on delete cascade,
  "CreatedAt" timestamptz not null default now(),
  primary key (owner_id, "Project", member_id),
  foreign key (owner_id, "Project") references public.projects (user_id, "Project") on delete cascade on update cascade,
  check (owner_id <> member_id)
);
create index on public.project_shares (member_id);
alter table public.project_shares enable row level security;
grant select, delete on public.project_shares to authenticated;          -- adding goes through share_project()
create policy shares_read on public.project_shares for select to authenticated
  using (public.session_verified() and (owner_id = auth.uid() or member_id = auth.uid()));
create policy shares_remove on public.project_shares for delete to authenticated       -- owner removes, member leaves
  using (public.session_verified() and (owner_id = auth.uid() or member_id = auth.uid()));

/* ---------- access helpers (security definer: they read the share list without its own row level security) ---------- */
create function public.shared_with_me(p_owner uuid, p_project text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_shares s where s.owner_id = p_owner and s."Project" = p_project and s.member_id = auth.uid());
$$;
create function public.can_see_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets t where t."TicketUUID" = p_ticket
                 and (t.user_id = auth.uid() or public.shared_with_me(t.user_id, t."Project")));
$$;
create function public.can_see_transport(p_transport uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.transports x where x."TransportUUID" = p_transport
                 and (x.user_id = auth.uid() or (x."TicketUUID" is not null and public.can_see_ticket(x."TicketUUID"))));
$$;
/** the project code as the current user sees it */
create function public.project_key(p_owner uuid, p_project text) returns text
language sql stable set search_path = public as $$
  select case when p_owner = auth.uid() then p_project else p_project || '@' || left(p_owner::text, 8) end;
$$;
/** display name of someone you share a project with (or yourself) – nobody else */
create function public.user_label(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) from auth.users u
  where u.id = p_user and (p_user = auth.uid() or exists (select 1 from public.project_shares s
    where (s.owner_id = auth.uid() and s.member_id = p_user) or (s.member_id = auth.uid() and s.owner_id = p_user)));
$$;
grant execute on function public.shared_with_me(uuid, text), public.can_see_ticket(uuid), public.can_see_transport(uuid),
  public.project_key(uuid, text), public.user_label(uuid) to authenticated;

/* ---------- sharing ---------- */
create function public.share_project(p_project text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.projects where user_id = auth.uid() and "Project" = p_project) then
    raise exception 'Only your own projects can be shared' using errcode = '42501';
  end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  insert into public.project_shares (owner_id, "Project", member_id) values (auth.uid(), p_project, m) on conflict do nothing;
  return public.user_label(m);
end $$;
/** members of one of your projects, with their email (the owner typed it in) */
create function public.project_members(p_project text) returns table (member_id uuid, email text, name text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt"
  from public.project_shares s join auth.users u on u.id = s.member_id
  where s.owner_id = auth.uid() and s."Project" = p_project and public.session_verified()
  order by s."CreatedAt";
$$;
revoke all on function public.share_project(text, text), public.project_members(text) from public, anon;
grant execute on function public.share_project(text, text), public.project_members(text) to authenticated;

/* ---------- tickets: shared project codes in, owner kept ---------- */
create function public.resolve_ticket_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare code text; owner uuid;
begin
  if auth.uid() is null then return new; end if;                              -- service role / maintenance
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'The owner of a ticket cannot be changed' using errcode = '42501'; end if;
    if new."Project" is not distinct from old."Project" then return new; end if;
  end if;
  if position('@' in new."Project") > 0 then
    code := split_part(new."Project", '@', 1);
    select s.owner_id into owner from public.project_shares s
    where s."Project" = code and left(s.owner_id::text, 8) = split_part(new."Project", '@', 2) and s.member_id = auth.uid();
    if owner is null then raise exception 'You no longer have access to this shared project' using errcode = '42501'; end if;
    new."Project" := code;
  else
    owner := auth.uid();
  end if;
  if tg_op = 'INSERT' then new.user_id := owner;
  elsif owner <> old.user_id then raise exception 'Tickets cannot move between your own and shared projects' using errcode = '22023';
  end if;
  return new;
end $$;
-- runs before the numbering trigger (tickets_no), so a member's new ticket gets the owner's next number
create trigger tickets_0_share before insert or update on public.tickets for each row execute function public.resolve_ticket_project();

-- children keep their author: nobody can hand a row to someone else
create function public.keep_user_id() returns trigger language plpgsql as $$
begin new.user_id := old.user_id; return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['acceptance','test_cases','checklist_items','worklogs','notes','ticket_events','attachments','object_links','transports','transport_deps'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.keep_user_id()', t || '_keep_owner', t);
  end loop;
end $$;

/* ---------- row level security: own rows, or rows of a project shared with you ---------- */
drop policy own_rows on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project")));
create policy tickets_add on public.tickets for insert to authenticated
  with check (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project")));
create policy tickets_change on public.tickets for update to authenticated
  using (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project")))
  with check (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project")));
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.session_verified() and user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['acceptance','test_cases','checklist_items','worklogs','notes','ticket_events','attachments','object_links'] loop
    execute format('drop policy own_rows on public.%I', t);
    execute format($p$create policy ticket_rows_read on public.%I for select to authenticated
      using (public.session_verified() and (user_id = auth.uid() or public.can_see_ticket("TicketUUID")))$p$, t);
    execute format($p$create policy ticket_rows_add on public.%I for insert to authenticated
      with check (public.session_verified() and user_id = auth.uid() and public.can_see_ticket("TicketUUID"))$p$, t);
    execute format($p$create policy ticket_rows_change on public.%I for update to authenticated
      using (public.session_verified() and public.can_see_ticket("TicketUUID"))
      with check (public.session_verified() and public.can_see_ticket("TicketUUID"))$p$, t);
    execute format($p$create policy ticket_rows_delete on public.%I for delete to authenticated
      using (public.session_verified() and public.can_see_ticket("TicketUUID"))$p$, t);
  end loop;
end $$;

-- transports: your own, plus those linked to a ticket you can see; only the creator deletes one
drop policy own_rows on public.transports;
create policy transports_read on public.transports for select to authenticated
  using (public.session_verified() and (user_id = auth.uid() or ("TicketUUID" is not null and public.can_see_ticket("TicketUUID"))));
create policy transports_add on public.transports for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and ("TicketUUID" is null or public.can_see_ticket("TicketUUID")));
create policy transports_change on public.transports for update to authenticated
  using (public.session_verified() and (user_id = auth.uid() or ("TicketUUID" is not null and public.can_see_ticket("TicketUUID"))))
  with check (public.session_verified() and (user_id = auth.uid() or "TicketUUID" is not null and public.can_see_ticket("TicketUUID"))
              and ("TicketUUID" is null or public.can_see_ticket("TicketUUID")));
create policy transports_delete on public.transports for delete to authenticated
  using (public.session_verified() and user_id = auth.uid());
drop policy own_rows on public.transport_deps;
create policy transport_deps_read on public.transport_deps for select to authenticated
  using (public.session_verified() and public.can_see_transport("TransportUUID"));
create policy transport_deps_add on public.transport_deps for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and public.can_see_transport("TransportUUID"));
create policy transport_deps_delete on public.transport_deps for delete to authenticated
  using (public.session_verified() and public.can_see_transport("TransportUUID"));

-- projects: members can read the shared project (name, colour)
create policy shared_projects_read on public.projects for select to authenticated
  using (public.session_verified() and public.shared_with_me(user_id, "Project"));

/* ---------- views with the project code as the reader sees it ---------- */
drop view public.tickets_v;
create view public.tickets_v with (security_invoker = true) as
  select t."TicketUUID", t.user_id, t."TicketNo", t."TicketId", t."Title", t."Description", t."Status", t."Priority",
    public.project_key(t.user_id, t."Project") as "Project", t."Area", t."Tech", t."TicketType", t."Environment", t."Assignee",
    t."Requester", t."Reference", t."DueDate", t."EstimateHours", t."StatusChangedAt", t."ClosedAt", t."TimerStartedAt",
    t."CreatedBy", t."CreatedAt", t."LastChangedAt",
    coalesce(p."Name", t."Project") as "ProjectName",
    coalesce((select sum(w."Hours") from public.worklogs w where w."TicketUUID" = t."TicketUUID"), 0)::float8 as "LoggedHours",
    (t."Status" <> 'DONE' and t."DueDate" is not null and t."DueDate" < current_date) as "IsOverdue"
  from public.tickets t
  left join public.projects p on p.user_id = t.user_id and p."Project" = t."Project";
grant select on public.tickets_v to authenticated, service_role;

create view public.projects_v with (security_invoker = true) as
  select public.project_key(p.user_id, p."Project") as "Project", p."Name", p."Color", p."SortOrder", p."IsActive",
    case when p.user_id = auth.uid() then null else public.user_label(p.user_id) end as "SharedBy",
    case when p.user_id = auth.uid() then (select count(*) from public.project_shares s where s.owner_id = p.user_id and s."Project" = p."Project")::int else 0 end as "Members"
  from public.projects p;
grant select on public.projects_v to authenticated;

/* ---------- attachment files: readable (and removable) by everyone who can see the attachment row ---------- */
create policy attachments_shared_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.session_verified() and exists (select 1 from public.attachments a
    where a."AttUUID"::text = split_part(name, '/', 2) and a.user_id::text = split_part(name, '/', 1)));
create policy attachments_shared_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.session_verified() and exists (select 1 from public.attachments a
    where a."AttUUID"::text = split_part(name, '/', 2) and a.user_id::text = split_part(name, '/', 1)));

/** a member leaves a shared project, given the code they see ("GST@1a2b3c4d") */
create function public.leave_project(p_key text) returns void
language sql set search_path = public as $$
  delete from public.project_shares
  where member_id = auth.uid() and "Project" = split_part(p_key, '@', 1) and left(owner_id::text, 8) = split_part(p_key, '@', 2);
$$;
grant execute on function public.leave_project(text) to authenticated;
