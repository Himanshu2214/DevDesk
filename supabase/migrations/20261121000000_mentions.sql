-- @mentions in comments: "@Asha" or "@asha.k" in a comment notifies that person – but only people who can see the
-- ticket (its owner, people it is shared with, members of its shared project). Matching happens here on the server,
-- so nobody can be notified about a ticket they cannot open, and the comment editor needs no special markup.
-- A person matches by full name, first name or the part of their email before the @, with a word boundary after it.

/** escapes a text for use inside a regular expression */
create function public.regex_escape(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(p, '([\.\^\$\|\(\)\[\]\{\}\*\+\?\\\-])', '\\\1', 'g');
$$;

create function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  txt text;
  tk record;
  p record;
  who text := coalesce(public.author_label(), 'Someone');
  excerpt text;
begin
  if position('@' in coalesce(new."Text", '')) = 0 then return null; end if;
  -- the comment as plain text, lower case (rich text: tags and entities removed)
  txt := lower(replace(regexp_replace(new."Text", '<[^>]*>', ' ', 'g'), '&nbsp;', ' '));
  excerpt := left(btrim(regexp_replace(regexp_replace(new."Text", '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g')), 200);
  select t."TicketId", t.user_id, t."Project" into tk from public.tickets t where t."TicketUUID" = new."TicketUUID";
  if not found then return null; end if;
  for p in
    select u.id,
           lower(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', ''))) as name,
           lower(split_part(u.email, '@', 1)) as local
    from auth.users u
    where u.id is distinct from new.user_id
      and (u.id = tk.user_id
        or exists (select 1 from public.ticket_shares s where s."TicketUUID" = new."TicketUUID" and s.member_id = u.id and s."Status" = 'active')
        or exists (select 1 from public.project_shares s where s.owner_id = tk.user_id and s."Project" = tk."Project" and s.member_id = u.id and s."Status" = 'active'))
  loop
    if (p.name <> '' and (txt ~ ('@' || public.regex_escape(p.name) || '(\W|$)')
                          or txt ~ ('@' || public.regex_escape(split_part(p.name, ' ', 1)) || '(\W|$)')))
       or (p.local <> '' and txt ~ ('@' || public.regex_escape(p.local) || '(\W|$)')) then
      perform public.notify(p.id, 'mention', who || ' mentioned you on ' || tk."TicketId", excerpt, 'ticket/' || tk."TicketId");
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.notify_mentions() from public, anon, authenticated;

create trigger notes_mentions after insert on public.notes for each row execute function public.notify_mentions();
