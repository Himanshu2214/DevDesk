-- "Connect Google Calendar" (OAuth): the Google refresh token per user, encrypted by the calendar-feed function,
-- and the short-lived state values of the consent round trip. Both are for the function (service role) only –
-- the app never sees a token; it only asks whether Google is connected.

create table public.calendar_tokens (
  user_id       uuid primary key references auth.users on delete cascade,
  google_email  text not null default '',
  refresh_token text not null,                       -- AES-GCM encrypted with a key derived from CODE_PEPPER
  connected_at  timestamptz not null default now()
);
create table public.oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;     -- no policies: nobody but the service role
alter table public.oauth_states enable row level security;
grant select, insert, update, delete on public.calendar_tokens, public.oauth_states to service_role;
grant select on public.user_settings to service_role;

/** Which Google account is connected (null = none) – for the signed-in user, verified sessions only */
create function public.calendar_connection() returns text
language sql stable security definer set search_path = public as $$
  select google_email from public.calendar_tokens where user_id = auth.uid() and public.session_verified();
$$;
revoke all on function public.calendar_connection() from public, anon;
grant execute on function public.calendar_connection() to authenticated;
