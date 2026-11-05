# End-to-end tests (Playwright)

| Command | What runs |
|---|---|
| `npm run e2e` | **sample** (desktop journeys on sample data) and **mobile** (layout audit at six sizes) – no accounts, no network |
| `npm run e2e:cloud` | **cloud** – sign-in, sharing, organizations, change history against the **test** Supabase project |
| `npm run e2e:report` | opens the HTML report (screenshots, and traces of failed tests) |

Locally the tests use the installed Google Chrome (`PW_CHANNEL=msedge` uses Edge instead); no browser download is needed.
Each sample test runs in a fresh browser context, so it starts from a clean sample data set.

## Setting up the cloud tests (once)

Never use the production project. Before any test starts, the cloud set-up checks that `.env.e2e.local`:
- has a standard project address `https://<20-letter ref>.supabase.co` (no custom domain) that is **not** production;
- has an anon key and a service_role key, of that same project wherever the key shows its project;
- is not overridden by `VITE_SUPABASE_*` variables in your shell.

It then checks that the project at that address accepts both keys (Supabase only accepts a project's own keys at its
address, so this also proves the newer `sb_…` keys belong to it), that the test-only `mail_sink` table exists, and that
the built app talks to the test project and contains neither the production address nor the service key. If any check fails, nothing runs and nothing
is cleaned up.

**Never configure Mailjet or Resend on the test project** (no `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` or
`RESEND_API_KEY` secrets). The test project must have the secret `MAIL_SINK=table`: the edge functions then store every
email in the `mail_sink` table instead of sending it, and the tests read the sign-in codes from there.

Every CLI command below names the test project with `--project-ref`, so the CLI never has to be linked to it and stays
linked to production. Replace `<test-ref>` with the test project's reference (the 20 letters in its address) and check
it is **not** `udsqireigvipmpepbtrf` (production) before pressing Enter. A command run without `--project-ref` would go to
the linked project – production – so never drop it.

1. **supabase.com → New project** (free plan), e.g. `slate-space-test`.
2. **SQL Editor** of the test project (check the project name at the top of the dashboard first): run every file in `supabase/migrations` in name order (`20261030…_init` first,
   `20261119…_hardening` last), then `supabase/tests/mail_sink.sql` (test project only).
3. Secrets on the test project:
   ```bash
   npx supabase secrets set --project-ref <test-ref> MAIL_SINK=table CODE_PEPPER=<any long random text> MAIL_FROM=test@example.com
   ```
   Check them (names only are shown): `npx supabase secrets list --project-ref <test-ref>`. It must list `MAIL_SINK`
   and must not list any `MAILJET_` or `RESEND_` secret. Production must never have `MAIL_SINK`:
   `npx supabase secrets list --project-ref udsqireigvipmpepbtrf` must not list it (it would stop all real email).
4. Edge functions on the test project:
   ```bash
   npx supabase functions deploy send-login-code --project-ref <test-ref>
   ```
   ```bash
   npx supabase functions deploy verify-login-code --project-ref <test-ref>
   ```
   ```bash
   npx supabase functions deploy notify-email --project-ref <test-ref>
   ```
5. **Authentication → Providers → Email**: on; CAPTCHA off; *Confirm email* either way (users are created confirmed).
6. Create `frontend/.env.e2e.local` (ignored by git; never paste the keys anywhere else):
   ```
   VITE_SUPABASE_URL=https://<test-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<test project anon key>
   E2E_SERVICE_ROLE_KEY=<test project service_role key>
   ```

The tests create their own users (`e2e-<role>-<run>-<6 hex>@example.com`, random passwords, marked with the run id) and
delete them, with all their data and files, at the end. Every clean-up step is checked: a failed one is reported with the account
and the step, the remaining steps still run, and the test run fails. Before and after each run, accounts with exactly
that address pattern and marker that interrupted runs left behind are removed too – only when both the account and its
run started more than 2 hours ago (a run is stopped after 1 hour), so a run still going is never disturbed. No other
account is ever touched.

The service_role key stays in the Node test process: it is not a `VITE_` variable, so it never enters the app build
(also checked before the tests), and the browser, screenshots and traces never see it. Reports and logs show test
account addresses (`@example.com`) and error messages, never keys. Keep `e2e-report/` and `e2e-results/` local anyway.

## Security tests (`e2e/cloud/security`, part of `npm run e2e:cloud`)

Negative-permission tests straight against the test project's API, as real users: every check uses the public (anon /
publishable) key and the user's own session after the real emailed-code step. The service-role key only creates and
deletes the test users and reads their sign-in code from the mail sink – it never decides whether something was allowed.

- `isolation.spec.ts` – one user's private rows, files and functions are out of reach for another user, for anonymous
  visitors and for a password-only session (no emailed code).
- `sharing.spec.ts` – what view / comment / edit collaborators can do directly through the API; forging owners, authors
  and shares; files follow the share.
- `organization.spec.ts` – removing a member ends organization access at once but keeps direct shares; two organizations
  see nothing of each other; an ordinary member cannot raise themselves or take the organization over.

Tests for findings that are not fixed on the project yet are marked as expected failures (`test.fail`, naming the
finding), so the suite stays green and turns red ("expected to fail, but passed") once the fix is applied – then remove
the mark. `E2E_SHOW_KNOWN=1` runs them as normal tests to see exactly what fails.

Revoked file access is checked on `/storage/v1/object/authenticated/…`, which Storage checks on every request. The path
supabase-js `download()` uses (`/object/…`) can be answered from the CDN cache for a token that fetched the file before,
until that token is renewed (finding F12); the app downloads through the checked path.

## Not automated – check by hand

- **Google sign-in** and **Connect Google Calendar** (real Google accounts and consent screens); creating a meeting
  and seeing it in Google Calendar.
- **Real email delivery** through Mailjet (codes, share emails, daily email) – the tests use the mail sink.
- Physical phones (below).

## Physical device checklist (Android Chrome and iOS Safari)

Browser emulation is not a physical device test. On each phone, at slatespace-32m.pages.dev:

1. **Sign-in**: email + password, the emailed code (paste from the mail app works?), sign out, sign in again the same
   day without a code. Google sign-in. Rotate the phone during sign-in.
2. **Navigation**: bottom bar, the menu button opening the sidebar, back gesture/button returns to the previous page.
3. **Ticket creation**: New ticket, keyboard does not cover the title or the Create button; due date picker usable.
4. **Sharing**: open Share, type a name (suggestions list is reachable above the keyboard), change access, accept an
   invitation from the Inbox.
5. **Calendar**: month and week view readable; tapping a day/ticket; dragging a ticket to another day (long press).
6. **Gantt**: scrolls sideways inside its area only; bars can be read; tapping a bar opens the ticket.
7. **Forms and keyboard**: number fields show the number keyboard; the page does not jump or zoom when a field is focused.
8. **File uploads**: attach a photo from the camera and from the gallery; it shows as a thumbnail and opens in the viewer.
9. **Scrolling**: long lists, the board's columns scroll sideways inside the board, dialogs scroll inside themselves.
10. **Session persistence**: close the browser/app and reopen – still signed in with Remember me; installed app (Add to
    Home Screen) opens signed in.
11. **Safe areas**: on an iPhone with a notch/home bar, nothing important sits under them; dark and light theme.
