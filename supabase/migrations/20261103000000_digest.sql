-- Daily email digest: per-user settings (off by default) and the list of users due for one, used by the
-- daily-digest edge function. A scheduled job calls that function every 30 minutes (see docs/SUPABASE-SETUP.md).

create table public.user_settings (
  user_id          uuid primary key references auth.users on delete cascade default auth.uid(),
  "DigestEnabled"  boolean not null default false,
  "DigestHour"     int  not null default 8 check ("DigestHour" between 0 and 23),
  "TimeZone"       text not null default 'Asia/Kolkata',
  "DigestLastSent" date,
  "LastChangedAt"  timestamptz not null default now()
);

-- only real time zone names (Asia/Kolkata, Europe/Berlin, …); the user cannot set when the last digest went out
create function public.check_user_settings() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new."TimeZone") then
    raise exception 'Unknown time zone %', new."TimeZone" using errcode = '23514';
  end if;
  if current_user = 'authenticated' then
    new."DigestLastSent" := case when tg_op = 'UPDATE' then old."DigestLastSent" end;
  end if;
  new."LastChangedAt" := now();
  return new;
end $$;
create trigger user_settings_check before insert or update on public.user_settings for each row execute function public.check_user_settings();

grant select, insert, update on public.user_settings to authenticated;
grant select, update on public.user_settings to service_role;
-- the digest function (service role) reads each user's open tickets and yesterday's hours
grant select on public.tickets, public.projects, public.worklogs, public.tickets_v to service_role;
alter table public.user_settings enable row level security;
create policy own_rows on public.user_settings for all to authenticated
  using (user_id = auth.uid() and public.session_verified())
  with check (user_id = auth.uid() and public.session_verified());

/* Users whose digest hour has come in their own time zone and who have not had one today (their date) */
create function public.digest_due() returns table (user_id uuid, email text, full_name text, time_zone text, local_date date)
language sql stable security definer set search_path = public as $$
  select s.user_id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), s."TimeZone", (now() at time zone s."TimeZone")::date
  from public.user_settings s join auth.users u on u.id = s.user_id
  where s."DigestEnabled" and u.email is not null
    and extract(hour from now() at time zone s."TimeZone") >= s."DigestHour"
    and (s."DigestLastSent" is null or s."DigestLastSent" < (now() at time zone s."TimeZone")::date);
$$;
revoke all on function public.digest_due() from public, anon, authenticated;
grant execute on function public.digest_due() to service_role;
