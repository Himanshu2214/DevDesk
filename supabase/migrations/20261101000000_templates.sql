-- Ticket templates (prefilled new-ticket forms). One row per template; the form values live in "Data" (jsonb).
-- Same access rule as every other table: own rows, verified session only.

create table public.ticket_templates (
  "TemplateUUID"  uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  "Name"          text not null check (length(trim("Name")) between 1 and 60),
  name_key        text generated always as (lower(trim("Name"))) stored,
  "Data"          jsonb not null default '{}' check (jsonb_typeof("Data") = 'object' and length("Data"::text) <= 20000),
  "CreatedAt"     timestamptz not null default now(),
  unique (user_id, name_key)
);

grant select, insert, update, delete on public.ticket_templates to authenticated;
alter table public.ticket_templates enable row level security;
create policy own_rows on public.ticket_templates for all to authenticated
  using (user_id = auth.uid() and public.session_verified())
  with check (user_id = auth.uid() and public.session_verified());
