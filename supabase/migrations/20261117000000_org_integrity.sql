-- Organization ownership and sharing integrity.
--  1. Every share records how it came about: 'org' = applied at once because both people were in one organization,
--     'direct' = shared with someone outside (accepted invitation) or before organizations existed.
--  2. When someone leaves or is removed from an organization, the 'org' shares between them and the remaining members
--     are removed (both directions) – they only existed because of the membership. 'direct' shares stay.
--  3. Role changes and removals lock the organization row, so two admins acting at once cannot leave it without one.
--  4. Deleting an account hands the organization over (the longest-standing member becomes admin) instead of leaving
--     it without an admin; an organization nobody is left in is removed.

/* ---------- 1. how a share came about ---------- */
alter table public.project_shares add column "Via" text not null default 'direct' check ("Via" in ('org', 'direct'));
alter table public.ticket_shares  add column "Via" text not null default 'direct' check ("Via" in ('org', 'direct'));

create function public.share_via() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new."Via" := case when new."Status" = 'active' and public.same_org(new.owner_id, new.member_id) then 'org' else 'direct' end;
  return new;
end $$;
create trigger project_shares_via before insert on public.project_shares for each row execute function public.share_via();
create trigger ticket_shares_via before insert on public.ticket_shares for each row execute function public.share_via();

-- existing shares: 'org' when both people were already members of the same organization when it was made
update public.project_shares s set "Via" = 'org'
  where s."Status" = 'active' and exists (select 1 from public.org_members a join public.org_members b on b."OrgUUID" = a."OrgUUID"
    where a.user_id = s.owner_id and b.user_id = s.member_id and s."CreatedAt" >= greatest(a."CreatedAt", b."CreatedAt"));
update public.ticket_shares s set "Via" = 'org'
  where s."Status" = 'active' and exists (select 1 from public.org_members a join public.org_members b on b."OrgUUID" = a."OrgUUID"
    where a.user_id = s.owner_id and b.user_id = s.member_id and s."CreatedAt" >= greatest(a."CreatedAt", b."CreatedAt"));

/* ---------- 2. leaving: remove the shares that only existed through the organization ---------- */
/** removes 'org' shares between p_user and the other members of p_org (both directions); returns how many */
create function public.drop_org_shares(p_org uuid, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  delete from public.project_shares s where s."Via" = 'org'
    and ((s.owner_id = p_user and s.member_id in (select user_id from public.org_members where "OrgUUID" = p_org and user_id <> p_user))
      or (s.member_id = p_user and s.owner_id in (select user_id from public.org_members where "OrgUUID" = p_org and user_id <> p_user)));
  get diagnostics k = row_count; n := n + k;
  delete from public.ticket_shares s where s."Via" = 'org'
    and ((s.owner_id = p_user and s.member_id in (select user_id from public.org_members where "OrgUUID" = p_org and user_id <> p_user))
      or (s.member_id = p_user and s.owner_id in (select user_id from public.org_members where "OrgUUID" = p_org and user_id <> p_user)));
  get diagnostics k = row_count;
  return n + k;
end $$;
revoke all on function public.drop_org_shares(uuid, uuid) from public, anon, authenticated;

/* ---------- 3. role changes and removals, one at a time per organization ---------- */
create or replace function public.set_org_member(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid := public.my_org_id();
begin
  if org is null or not public.is_org_admin() then raise exception 'Only an admin can change roles' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  perform 1 from public.organizations where "OrgUUID" = org for update;          -- serialise with other role changes
  if not exists (select 1 from public.org_members where "OrgUUID" = org and user_id = p_user) then
    raise exception 'Not a member of your organization' using errcode = 'P0002'; end if;
  if p_role = 'member' and (select count(*) from public.org_members where "OrgUUID" = org and "Role" = 'admin' and user_id <> p_user) = 0 then
    raise exception 'The organization needs at least one admin' using errcode = '22023'; end if;
  update public.org_members set "Role" = p_role where "OrgUUID" = org and user_id = p_user;
end $$;

/** an admin removes someone, or anyone leaves (p_user = yourself); the last admin hands over first while others remain */
create or replace function public.remove_org_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid := public.my_org_id(); oname text; dropped int; left_count int;
begin
  if org is null then return; end if;
  if p_user <> auth.uid() and not public.is_org_admin() then raise exception 'Only an admin can remove members' using errcode = '42501'; end if;
  select "Name" into oname from public.organizations where "OrgUUID" = org for update;   -- serialise with role changes
  if not exists (select 1 from public.org_members where "OrgUUID" = org and user_id = p_user) then return; end if;
  if exists (select 1 from public.org_members where "OrgUUID" = org and user_id = p_user and "Role" = 'admin')
     and (select count(*) from public.org_members where "OrgUUID" = org and "Role" = 'admin') = 1
     and (select count(*) from public.org_members where "OrgUUID" = org) > 1 then
    raise exception 'Make someone else an admin first' using errcode = '22023'; end if;
  dropped := public.drop_org_shares(org, p_user);
  delete from public.org_members where "OrgUUID" = org and user_id = p_user;
  select count(*) into left_count from public.org_members where "OrgUUID" = org;
  if left_count = 0 then delete from public.organizations where "OrgUUID" = org; end if;   -- the last person leaving ends it
  if p_user <> auth.uid() then
    perform public.notify(p_user, 'org-removed', 'You were removed from ' || oname,
      case when dropped > 0 then dropped || ' item(s) shared inside the organization are no longer shared with you or by you.' else '' end, '');
  elsif dropped > 0 then
    perform public.notify(p_user, 'org-left', 'You left ' || oname, dropped || ' item(s) shared inside the organization were unshared. Items shared directly stay.', '');
  end if;
end $$;

/* ---------- 4. deleting an account: hand the organization over ---------- */
/** before an account's rows go: promote the longest-standing member when the account was the only admin; remove the
 *  organization if nobody is left; drop its organization-only shares */
create function public.org_handover(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid; oname text; heir uuid;
begin
  select "OrgUUID" into org from public.org_members where user_id = p_user;
  if org is null then return; end if;
  select "Name" into oname from public.organizations where "OrgUUID" = org for update;
  if exists (select 1 from public.org_members where "OrgUUID" = org and user_id = p_user and "Role" = 'admin')
     and not exists (select 1 from public.org_members where "OrgUUID" = org and user_id <> p_user and "Role" = 'admin') then
    select user_id into heir from public.org_members where "OrgUUID" = org and user_id <> p_user order by "CreatedAt", user_id limit 1;
    if heir is not null then
      update public.org_members set "Role" = 'admin' where "OrgUUID" = org and user_id = heir;
      perform public.notify(heir, 'org-admin', 'You are now an admin of ' || oname, 'The previous admin deleted their account.', 'account');
    end if;
  end if;
  perform public.drop_org_shares(org, p_user);
  delete from public.org_members where "OrgUUID" = org and user_id = p_user;
  if not exists (select 1 from public.org_members where "OrgUUID" = org) then delete from public.organizations where "OrgUUID" = org; end if;
end $$;
revoke all on function public.org_handover(uuid) from public, anon, authenticated;

create or replace function public.delete_user_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- the organization first: it must not be left without an admin
  perform public.org_handover(p_user);
  -- tickets next: their child rows (worklogs, notes, links …) go with them in one cascade
  delete from public.tickets where user_id = p_user;
  -- then every other table that belongs to the user, including projects shared with them
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name in ('user_id', 'owner_id', 'member_id')
    order by c.table_name = 'projects', c.table_name   -- projects last: shares and other rows point at them
  loop
    execute format('delete from public.%I where %I = $1', r.table_name, r.column_name) using p_user;
  end loop;
end $$;
revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
