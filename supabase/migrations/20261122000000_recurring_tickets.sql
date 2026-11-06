-- Recurring tickets: a rule made from one of your tickets ("Repeat" on the ticket page) creates a new ticket every
-- workday, week or month. The app runs run_recurring() when it opens: each due rule creates one ticket (also after a long
-- absence – no flood of missed ones) and moves on to its next date. Rules are private to their owner.

create table public.recurring_tickets (
  "RuleUUID"  uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "Title"     text not null check (length(btrim("Title")) between 1 and 200),
  -- the copied ticket fields: Description, Priority, Project, Area, Tech, TicketType, Environment, EstimateHours
  "Data"      jsonb not null default '{}'::jsonb check (jsonb_typeof("Data") = 'object' and length("Data"::text) <= 20000),
  "Every"     text not null check ("Every" in ('workday', 'week', 'month')),
  "NextRun"   date not null,
  "DueInDays" integer not null default 0 check ("DueInDays" between 0 and 90),
  "Active"    boolean not null default true,
  "CreatedAt" timestamptz not null default now()
);
create index recurring_tickets_user on public.recurring_tickets (user_id, "NextRun");
alter table public.recurring_tickets enable row level security;
create policy own_rules on public.recurring_tickets for all to authenticated
  using (user_id = auth.uid() and public.session_verified())
  with check (user_id = auth.uid() and public.session_verified());
create trigger recurring_tickets_keep_owner before update on public.recurring_tickets for each row execute function public.keep_user_id();
revoke all on public.recurring_tickets from anon, authenticated;
grant select, insert, update, delete on public.recurring_tickets to authenticated;
grant select, insert, update, delete on public.recurring_tickets to service_role;

/** the next date after `d` for a rule (workdays skip Saturday and Sunday) */
create function public.recurring_next(d date, every text) returns date
language sql immutable set search_path = public as $$
  select case every
    when 'week' then d + 7
    when 'month' then (d + interval '1 month')::date
    else d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end
  end;
$$;

/** Creates the tickets of your rules that are due on or before `p_today` (your local date); returns how many.
 *  Runs as you: the new tickets pass the same rules as any ticket you create. */
create function public.run_recurring(p_today date default current_date) returns integer
language plpgsql set search_path = public as $$
declare r public.recurring_tickets; made integer := 0; nxt date;
begin
  if not public.session_verified() then return 0; end if;
  if p_today not between current_date - 2 and current_date + 2 then raise exception 'Unexpected date' using errcode = '22023'; end if;
  for r in select * from public.recurring_tickets where user_id = auth.uid() and "Active" and "NextRun" <= p_today for update loop
    insert into public.tickets ("Title", "Description", "Status", "Priority", "Project", "Area", "Tech", "TicketType", "Environment", "EstimateHours", "DueDate")
    values (r."Title", coalesce(r."Data" ->> 'Description', ''), 'TODO', coalesce(r."Data" ->> 'Priority', '3'), coalesce(r."Data" ->> 'Project', 'GEN'),
            coalesce(r."Data" ->> 'Area', ''), coalesce(r."Data" ->> 'Tech', ''), coalesce(r."Data" ->> 'TicketType', ''), coalesce(r."Data" ->> 'Environment', 'DEV'),
            coalesce((r."Data" ->> 'EstimateHours')::numeric, 0), p_today + r."DueInDays");
    made := made + 1;
    nxt := r."NextRun";
    while nxt <= p_today loop nxt := public.recurring_next(nxt, r."Every"); end loop;
    update public.recurring_tickets set "NextRun" = nxt where "RuleUUID" = r."RuleUUID";
  end loop;
  return made;
end $$;
revoke all on function public.run_recurring(date), public.recurring_next(date, text) from public, anon;
grant execute on function public.run_recurring(date), public.recurring_next(date, text) to authenticated;
