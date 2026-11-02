-- Email and sign-in limits (used by the edge functions with the service role):
--  - mail_log: one row per email sent (kind, who asked, a salted hash of the recipient – never the address). take_mail_slot()
--    decides atomically whether another email may go out:
--      code   (sign-in codes)   at most 8 per user per hour and 20 per day; may use the whole daily provider limit
--      notify (share emails)    at most 30 per sender per day, 3 per sender and recipient per day
--      digest (daily email)     one per user per day (the scheduler already does that)
--      notify and digest stop when only the reserve for sign-in codes is left of the daily limit
--  - login_failures: wrong sign-in codes per user; 10 within 15 minutes pause code sign-in for 15 minutes (the
--    authenticator app, phone approval and password reset are not affected).
-- Nothing here is readable from the app.

create table public.mail_log (
  "MailUUID"  uuid primary key default gen_random_uuid(),
  "Kind"      text not null check ("Kind" in ('code', 'notify', 'digest')),
  user_id     uuid references auth.users on delete cascade,
  "ToHash"    text not null default '',
  "CreatedAt" timestamptz not null default now()
);
create index on public.mail_log ("CreatedAt");
create index on public.mail_log (user_id, "Kind", "CreatedAt");
alter table public.mail_log enable row level security;
grant select, insert, delete on public.mail_log to service_role;

create table public.login_failures (
  user_id     uuid not null references auth.users on delete cascade,
  "CreatedAt" timestamptz not null default now()
);
create index on public.login_failures (user_id, "CreatedAt");
alter table public.login_failures enable row level security;
grant select, insert, delete on public.login_failures to service_role;

/** may another email go out? Records it when yes (returns its id for release_mail_slot), otherwise says why */
create function public.take_mail_slot(p_kind text, p_user uuid, p_to_hash text, p_daily_limit int default 200, p_reserve int default 60)
returns table (ok boolean, reason text, slot uuid)
language plpgsql security definer set search_path = public as $$
declare today_total int; id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('mail_log'));                         -- one decision at a time
  select count(*) into today_total from public.mail_log where "CreatedAt" > now() - interval '24 hours';
  if p_kind = 'code' then
    if (select count(*) from public.mail_log where user_id = p_user and "Kind" = 'code' and "CreatedAt" > now() - interval '1 hour') >= 8 then
      return query select false, 'user-hour', null::uuid; return; end if;
    if (select count(*) from public.mail_log where user_id = p_user and "Kind" = 'code' and "CreatedAt" > now() - interval '24 hours') >= 20 then
      return query select false, 'user-day', null::uuid; return; end if;
    if today_total >= p_daily_limit then return query select false, 'quota', null::uuid; return; end if;
  elsif p_kind in ('notify', 'digest') then
    if today_total >= greatest(0, p_daily_limit - p_reserve) then return query select false, 'quota', null::uuid; return; end if;
    if p_kind = 'notify' then
      if (select count(*) from public.mail_log where user_id = p_user and "Kind" = 'notify' and "CreatedAt" > now() - interval '24 hours') >= 30 then
        return query select false, 'user-day', null::uuid; return; end if;
      if (select count(*) from public.mail_log where user_id = p_user and "Kind" = 'notify' and "ToHash" = p_to_hash and "CreatedAt" > now() - interval '24 hours') >= 3 then
        return query select false, 'pair-day', null::uuid; return; end if;
    else
      if exists (select 1 from public.mail_log where user_id = p_user and "Kind" = 'digest' and "CreatedAt" > now() - interval '20 hours') then
        return query select false, 'user-day', null::uuid; return; end if;
    end if;
  else
    return query select false, 'unknown', null::uuid; return;
  end if;
  insert into public.mail_log ("Kind", user_id, "ToHash") values (p_kind, p_user, p_to_hash) returning "MailUUID" into id;
  delete from public.mail_log where "CreatedAt" < now() - interval '7 days';
  return query select true, 'ok', id;
end $$;
/** an email that could not be sent does not count */
create function public.release_mail_slot(p_slot uuid) returns void
language sql security definer set search_path = public as $$ delete from public.mail_log where "MailUUID" = p_slot $$;

/** wrong sign-in codes: record one, and whether code sign-in is paused for this user */
create function public.record_login_failure(p_user uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.login_failures (user_id) values (p_user);
  delete from public.login_failures where "CreatedAt" < now() - interval '1 day';
$$;
create function public.login_paused(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.login_failures where user_id = p_user and "CreatedAt" > now() - interval '15 minutes') >= 10;
$$;
create function public.clear_login_failures(p_user uuid) returns void
language sql security definer set search_path = public as $$ delete from public.login_failures where user_id = p_user $$;

revoke all on function public.take_mail_slot(text, uuid, text, int, int), public.release_mail_slot(uuid), public.record_login_failure(uuid),
  public.login_paused(uuid), public.clear_login_failures(uuid) from public, anon, authenticated;
grant execute on function public.take_mail_slot(text, uuid, text, int, int), public.release_mail_slot(uuid), public.record_login_failure(uuid),
  public.login_paused(uuid), public.clear_login_failures(uuid) to service_role;
