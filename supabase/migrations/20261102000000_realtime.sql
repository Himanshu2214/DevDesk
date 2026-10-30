-- Live updates across devices (Supabase Realtime, "postgres_changes"). Changes to children (work log, notes, tests, …)
-- and to dependencies/links touch their parent row, so publishing the parent tables is enough.
-- Realtime applies the same row level security: each user only hears about their own rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tickets, public.transports, public.tech_objects, public.articles, public.ticket_templates;
  end if;
end $$;
