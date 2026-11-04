# End-to-end tests (Playwright)

| Command | What runs |
|---|---|
| `npm run e2e` | **sample** (desktop journeys on sample data) and **mobile** (layout audit at six sizes) – no accounts, no network |
| `npm run e2e:cloud` | **cloud** – sign-in, sharing, organizations, change history against the **test** Supabase project |
| `npm run e2e:report` | opens the HTML report (screenshots, and traces of failed tests) |

Locally the tests use the installed Google Chrome (`PW_CHANNEL=msedge` uses Edge instead); no browser download is needed.
Each sample test runs in a fresh browser context, so it starts from a clean sample data set.

## Setting up the cloud tests (once)

Never use the production project – the tests refuse to run if they see its address.

1. **supabase.com → New project** (free plan), e.g. `slate-space-test`.
2. **SQL Editor**: run every file in `supabase/migrations` in name order, then `supabase/tests/mail_sink.sql`
   (test project only – it stores emails instead of sending them).
3. Link the CLI to the test project for the deploys (and back to production afterwards):
   ```bash
   npx supabase link --project-ref <test-project-ref>
   ```
   ```bash
   npx supabase secrets set MAIL_SINK=table CODE_PEPPER=<any long random text> MAIL_FROM=test@example.com
   ```
   ```bash
   npx supabase functions deploy send-login-code
   ```
   ```bash
   npx supabase functions deploy verify-login-code
   ```
   ```bash
   npx supabase functions deploy notify-email
   ```
4. **Authentication → Providers → Email**: on; *Confirm email* off is fine for tests (users are created confirmed).
5. Create `frontend/.env.e2e.local` (ignored by git):
   ```
   VITE_SUPABASE_URL=https://<test-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<test project anon key>
   E2E_SERVICE_ROLE_KEY=<test project service_role key>
   ```
6. Link the CLI back to production when you are done: `npx supabase link --project-ref udsqireigvipmpepbtrf`.

The tests create their own users (`e2e-…@example.com`, random passwords) and delete them, with all their data, at the end.

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
