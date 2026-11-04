-- Hardening:
--  1. An organization that has members always has at least one admin – checked by the database itself when a
--     transaction commits (deferred constraint trigger), whatever code made the change. This backs up the row lock in
--     set_org_member / remove_org_member: if two admins demote each other at the same moment, the second commit fails
--     instead of leaving the organization without an admin.
--  2. Errors from before sign-in (the sign-in screen itself) can be logged too: anonymous entries are capped at 100 an
--     hour in total, so visitors cannot fill the table; signed-in users keep their own 30 an hour.

/* ---------- 1. every organization keeps an admin ---------- */
create function public.check_org_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare org uuid := coalesce(new."OrgUUID", old."OrgUUID");
begin
  if exists (select 1 from public.org_members where "OrgUUID" = org)
     and not exists (select 1 from public.org_members where "OrgUUID" = org and "Role" = 'admin') then
    raise exception 'An organization needs at least one admin – make someone else an admin first' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger org_members_keep_admin after update or delete on public.org_members
  deferrable initially deferred for each row execute function public.check_org_admin();

/* ---------- 2. errors from before sign-in ---------- */
create or replace function public.log_client_error(p_message text, p_stack text, p_where text, p_route text, p_agent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if (select count(*) from public.client_errors where user_id is null and "CreatedAt" > now() - interval '1 hour') >= 100 then return; end if;
  elsif (select count(*) from public.client_errors where user_id = auth.uid() and "CreatedAt" > now() - interval '1 hour') >= 30 then return;
  end if;
  insert into public.client_errors (user_id, "Message", "Stack", "Where", "Route", "Agent")
  values (auth.uid(), left(coalesce(p_message, ''), 500), left(coalesce(p_stack, ''), 2000), left(coalesce(p_where, ''), 60),
          left(coalesce(p_route, ''), 120), left(coalesce(p_agent, ''), 200));
  delete from public.client_errors where "CreatedAt" < now() - interval '30 days';
end $$;
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;
