-- Everyone working on a project (owner first, then members), for the avatar group on shared project pages.
-- Anyone with access to the project may ask – the owner and its members; verified sessions only.
-- p_key is the code the caller sees: "GST" for your own project, "GST@1a2b3c4d" for one shared with you.
create function public.project_people(p_key text) returns table (user_id uuid, name text, email text, is_owner boolean, photo text)
language plpgsql stable security definer set search_path = public as $$
declare code text := split_part(p_key, '@', 1); owner uuid;
begin
  if not public.session_verified() then return; end if;
  if position('@' in p_key) = 0 then owner := auth.uid();
  else
    select s.owner_id into owner from public.project_shares s
    where s."Project" = code and left(s.owner_id::text, 8) = split_part(p_key, '@', 2) and s.member_id = auth.uid();
    if owner is null then return; end if;
  end if;
  if not exists (select 1 from public.project_shares where owner_id = owner and "Project" = code) then return; end if;   -- not shared
  return query
    select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email), u.email, u.id = owner,
           coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '')
    from auth.users u
    where u.id = owner or u.id in (select member_id from public.project_shares where owner_id = owner and "Project" = code)
    order by u.id <> owner, 2;
end $$;
revoke all on function public.project_people(text) from public, anon;
grant execute on function public.project_people(text) to authenticated;
