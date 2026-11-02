-- Suggestions while typing in the share dialogs: only people you already share with (a project or a ticket, in either
-- direction). Searching all accounts is deliberately not possible – it would let anyone list other users' emails.
create function public.share_contacts() returns table (email text, name text)
language sql stable security definer set search_path = public as $$
  select u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u
  where public.session_verified() and u.id <> auth.uid() and u.id in (
    select member_id from public.project_shares where owner_id = auth.uid()
    union select owner_id from public.project_shares where member_id = auth.uid()
    union select member_id from public.ticket_shares where owner_id = auth.uid()
    union select owner_id from public.ticket_shares where member_id = auth.uid())
  order by 2, 1;
$$;
revoke all on function public.share_contacts() from public, anon;
grant execute on function public.share_contacts() to authenticated;
