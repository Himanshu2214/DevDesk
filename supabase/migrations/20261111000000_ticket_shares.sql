-- Share a single ticket with another SLATE·SPACE account. The person sees and edits that ticket with everything below
-- it (time, notes, tests, checklist, files, object links, history, linked transports) – the same rights a project
-- member has on it – and nothing else of yours. Only the owner deletes the ticket or moves it to another project, and
-- manages who it is shared with; the other person can remove it from their list.

create table public.ticket_shares (
  "TicketUUID" uuid not null references public.tickets on delete cascade,
  owner_id     uuid not null default auth.uid(),
  member_id    uuid not null references auth.users on delete cascade,
  "CreatedAt"  timestamptz not null default now(),
  primary key ("TicketUUID", member_id),
  check (owner_id <> member_id)
);
create index on public.ticket_shares (member_id);
alter table public.ticket_shares enable row level security;
grant select, delete on public.ticket_shares to authenticated;           -- adding goes through share_ticket()
grant select, insert, update, delete on public.ticket_shares to service_role;
create policy ticket_shares_read on public.ticket_shares for select to authenticated
  using (public.session_verified() and (owner_id = auth.uid() or member_id = auth.uid()));
create policy ticket_shares_remove on public.ticket_shares for delete to authenticated   -- owner removes, member leaves
  using (public.session_verified() and (owner_id = auth.uid() or member_id = auth.uid()));

/* ---------- access: a ticket shared with you counts like one in a project shared with you ---------- */
create function public.ticket_shared_with_me(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ticket_shares s where s."TicketUUID" = p_ticket and s.member_id = auth.uid());
$$;
create or replace function public.can_see_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets t where t."TicketUUID" = p_ticket
                 and (t.user_id = auth.uid() or public.shared_with_me(t.user_id, t."Project") or public.ticket_shared_with_me(t."TicketUUID")));
$$;
/** names of people you share a project or a ticket with (or yourself) – nobody else */
create or replace function public.user_label(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) from auth.users u
  where u.id = p_user and (p_user = auth.uid()
    or exists (select 1 from public.project_shares s
      where (s.owner_id = auth.uid() and s.member_id = p_user) or (s.member_id = auth.uid() and s.owner_id = p_user))
    or exists (select 1 from public.ticket_shares s
      where (s.owner_id = auth.uid() and s.member_id = p_user) or (s.member_id = auth.uid() and s.owner_id = p_user)));
$$;
grant execute on function public.ticket_shared_with_me(uuid) to authenticated;

drop policy tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project") or public.ticket_shared_with_me("TicketUUID")));
drop policy tickets_change on public.tickets;
create policy tickets_change on public.tickets for update to authenticated
  using (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project") or public.ticket_shared_with_me("TicketUUID")))
  with check (public.session_verified() and (user_id = auth.uid() or public.shared_with_me(user_id, "Project") or public.ticket_shared_with_me("TicketUUID")));

/* ---------- sharing ---------- */
create function public.share_ticket(p_ticket uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.tickets where "TicketUUID" = p_ticket and user_id = auth.uid()) then
    raise exception 'Only your own tickets can be shared' using errcode = '42501';
  end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  insert into public.ticket_shares ("TicketUUID", owner_id, member_id) values (p_ticket, auth.uid(), m) on conflict do nothing;
  -- marks the ticket as changed, so the other person's app (which polls for changes) picks it up without a reload
  update public.tickets set "LastChangedAt" = now() where "TicketUUID" = p_ticket;
  return public.user_label(m);
end $$;
/** who one of your tickets is shared with, with their email (the owner typed it in) */
create function public.ticket_members(p_ticket uuid) returns table (member_id uuid, email text, name text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt"
  from public.ticket_shares s join auth.users u on u.id = s.member_id
  where s."TicketUUID" = p_ticket and s.owner_id = auth.uid() and public.session_verified()
  order by s."CreatedAt";
$$;
revoke all on function public.share_ticket(uuid, text), public.ticket_members(uuid) from public, anon;
grant execute on function public.share_ticket(uuid, text), public.ticket_members(uuid) to authenticated;

/* ---------- the ticket list tells who shared a ticket with you, and how many people you shared yours with ---------- */
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
    case when t.user_id = auth.uid() then (select count(*) from public.ticket_shares s where s."TicketUUID" = t."TicketUUID")::int else 0 end as "Shares"
  from public.tickets t
  left join public.projects p on p.user_id = t.user_id and p."Project" = t."Project";
grant select on public.tickets_v to authenticated, service_role;
