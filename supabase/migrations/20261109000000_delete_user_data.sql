-- Deleting an account: the delete-account function first removes the user's rows with this function, then the auth
-- user. Supabase Auth only reports "Database error deleting user" when its cascade fails; done here, the real Postgres
-- error reaches the function (and the person deleting), and the auth delete has nothing left to cascade into.
create or replace function public.delete_user_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- tickets first: their child rows (worklogs, notes, links …) go with them in one cascade
  delete from public.tickets where user_id = p_user;
  -- then every other table that belongs to the user, including projects shared with them
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name in ('user_id', 'owner_id', 'member_id')
    order by c.table_name = 'projects', c.table_name   -- projects last: shares and other rows point at them
  loop
    execute format('delete from public.%I where %I = $1', r.table_name, r.column_name) using p_user;
  end loop;
end $$;
revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
