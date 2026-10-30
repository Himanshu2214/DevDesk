-- Authenticator app (TOTP, Supabase MFA) as a second step next to the emailed code.
-- A session counts as verified when it passed the emailed code (verified_sessions) OR an authenticator
-- challenge (the access token then carries aal = 'aal2'). Every row level security policy uses this function,
-- so nothing else changes.
create or replace function public.session_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or exists (
        select 1 from public.verified_sessions v
        where v.user_id = auth.uid() and v.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      );
$$;
grant execute on function public.session_verified() to authenticated;
