-- Approve a sign-in from your phone (like GitHub Mobile): the new session shows a 2-digit number, your phone gets a
-- notification (Web Push to the installed app), and you tap the same number there. The phone must itself be signed in
-- and verified, so only a device you already trust can let a new one in.

/* phones (or other browsers) that receive sign-in requests; managed by the user from Account */
create table public.push_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint    text not null unique check (endpoint ~ '^https://'),
  p256dh      text not null,
  auth        text not null,
  label       text not null default 'Phone' check (length(label) <= 80),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.push_devices enable row level security;
create policy own_devices on public.push_devices for all to authenticated
  using (user_id = auth.uid() and public.session_verified())
  with check (user_id = auth.uid() and public.session_verified());
grant select, insert, update, delete on public.push_devices to authenticated;
grant select, insert, update, delete on public.push_devices to service_role;

/* one open request per new session; only the edge function (service role) reads or writes it */
create table public.login_approvals (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users on delete cascade,
  number      smallint not null check (number between 10 and 99),
  choices     smallint[] not null,
  agent       text not null default '',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.login_approvals enable row level security;   -- no policies: service role only
grant select, insert, update, delete on public.login_approvals to service_role;
