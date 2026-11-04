-- TEST PROJECT ONLY – never run this in production.
-- With the secret MAIL_SINK=table the edge functions store emails here instead of sending them, so the end-to-end
-- tests (frontend/e2e/cloud) can read sign-in codes and share emails. Only the service role can read it.
create table if not exists public.mail_sink (
  id          bigserial primary key,
  to_address  text not null,
  subject     text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.mail_sink enable row level security;            -- no policies: service role only
grant select, insert, delete on public.mail_sink to service_role;
grant usage, select on sequence public.mail_sink_id_seq to service_role;
