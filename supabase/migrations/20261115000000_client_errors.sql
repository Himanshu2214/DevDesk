-- Client error log: crashes and uncaught errors from the app (already cleaned in the browser: no emails, tokens, keys
-- or query strings). Written only through log_client_error() – at most 30 per user per hour, texts shortened again
-- here, rows older than 30 days removed on the way. Nobody reads it from the app; review it in the Supabase table editor.
create table public.client_errors (
  "ErrorUUID" uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,
  "Message"   text not null,
  "Stack"     text not null default '',
  "Where"     text not null default '',
  "Route"     text not null default '',
  "Agent"     text not null default '',
  "CreatedAt" timestamptz not null default now()
);
create index on public.client_errors (user_id, "CreatedAt" desc);
create index on public.client_errors ("CreatedAt");
alter table public.client_errors enable row level security;          -- no policies: only the function below writes
grant select, delete on public.client_errors to service_role;

create function public.log_client_error(p_message text, p_stack text, p_where text, p_route text, p_agent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.client_errors where user_id = auth.uid() and "CreatedAt" > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.client_errors (user_id, "Message", "Stack", "Where", "Route", "Agent")
  values (auth.uid(), left(coalesce(p_message, ''), 500), left(coalesce(p_stack, ''), 2000), left(coalesce(p_where, ''), 60),
          left(coalesce(p_route, ''), 120), left(coalesce(p_agent, ''), 200));
  delete from public.client_errors where "CreatedAt" < now() - interval '30 days';
end $$;
revoke all on function public.log_client_error(text, text, text, text, text) from public, anon;
grant execute on function public.log_client_error(text, text, text, text, text) to authenticated;
