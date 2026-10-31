-- Timeline planning: a planned start per ticket and finish-to-start dependencies between tickets
-- (A must be done before B starts). Dependencies are visible to whoever can see both tickets (own or shared project).

alter table public.tickets add column "PlannedStart" date;

create table public.ticket_links (
  "LinkUUID"   uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  "FromTicket" uuid not null references public.tickets on delete cascade,     -- must finish first
  "ToTicket"   uuid not null references public.tickets on delete cascade,     -- starts after
  "Kind"       text not null default 'FS' check ("Kind" in ('FS')),
  "CreatedAt"  timestamptz not null default now(),
  check ("FromTicket" <> "ToTicket"),
  unique ("FromTicket", "ToTicket")
);
alter table public.ticket_links enable row level security;
grant select, insert, delete on public.ticket_links to authenticated;
create policy links_read on public.ticket_links for select to authenticated
  using (public.session_verified() and public.can_see_ticket("FromTicket") and public.can_see_ticket("ToTicket"));
create policy links_add on public.ticket_links for insert to authenticated
  with check (public.session_verified() and user_id = auth.uid() and public.can_see_ticket("FromTicket") and public.can_see_ticket("ToTicket"));
create policy links_delete on public.ticket_links for delete to authenticated
  using (public.session_verified() and public.can_see_ticket("FromTicket") and public.can_see_ticket("ToTicket"));

-- the list view gains the new column (same definition as in 20261104000000_shared_projects.sql plus "PlannedStart")
drop view public.tickets_v;
create view public.tickets_v with (security_invoker = true) as
  select t."TicketUUID", t.user_id, t."TicketNo", t."TicketId", t."Title", t."Description", t."Status", t."Priority",
    public.project_key(t.user_id, t."Project") as "Project", t."Area", t."Tech", t."TicketType", t."Environment", t."Assignee",
    t."Requester", t."Reference", t."DueDate", t."PlannedStart", t."EstimateHours", t."StatusChangedAt", t."ClosedAt", t."TimerStartedAt",
    t."CreatedBy", t."CreatedAt", t."LastChangedAt",
    coalesce(p."Name", t."Project") as "ProjectName",
    coalesce((select sum(w."Hours") from public.worklogs w where w."TicketUUID" = t."TicketUUID"), 0)::float8 as "LoggedHours",
    (t."Status" <> 'DONE' and t."DueDate" is not null and t."DueDate" < current_date) as "IsOverdue"
  from public.tickets t
  left join public.projects p on p.user_id = t.user_id and p."Project" = t."Project";
grant select on public.tickets_v to authenticated, service_role;
