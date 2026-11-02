-- Organizations, share invitations and notifications.
--
-- Organizations: a team (one per account). An admin invites people by email; they join when they accept. Inside an
-- organization sharing applies at once and the share dialogs suggest every member. An admin can switch on "only share
-- inside the organization", which blocks shares to anyone outside it.
--
-- Invitations: a share with someone outside your organization starts as 'pending' – it gives no access until they
-- accept (Inbox → Accept / Decline). Existing shares stay active.
--
-- Notifications: "shared with you", invitations answered, organization invitations – shown in the Inbox.

/* ---------- organizations ---------- */
create table public.organizations (
  "OrgUUID"      uuid primary key default gen_random_uuid(),
  "Name"         text not null check (length(trim("Name")) between 1 and 80),
  "OnlyInternal" boolean not null default false,
  created_by     uuid references auth.users on delete set null default auth.uid(),
  "CreatedAt"    timestamptz not null default now()
);
create table public.org_members (
  "OrgUUID"   uuid not null references public.organizations on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  "Role"      text not null default 'member' check ("Role" in ('admin', 'member')),
  "CreatedAt" timestamptz not null default now(),
  primary key ("OrgUUID", user_id),
  unique (user_id)                                                     -- one organization per account
);
create table public.org_invites (
  "OrgUUID"   uuid not null references public.organizations on delete cascade,
  email       text not null check (email = lower(trim(email))),
  "Role"      text not null default 'member' check ("Role" in ('admin', 'member')),
  invited_by  uuid references auth.users on delete set null default auth.uid(),
  "CreatedAt" timestamptz not null default now(),
  primary key ("OrgUUID", email)
);
-- only the functions below touch these tables (row level security on, no policies)
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
grant select, insert, update, delete on public.organizations, public.org_members, public.org_invites to service_role;

create function public.my_org_id() returns uuid
language sql stable security definer set search_path = public as $$ select "OrgUUID" from public.org_members where user_id = auth.uid() $$;
/** whether two accounts are in the same organization */
create function public.same_org(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members x join public.org_members y on y."OrgUUID" = x."OrgUUID" where x.user_id = a and y.user_id = b);
$$;
create function public.is_org_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where user_id = auth.uid() and "Role" = 'admin');
$$;
grant execute on function public.my_org_id(), public.same_org(uuid, uuid), public.is_org_admin() to authenticated;

/* ---------- notifications ---------- */
create table public.notifications (
  "NotifUUID" uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,     -- who it is for
  "Kind"      text not null,                                             -- shared, invited, accepted, declined, org-invite, org-joined
  "Title"     text not null,
  "Body"      text not null default '',
  "Link"      text not null default '',                                  -- app route, e.g. ticket/TK-1025
  "CreatedAt" timestamptz not null default now(),
  "ReadAt"    timestamptz
);
create index on public.notifications (user_id, "CreatedAt" desc);
alter table public.notifications enable row level security;
create policy own_notifications on public.notifications for select to authenticated using (user_id = auth.uid() and public.session_verified());
create policy read_notifications on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy remove_notifications on public.notifications for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.notifications to authenticated;
grant update ("ReadAt") on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
create function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, "Kind", "Title", "Body", "Link") values (p_user, p_kind, p_title, p_body, p_link);
$$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

/* ---------- share status: pending invitations give no access ---------- */
alter table public.project_shares add column "Status" text not null default 'active' check ("Status" in ('active', 'pending'));
alter table public.ticket_shares  add column "Status" text not null default 'active' check ("Status" in ('active', 'pending'));

create or replace function public.shared_with_me(p_owner uuid, p_project text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_shares s where s.owner_id = p_owner and s."Project" = p_project and s.member_id = auth.uid() and s."Status" = 'active');
$$;
create or replace function public.ticket_shared_with_me(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ticket_shares s where s."TicketUUID" = p_ticket and s.member_id = auth.uid() and s."Status" = 'active');
$$;
create or replace function public.ticket_access(p_ticket uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when t.user_id = auth.uid() then 'owner'
    else (select a from unnest(array[
            (select s."Access" from public.project_shares s where s.owner_id = t.user_id and s."Project" = t."Project" and s.member_id = auth.uid() and s."Status" = 'active'),
            (select s."Access" from public.ticket_shares s where s."TicketUUID" = t."TicketUUID" and s.member_id = auth.uid() and s."Status" = 'active')]) a
          where a is not null order by array_position(array['edit', 'comment', 'view'], a) limit 1)
  end
  from public.tickets t where t."TicketUUID" = p_ticket;
$$;
create or replace function public.can_add_to_project(p_owner uuid, p_project text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or exists (select 1 from public.project_shares s
    where s.owner_id = p_owner and s."Project" = p_project and s.member_id = auth.uid() and s."Access" = 'edit' and s."Status" = 'active');
$$;
-- a member's new ticket in a shared project: only through an accepted share
create or replace function public.resolve_ticket_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare code text; owner uuid;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'The owner of a ticket cannot be changed' using errcode = '42501'; end if;
    if new."Project" is not distinct from old."Project" then return new; end if;
  end if;
  if position('@' in new."Project") > 0 then
    code := split_part(new."Project", '@', 1);
    select s.owner_id into owner from public.project_shares s
    where s."Project" = code and left(s.owner_id::text, 8) = split_part(new."Project", '@', 2) and s.member_id = auth.uid() and s."Status" = 'active';
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

/** names: yourself, people you share with (also pending: an invitation shows who sent it) and your organization */
create or replace function public.user_label(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) from auth.users u
  where u.id = p_user and (p_user = auth.uid() or public.same_org(auth.uid(), p_user)
    or exists (select 1 from public.project_shares s
      where (s.owner_id = auth.uid() and s.member_id = p_user) or (s.member_id = auth.uid() and s.owner_id = p_user))
    or exists (select 1 from public.ticket_shares s
      where (s.owner_id = auth.uid() and s.member_id = p_user) or (s.member_id = auth.uid() and s.owner_id = p_user)));
$$;
/** suggestions in the share dialogs: your organization and the people you already share with */
create or replace function public.share_contacts() returns table (email text, name text)
language sql stable security definer set search_path = public as $$
  select u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u
  where public.session_verified() and u.id <> auth.uid() and (public.same_org(auth.uid(), u.id) or u.id in (
    select member_id from public.project_shares where owner_id = auth.uid()
    union select owner_id from public.project_shares where member_id = auth.uid() and "Status" = 'active'
    union select member_id from public.ticket_shares where owner_id = auth.uid()
    union select owner_id from public.ticket_shares where member_id = auth.uid() and "Status" = 'active'))
  order by 2, 1;
$$;
-- avatar group on a shared project: accepted members only
create or replace function public.project_people(p_key text) returns table (user_id uuid, name text, email text, is_owner boolean, photo text)
language plpgsql stable security definer set search_path = public as $$
declare code text := split_part(p_key, '@', 1); owner uuid;
begin
  if not public.session_verified() then return; end if;
  if position('@' in p_key) = 0 then owner := auth.uid();
  else
    select s.owner_id into owner from public.project_shares s
    where s."Project" = code and left(s.owner_id::text, 8) = split_part(p_key, '@', 2) and s.member_id = auth.uid() and s."Status" = 'active';
    if owner is null then return; end if;
  end if;
  if not exists (select 1 from public.project_shares where owner_id = owner and "Project" = code and "Status" = 'active') then return; end if;
  return query
    select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email), u.email, u.id = owner,
           coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '')
    from auth.users u
    where u.id = owner or u.id in (select member_id from public.project_shares where owner_id = owner and "Project" = code and "Status" = 'active')
    order by u.id <> owner, 2;
end $$;

/** may the caller share with this account – and does it start as an invitation? */
create function public.share_mode(p_member uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare org public.organizations;
begin
  if public.same_org(auth.uid(), p_member) then return 'active'; end if;
  select o.* into org from public.organizations o join public.org_members m on m."OrgUUID" = o."OrgUUID" where m.user_id = auth.uid();
  if found and org."OnlyInternal" then
    raise exception 'Sharing outside % is switched off by its admin', org."Name" using errcode = '42501';
  end if;
  return 'pending';
end $$;

drop function public.share_project(text, text, text);
create function public.share_project(p_project text, p_email text, p_access text default 'edit') returns text
language plpgsql security definer set search_path = public as $$
declare m uuid; st text; existing text; pname text; me text;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if p_access not in ('view', 'comment', 'edit') then raise exception 'Unknown access level' using errcode = '22023'; end if;
  select "Name" into pname from public.projects where user_id = auth.uid() and "Project" = p_project;
  if pname is null then raise exception 'Only your own projects can be shared' using errcode = '42501'; end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  select "Status" into existing from public.project_shares where owner_id = auth.uid() and "Project" = p_project and member_id = m;
  st := coalesce(existing, public.share_mode(m));
  insert into public.project_shares (owner_id, "Project", member_id, "Access", "Status") values (auth.uid(), p_project, m, p_access, st)
    on conflict (owner_id, "Project", member_id) do update set "Access" = excluded."Access";
  if existing is null then
    me := public.user_label(auth.uid());
    perform public.notify(m, case st when 'active' then 'shared' else 'invited' end,
      case st when 'active' then me || ' shared the project ' || pname || ' with you' else me || ' invites you to the project ' || pname end,
      case st when 'active' then 'You can open it from the sidebar.' else 'From outside your organization – accept to see it, or decline.' end,
      case st when 'active' then 'list/active' else 'inbox' end);
  end if;
  return st;
end $$;

drop function public.share_ticket(uuid, text, text);
create function public.share_ticket(p_ticket uuid, p_email text, p_access text default 'edit') returns text
language plpgsql security definer set search_path = public as $$
declare m uuid; st text; existing text; tk record; me text;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if p_access not in ('view', 'comment', 'edit') then raise exception 'Unknown access level' using errcode = '22023'; end if;
  select "TicketId", "Title" into tk from public.tickets where "TicketUUID" = p_ticket and user_id = auth.uid();
  if not found then raise exception 'Only your own tickets can be shared' using errcode = '42501'; end if;
  select id into m from auth.users where lower(email) = lower(trim(p_email));
  if m is null then raise exception 'No SLATE·SPACE account uses this email. Ask them to sign up first.' using errcode = 'P0002'; end if;
  if m = auth.uid() then raise exception 'That is your own account' using errcode = '22023'; end if;
  select "Status" into existing from public.ticket_shares where "TicketUUID" = p_ticket and member_id = m;
  st := coalesce(existing, public.share_mode(m));
  insert into public.ticket_shares ("TicketUUID", owner_id, member_id, "Access", "Status") values (p_ticket, auth.uid(), m, p_access, st)
    on conflict ("TicketUUID", member_id) do update set "Access" = excluded."Access";
  update public.tickets set "LastChangedAt" = now() where "TicketUUID" = p_ticket;
  if existing is null then
    me := public.user_label(auth.uid());
    perform public.notify(m, case st when 'active' then 'shared' else 'invited' end,
      case st when 'active' then me || ' shared ' || tk."TicketId" || ' with you' else me || ' wants to share ' || tk."TicketId" || ' with you' end,
      case st when 'active' then tk."Title" else tk."Title" || ' – from outside your organization: accept to see it, or decline.' end,
      case st when 'active' then 'ticket/' || tk."TicketId" else 'inbox' end);
  end if;
  return st;
end $$;

drop function public.project_members(text);
create function public.project_members(p_project text) returns table (member_id uuid, email text, name text, since timestamptz, access text, status text)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt", s."Access", s."Status"
  from public.project_shares s join auth.users u on u.id = s.member_id
  where s.owner_id = auth.uid() and s."Project" = p_project and public.session_verified()
  order by s."CreatedAt";
$$;
drop function public.ticket_members(uuid);
create function public.ticket_members(p_ticket uuid) returns table (member_id uuid, email text, name text, since timestamptz, access text, status text)
language sql stable security definer set search_path = public as $$
  select s.member_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."CreatedAt", s."Access", s."Status"
  from public.ticket_shares s join auth.users u on u.id = s.member_id
  where s."TicketUUID" = p_ticket and s.owner_id = auth.uid() and public.session_verified()
  order by s."CreatedAt";
$$;
revoke all on function public.share_project(text, text, text), public.project_members(text),
  public.share_ticket(uuid, text, text), public.ticket_members(uuid) from public, anon;
grant execute on function public.share_project(text, text, text), public.project_members(text),
  public.share_ticket(uuid, text, text), public.ticket_members(uuid) to authenticated;

/* ---------- invitations waiting for you, and answering them ---------- */
create function public.my_invitations() returns table (kind text, ref text, title text, detail text, from_name text, access text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select 'ticket', s."TicketUUID"::text, t."TicketId" || ' ' || t."Title", '', public.user_label(s.owner_id), s."Access", s."CreatedAt"
    from public.ticket_shares s join public.tickets t on t."TicketUUID" = s."TicketUUID"
    where s.member_id = auth.uid() and s."Status" = 'pending' and public.session_verified()
  union all
  select 'project', s.owner_id::text || '|' || s."Project", p."Name", '', public.user_label(s.owner_id), s."Access", s."CreatedAt"
    from public.project_shares s join public.projects p on p.user_id = s.owner_id and p."Project" = s."Project"
    where s.member_id = auth.uid() and s."Status" = 'pending' and public.session_verified()
  union all
  select 'org', i."OrgUUID"::text, o."Name", i."Role", coalesce((select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) from auth.users u where u.id = i.invited_by), ''), i."Role", i."CreatedAt"
    from public.org_invites i join public.organizations o on o."OrgUUID" = i."OrgUUID"
    where i.email = lower((select email from auth.users where id = auth.uid())) and public.session_verified()
  order by 7 desc;
$$;
/** accept (true) or decline (false) an invitation from my_invitations() */
create function public.answer_invitation(p_kind text, p_ref text, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid; code text; label text; me text := public.user_label(auth.uid()); myemail text;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if p_kind = 'ticket' then
    select s.owner_id, t."TicketId" into owner, label from public.ticket_shares s join public.tickets t on t."TicketUUID" = s."TicketUUID"
      where s."TicketUUID" = p_ref::uuid and s.member_id = auth.uid() and s."Status" = 'pending';
    if owner is null then raise exception 'This invitation no longer exists' using errcode = 'P0002'; end if;
    if p_accept then update public.ticket_shares set "Status" = 'active' where "TicketUUID" = p_ref::uuid and member_id = auth.uid();
                      update public.tickets set "LastChangedAt" = now() where "TicketUUID" = p_ref::uuid;
    else delete from public.ticket_shares where "TicketUUID" = p_ref::uuid and member_id = auth.uid(); end if;
    perform public.notify(owner, case when p_accept then 'accepted' else 'declined' end,
      me || case when p_accept then ' accepted ' else ' declined ' end || label, '', case when p_accept then 'ticket/' || label else '' end);
  elsif p_kind = 'project' then
    owner := split_part(p_ref, '|', 1)::uuid; code := split_part(p_ref, '|', 2);
    select p."Name" into label from public.project_shares s join public.projects p on p.user_id = s.owner_id and p."Project" = s."Project"
      where s.owner_id = owner and s."Project" = code and s.member_id = auth.uid() and s."Status" = 'pending';
    if label is null then raise exception 'This invitation no longer exists' using errcode = 'P0002'; end if;
    if p_accept then update public.project_shares set "Status" = 'active' where owner_id = owner and "Project" = code and member_id = auth.uid();
    else delete from public.project_shares where owner_id = owner and "Project" = code and member_id = auth.uid(); end if;
    perform public.notify(owner, case when p_accept then 'accepted' else 'declined' end,
      me || case when p_accept then ' joined your project ' else ' declined your project ' end || label, '', '');
  elsif p_kind = 'org' then
    myemail := lower((select email from auth.users where id = auth.uid()));
    select o."Name", i.invited_by into label, owner from public.org_invites i join public.organizations o on o."OrgUUID" = i."OrgUUID"
      where i."OrgUUID" = p_ref::uuid and i.email = myemail;
    if label is null then raise exception 'This invitation no longer exists' using errcode = 'P0002'; end if;
    if p_accept then
      if public.my_org_id() is not null then raise exception 'You are already in an organization – leave it first' using errcode = '22023'; end if;
      insert into public.org_members ("OrgUUID", user_id, "Role")
        select "OrgUUID", auth.uid(), "Role" from public.org_invites where "OrgUUID" = p_ref::uuid and email = myemail;
    end if;
    delete from public.org_invites where "OrgUUID" = p_ref::uuid and email = myemail;
    if owner is not null then perform public.notify(owner, case when p_accept then 'org-joined' else 'declined' end,
      me || case when p_accept then ' joined ' else ' declined to join ' end || label, '', case when p_accept then 'account' else '' end); end if;
  else raise exception 'Unknown invitation' using errcode = '22023';
  end if;
end $$;
revoke all on function public.my_invitations(), public.answer_invitation(text, text, boolean) from public, anon;
grant execute on function public.my_invitations(), public.answer_invitation(text, text, boolean) to authenticated;

/* ---------- running an organization ---------- */
create function public.create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.session_verified() then raise exception 'Finish the 2-step sign-in first' using errcode = '42501'; end if;
  if public.my_org_id() is not null then raise exception 'You are already in an organization' using errcode = '22023'; end if;
  insert into public.organizations ("Name") values (trim(p_name)) returning "OrgUUID" into id;
  insert into public.org_members ("OrgUUID", user_id, "Role") values (id, auth.uid(), 'admin');
  return id;
end $$;
/** your organization with its members (and, for admins, the open invitations) */
create function public.my_org() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when o."OrgUUID" is null then null else jsonb_build_object(
    'id', o."OrgUUID", 'name', o."Name", 'onlyInternal', o."OnlyInternal", 'admin', public.is_org_admin(),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email,
                  'name', coalesce(u.raw_user_meta_data ->> 'full_name', ''), 'role', m."Role", 'since', m."CreatedAt", 'me', m.user_id = auth.uid())
                  order by m."Role", u.email), '[]') from public.org_members m join auth.users u on u.id = m.user_id where m."OrgUUID" = o."OrgUUID"),
    'invites', case when public.is_org_admin() then (select coalesce(jsonb_agg(jsonb_build_object('email', i.email, 'role', i."Role", 'since', i."CreatedAt")
                  order by i."CreatedAt"), '[]') from public.org_invites i where i."OrgUUID" = o."OrgUUID") else '[]'::jsonb end) end
  from (select public.my_org_id() as id) x left join public.organizations o on o."OrgUUID" = x.id
  where public.session_verified();
$$;
create function public.invite_to_org(p_email text, p_role text default 'member') returns text
language plpgsql security definer set search_path = public as $$
declare org uuid := public.my_org_id(); e text := lower(trim(p_email)); u uuid; oname text;
begin
  if not public.session_verified() or not public.is_org_admin() then raise exception 'Only an admin of the organization can invite' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email' using errcode = '22023'; end if;
  select id into u from auth.users where lower(email) = e;
  if u is not null and exists (select 1 from public.org_members where user_id = u and "OrgUUID" = org) then raise exception 'Already a member' using errcode = '22023'; end if;
  insert into public.org_invites ("OrgUUID", email, "Role") values (org, e, p_role) on conflict ("OrgUUID", email) do update set "Role" = excluded."Role";
  select "Name" into oname from public.organizations where "OrgUUID" = org;
  if u is not null then perform public.notify(u, 'org-invite', public.user_label(auth.uid()) || ' invites you to join ' || oname, 'Accept to share inside the organization.', 'inbox'); end if;
  return case when u is null then 'no-account' else 'invited' end;
end $$;
create function public.cancel_org_invite(p_email text) returns void
language sql security definer set search_path = public as $$
  delete from public.org_invites where "OrgUUID" = public.my_org_id() and email = lower(trim(p_email)) and public.is_org_admin();
$$;
create function public.set_org_member(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid := public.my_org_id();
begin
  if not public.is_org_admin() then raise exception 'Only an admin can change roles' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  if p_role = 'member' and (select count(*) from public.org_members where "OrgUUID" = org and "Role" = 'admin' and user_id <> p_user) = 0 then
    raise exception 'The organization needs at least one admin' using errcode = '22023'; end if;
  update public.org_members set "Role" = p_role where "OrgUUID" = org and user_id = p_user;
end $$;
/** an admin removes someone, or anyone leaves (p_user = yourself); the last admin cannot leave while others remain */
create function public.remove_org_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid := public.my_org_id(); left_count int;
begin
  if org is null then return; end if;
  if p_user <> auth.uid() and not public.is_org_admin() then raise exception 'Only an admin can remove members' using errcode = '42501'; end if;
  if exists (select 1 from public.org_members where "OrgUUID" = org and user_id = p_user and "Role" = 'admin')
     and (select count(*) from public.org_members where "OrgUUID" = org and "Role" = 'admin') = 1
     and (select count(*) from public.org_members where "OrgUUID" = org) > 1 then
    raise exception 'Make someone else an admin first' using errcode = '22023'; end if;
  delete from public.org_members where "OrgUUID" = org and user_id = p_user;
  select count(*) into left_count from public.org_members where "OrgUUID" = org;
  if left_count = 0 then delete from public.organizations where "OrgUUID" = org; end if;   -- the last person leaving ends it
end $$;
create function public.set_org_settings(p_name text, p_only_internal boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin() then raise exception 'Only an admin can change the settings' using errcode = '42501'; end if;
  update public.organizations set "Name" = coalesce(nullif(trim(p_name), ''), "Name"), "OnlyInternal" = p_only_internal where "OrgUUID" = public.my_org_id();
end $$;
revoke all on function public.create_org(text), public.my_org(), public.invite_to_org(text, text), public.cancel_org_invite(text),
  public.set_org_member(uuid, text), public.remove_org_member(uuid), public.set_org_settings(text, boolean) from public, anon;
grant execute on function public.create_org(text), public.my_org(), public.invite_to_org(text, text), public.cancel_org_invite(text),
  public.set_org_member(uuid, text), public.remove_org_member(uuid), public.set_org_settings(text, boolean) to authenticated;

/** for the notify-email function (service role only): the account behind an email address */
create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public as $$ select id from auth.users where lower(email) = lower(trim(p_email)) $$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
