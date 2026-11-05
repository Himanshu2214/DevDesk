-- Security fixes from the Supabase security audit (findings F1, F2, F3, F5, F6, F11). Each part names its finding; the
-- cloud security tests (frontend/e2e/cloud/security) and test/security-fixes.test.ts check them.
-- Needs the edge functions of the same change (session_ok), and the app change that confirms a new authenticator app
-- (approve_app_factor). Apply this migration first, then deploy the functions, then the app.

/* ---------- F11: grants back to what the migrations intend ----------
   20261030 revoked all table privileges from anon and authenticated, but every table created afterwards received
   Supabase's default privileges (all, for anon and authenticated). Row level security still refused almost all of it;
   the exception: the owner-only UPDATE policies on ticket_shares / project_shares let an owner change every column
   (Status, member_id, Via) although only "Access" was meant to be changeable. */
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
grant select, insert, update, delete on public.acceptance, public.article_links, public.articles, public.attachments, public.checklist_items,
  public.counters, public.notes, public.object_deps, public.object_links, public.projects, public.tech_objects, public.test_cases,
  public.ticket_seen, public.ticket_templates, public.tickets, public.transport_deps, public.transports, public.value_items,
  public.worklogs to authenticated;
grant select, delete on public.notifications, public.project_shares, public.ticket_shares to authenticated;
grant update ("ReadAt") on public.notifications to authenticated;
grant update ("Access") on public.project_shares, public.ticket_shares to authenticated;
grant select on public.projects_v, public.ticket_changes, public.tickets_v to authenticated;
grant select, insert, delete on public.ticket_links to authenticated;
grant select, insert, update on public.user_settings to authenticated;
-- F3 (below): status history is written by the server only; the app marks entries read
grant select on public.ticket_events to authenticated;
grant update ("IsRead") on public.ticket_events to authenticated;

/* ---------- F1: an authenticator app counts as the second step only when it was set up from a verified session ----------
   aal2 used to be enough. Supabase lets a password-only session enrol its first TOTP factor, so anyone with the password
   could add their own app and skip the emailed code. Now aal2 counts only when every verified factor of the account was
   confirmed (approve_app_factor) from a session that had already passed the second step. */
create table public.app_factors (
  factor_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  "ApprovedAt" timestamptz not null default now()
);
alter table public.app_factors enable row level security;          -- no policies: only the functions below use it
revoke all on public.app_factors from anon, authenticated;
grant select, insert, delete on public.app_factors to service_role;
-- authenticator apps that exist when this runs were set up through the app before this change: they stay approved.
-- (Check the project's MFA factors before applying if you suspect one was added by someone else.)
insert into public.app_factors (factor_id, user_id)
  select f.id, f.user_id from auth.mfa_factors f where f.status::text = 'verified'
  on conflict (factor_id) do nothing;

/** true when the account has an approved verified authenticator app and no verified one that is not approved */
create function public.app_factors_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.mfa_factors f join public.app_factors a on a.factor_id = f.id
                 where f.user_id = p_user and f.status::text = 'verified')
     and not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status::text = 'verified'
                     and not exists (select 1 from public.app_factors a where a.factor_id = f.id));
$$;
/** the one rule for "this session passed the second step" – also used by the edge functions (service role) */
create function public.session_ok(p_user uuid, p_session uuid, p_aal text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    exists (select 1 from public.verified_sessions v where v.user_id = p_user and v.session_id = p_session)
    or (coalesce(p_aal, '') = 'aal2' and public.app_factors_ok(p_user)));
$$;
create or replace function public.session_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select public.session_ok(auth.uid(), nullif(auth.jwt() ->> 'session_id', '')::uuid, auth.jwt() ->> 'aal');
$$;
/** Account → authenticator app: confirms the app just set up. Only a session that already passed the second step
 *  (emailed code, or an approved app) may do this, and only for a factor verified in the last 30 minutes. */
create function public.approve_app_factor(p_factor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.verified_sessions v where v.user_id = auth.uid() and v.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid)
     and not (coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (select 1 from auth.mfa_factors f join public.app_factors a on a.factor_id = f.id
                                                                     where f.user_id = auth.uid() and f.status::text = 'verified')) then
    raise exception 'Finish the 2-step sign-in with the emailed code first' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.mfa_factors f where f.id = p_factor and f.user_id = auth.uid() and f.status::text = 'verified'
                 and f.created_at > now() - interval '30 minutes') then
    raise exception 'This authenticator app cannot be confirmed – set it up again' using errcode = 'P0002';
  end if;
  insert into public.app_factors (factor_id, user_id) values (p_factor, auth.uid()) on conflict (factor_id) do nothing;
end $$;
revoke all on function public.app_factors_ok(uuid), public.session_ok(uuid, uuid, text), public.approve_app_factor(uuid) from public, anon, authenticated;
grant execute on function public.session_ok(uuid, uuid, text) to service_role;
grant execute on function public.approve_app_factor(uuid) to authenticated;

/* ---------- F2: the author names shown in the app come from the server ----------
   CreatedBy / EventBy / TestedBy were written by the client, so a collaborator could post a comment or log time
   "signed" as someone else, and an editor could re-sign other people's rows. */
create function public.author_label() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), u.email, '')
  from auth.users u where u.id = auth.uid();
$$;
revoke all on function public.author_label() from public, anon;
grant execute on function public.author_label() to authenticated;

create function public.set_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;                -- the service role and server jobs keep what they write
  me := coalesce(public.author_label(), '');
  if tg_table_name = 'ticket_events' then
    new."EventBy" := case when tg_op = 'INSERT' then me else old."EventBy" end;
  elsif tg_table_name = 'test_cases' then
    if tg_op = 'INSERT' then new."TestedBy" := case when coalesce(new."TestResult", 'OPEN') = 'OPEN' then '' else me end;
    elsif new."TestResult" is distinct from old."TestResult" then new."TestedBy" := case when new."TestResult" = 'OPEN' then '' else me end;
    else new."TestedBy" := old."TestedBy";
    end if;
  else
    new."CreatedBy" := case when tg_op = 'INSERT' then me else old."CreatedBy" end;
  end if;
  return new;
end $$;
create trigger tickets_author before insert or update on public.tickets for each row execute function public.set_author();
create trigger notes_author before insert or update on public.notes for each row execute function public.set_author();
create trigger worklogs_author before insert or update on public.worklogs for each row execute function public.set_author();
create trigger attachments_author before insert or update on public.attachments for each row execute function public.set_author();
create trigger transports_author before insert or update on public.transports for each row execute function public.set_author();
create trigger ticket_events_author before insert or update on public.ticket_events for each row execute function public.set_author();
create trigger test_cases_author before insert or update on public.test_cases for each row execute function public.set_author();

/* ---------- F3: status history only from a real status change ----------
   A collaborator with comment access could insert "moved to Done by …" entries directly. History is now written only
   by set_status, which runs as the server and checks edit access itself (the INSERT grant is gone, see F11). */
drop policy ticket_rows_add on public.ticket_events;
drop policy ticket_rows_delete on public.ticket_events;
create or replace function public.set_status(p_ticket uuid, p_status text, p_by text default '') returns void
language plpgsql security definer set search_path = public as $$
declare old_status text;
begin
  if not public.session_verified() or not public.can_edit_ticket(p_ticket) then
    raise exception 'You cannot change the status of this ticket' using errcode = '42501';
  end if;
  select "Status" into old_status from public.tickets where "TicketUUID" = p_ticket for update;
  if not found then raise exception 'Ticket not found'; end if;
  if old_status = p_status then return; end if;
  update public.tickets set "Status" = p_status, "StatusChangedAt" = now(),
    "ClosedAt" = case when p_status = 'DONE' then now() else null end
  where "TicketUUID" = p_ticket;
  insert into public.ticket_events ("TicketUUID", "EventKind", "StatusFrom", "StatusTo", "IsRead")   -- EventBy: set_author()
  values (p_ticket, 'STAT', old_status, p_status, true);
end $$;
revoke all on function public.set_status(uuid, text, text) from public, anon;
grant execute on function public.set_status(uuid, text, text) to authenticated;

/* ---------- F5: notifications and "seen" marks need the second step too ---------- */
alter policy read_notifications on public.notifications
  using (user_id = auth.uid() and public.session_verified()) with check (user_id = auth.uid() and public.session_verified());
alter policy remove_notifications on public.notifications using (user_id = auth.uid() and public.session_verified());
alter policy own_seen on public.ticket_seen
  using (user_id = auth.uid() and public.session_verified())
  with check (user_id = auth.uid() and public.session_verified() and public.can_see_ticket("TicketUUID"));

/* ---------- F6: same_org() answered for any two people, to anyone ----------
   It is only needed inside server functions (share_via, share_mode, share_contacts, user_label), which run as owner. */
revoke all on function public.same_org(uuid, uuid) from public, anon, authenticated;
