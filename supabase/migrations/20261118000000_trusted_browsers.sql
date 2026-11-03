-- Sign-in: phone approval removed, browsers trusted for 24 hours instead.
--  - trusted_browsers: after the second step (emailed code or authenticator app) the verify-login-code function gives the
--    browser a random token and keeps only its salted hash here. A new session of the same account presenting it within
--    24 hours is verified without a code. "Sign out all other devices" deletes the others. Service role only.
--  - push_devices / login_approvals (phone approval) are no longer used and are removed.

create table public.trusted_browsers (
  token_hash  text primary key,
  user_id     uuid not null references auth.users on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index on public.trusted_browsers (user_id);
alter table public.trusted_browsers enable row level security;          -- no policies: only the edge function uses it
grant select, insert, delete on public.trusted_browsers to service_role;

-- expired tokens are cleaned up whenever a new one is made
create function public.trusted_browsers_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin delete from public.trusted_browsers where expires_at < now(); return new; end $$;
create trigger trusted_browsers_cleanup after insert on public.trusted_browsers for each statement execute function public.trusted_browsers_cleanup();

drop table if exists public.login_approvals;
drop table if exists public.push_devices;
