# SLATE·SPACE standalone – setup (Supabase, Google, Resend)

The standalone mode runs SLATE·SPACE without SAP: accounts and data live in **Supabase** (Postgres), sign-in works with
**email + password** or **Google**, and every sign-in is followed by a **6-digit code by email** (2-step).
Emails (confirmation, password reset, codes) go out through **Resend**.

You do every step that involves an account, a password or a secret key yourself. The app only needs two **public**
values: the project URL and the anon key.

| Piece | Where it lives in the repo |
|---|---|
| Database tables, access rules, business rules | `supabase/migrations/20261030000000_init.sql` |
| 2-step code functions | `supabase/functions/send-login-code`, `supabase/functions/verify-login-code` |
| Daily email | `supabase/functions/daily-digest` |
| App code | `frontend/src/api/supabase.ts`, `frontend/src/components/Auth.tsx`, `frontend/src/lib/supabase.ts` |

---

## 1. Create the Supabase project

1. Sign up at <https://supabase.com> and click **New project**.
2. Fill in the form:

   | Field | Setting |
   |---|---|
   | GitHub (optional) | leave unconnected |
   | Project name | `slate-space` |
   | Database password | **Generate a password**, keep it in your password manager (the app never needs it) |
   | Region | **Need a specific region?** → closest to you (India: **South Asia, Mumbai**) |
   | Enable Data API | **on** |
   | Automatically expose new tables | **off** – the database script grants exactly what the app needs |
   | Enable automatic RLS | **on** – safety net for tables added later |
   | Advanced configuration | defaults |

3. When it is ready, open **Project Settings → API** and note:
   - **Project URL** – `https://<ref>.supabase.co`
   - **anon / publishable key** (newer projects show `sb_publishable_…`; either works)
   - Do **not** copy the `service_role` / secret key anywhere. It never goes into the app.

## 2. Create the database

1. Open **SQL Editor → New query**.
2. Paste the whole content of `supabase/migrations/20261030000000_init.sql` and click **Run**. It should finish with
   "Success. No rows returned".
3. Check under **Table Editor**: tables `tickets`, `worklogs`, `transports`, … exist, each with a lock icon (RLS on).

## 3. Sign-in settings

**Authentication → URL Configuration**
- **Site URL**: your app address (for local testing `http://localhost:5181`).
- **Redirect URLs**: add `http://localhost:5181/**` and, later, your hosted address (e.g. `https://slate-space.vercel.app/**`).

**Authentication → Providers → Email**
- Keep **Confirm email** on (users must open the link before they can sign in).
- **Minimum password length**: 8.

## 4. Google sign-in

1. Open <https://console.cloud.google.com>, create a project `SLATE SPACE`.
2. **APIs & Services → OAuth consent screen**: User type **External**, app name `SLATE·SPACE`, your support email,
   scopes: only the default `email`, `profile`, `openid` (no review needed). Add yourself as a test user while in testing,
   or **Publish app** when you are ready for everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → **Web application**
   - **Authorized JavaScript origins**: `http://localhost:5181` and your hosted address.
   - **Authorized redirect URIs**: `https://<ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.
5. In Supabase: **Authentication → Providers → Google** → enable, paste both, **Save**.

Google sign-in is free; there is no licence to buy.

## 5. Email sending with Resend

1. Sign up at <https://resend.com>. **Domains → Add domain** and add the DNS records it shows at your domain provider
   (wait until the domain shows *Verified*). Without your own domain, Resend can only send to your own address.
2. **API Keys → Create API key** (sending access). Copy it.
3. Confirmation and reset emails – Supabase **Project Settings → Authentication → SMTP Settings** → enable custom SMTP:
   - Host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key
   - Sender email e.g. `login@yourdomain.com`, sender name `SLATE·SPACE`
   (Supabase's built-in mailer only allows a few emails per hour and is not meant for real users.)

## 6. Deploy the 2-step code functions

From the repository root (Node installed; the CLI runs through `npx`):

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase secrets set RESEND_API_KEY=<your Resend key> "MAIL_FROM=SLATE·SPACE <login@yourdomain.com>" CODE_PEPPER=<a random string of 40+ characters> APP_ORIGIN=http://localhost:5181
npx supabase functions deploy send-login-code
npx supabase functions deploy verify-login-code
npx supabase functions deploy delete-account
```

`delete-account` powers **Account → Delete account**: it removes the user's attachment files and then the account;
the database deletes all of their rows with it (every table cascades from `auth.users`). It only works for a session
that has passed the 2-step code.

- `CODE_PEPPER` is mixed into the stored code hash; generate it once (e.g. a password manager's generator) and never share it.
- When you host the app, run `secrets set APP_ORIGIN=https://<your app address>` again.

## 7. Run the app against your project

```bash
cp frontend/.env.supabase.local.example frontend/.env.supabase.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env.supabase.local` (this file is not committed), then:

```bash
npm --prefix frontend run dev:cloud
```

Open <http://localhost:5181>: register, confirm the email, sign in, enter the code – you land in an empty workspace with
the default lists and one project called *General*.

## 8. Host it (free)

```bash
npm --prefix frontend run build:cloud
```

Upload `frontend/dist` to Vercel, Netlify or Cloudflare Pages (static site, no server needed). Then add the hosted
address to: Supabase Redirect URLs (step 3), Google JavaScript origins (step 4) and `APP_ORIGIN` (step 6).

## How the 2-step code protects the data

- After the password or Google sign-in, the app calls `send-login-code`, which emails a 6-digit code for **this session**
  (valid 10 minutes, new code at most once a minute, 5 attempts).
- `verify-login-code` checks it and marks the session as verified.
- Every table's access rule requires `session_verified()`. A session that skipped the code screen gets no data,
  even through the API directly. A new sign-in (new session) needs a new code.

## Free-tier notes

- Free Supabase projects pause after about 7 days without use; resume them from the dashboard. Daily use keeps them awake.
- About 500 MB database and 1 GB file storage – plenty for tickets; attachments count against the file storage.
- Check current limits on <https://supabase.com/pricing> and <https://resend.com/pricing>.

## 9. Authenticator app (second step)

1. **SQL Editor → New query**: paste `supabase/migrations/20261031000000_authenticator.sql` → **Run**
   (choose *Run without RLS* if the warning appears). From now on a session also counts as verified after an
   authenticator code (AAL2), not only after the emailed code.
2. **Authentication → Multi-Factor** (or *Sign In / Providers → Multi-Factor*): **TOTP (App Authenticator)** enabled
   (it is on by default).
3. Redeploy the account function so it accepts authenticator sessions:
   `npx supabase functions deploy delete-account`
4. In the app: **Account → Two-step verification → Set up authenticator app**, scan the QR code with Google Authenticator,
   type the code. Next sign-in asks for the app code; "Lost your phone? Use an emailed code" stays available.

## 10. Bot check (Cloudflare Turnstile, invisible)

Order matters: put the site key into the app first, switch Supabase's check on last.

1. Cloudflare dashboard → **Turnstile** (Application security → Turnstile) → **Add widget**:
   name `SLATE·SPACE`, hostnames `slatespace-32m.pages.dev` and `localhost`, widget mode **Invisible**.
   Copy the **Site key** (public) and the **Secret key** (private).
2. Cloudflare Pages → your project → **Settings → Environment variables** → add `VITE_TURNSTILE_SITE_KEY` = site key,
   then **Deployments → Retry deployment** (or push to `main`). Locally: add the same line to `frontend/.env.supabase.local`.
3. Supabase → **Authentication → Attack Protection** → **Enable CAPTCHA protection** → provider **Turnstile** →
   paste the **Secret key** → Save. Supabase now rejects sign-in, sign-up and reset requests without a valid token.

## 11. Templates, live updates, daily email, teams (database)

Run these four files in **SQL Editor → New query**, one after the other, each with **Run**
(choose *Run without RLS* if the warning appears). They only add things; existing data is not changed.

| File | Adds |
|---|---|
| `supabase/migrations/20261101000000_templates.sql` | your own ticket templates (synced across devices) |
| `supabase/migrations/20261102000000_realtime.sql` | live updates: changes on one device show on the others within a second |
| `supabase/migrations/20261103000000_digest.sql` | daily email settings |
| `supabase/migrations/20261104000000_shared_projects.sql` | teams: share a project with other accounts |

Until they have run, the app keeps working: templates offer only the starters, changes from other devices arrive with the
normal 30-second refresh, Account → Daily email says it is not set up yet, and projects cannot be shared.

## 12. Daily email (scheduled)

1. A secret only the scheduled job knows (any random string of 40+ characters, e.g. from a password manager), plus the
   link the email should open:

   ```bash
   npx supabase secrets set DIGEST_SECRET=<random string> APP_URL=https://slatespace-32m.pages.dev/
   npx supabase functions deploy daily-digest --no-verify-jwt
   ```

   `--no-verify-jwt` is needed because the scheduled job has no user token; the function checks the secret (or, for
   "Send a test email", the signed-in user and their 2-step session) itself.
2. **Database → Extensions**: enable **pg_cron** and **pg_net**.
3. **SQL Editor → New query** (replace both placeholders), **Run**:

   ```sql
   select cron.schedule('slate-space-daily-digest', '*/30 * * * *', $$
     select net.http_post(
       url     := 'https://<ref>.supabase.co/functions/v1/daily-digest',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', '<DIGEST_SECRET>'),
       body    := '{}'::jsonb)
   $$);
   ```

   Every 30 minutes it sends the digest to everyone whose chosen hour has come in their time zone and who has not had one
   that day. To stop it: `select cron.unschedule('slate-space-daily-digest');`
4. In the app: **Account → Daily email** → switch on, pick the time → **Save**. **Send a test email now** sends one at once.

## 13. Teams (shared projects)

Also run `supabase/migrations/20261107000000_project_people.sql` (SQL Editor) – it lets everyone on a shared project see
who else is on it (the avatars next to **Share**).

After step 11, open a project in the sidebar → **Share** (top right) → enter the other person's SLATE·SPACE email.
They need an account first. Members see and edit that project's tickets with their time, notes, tests, files and
transports, and can create tickets in it; only the owner deletes tickets and manages members. Members can leave from the
same button ("Shared by …"). Each person's timesheet shows only their own hours; a ticket's total includes everyone's.

## 14. Install as an app

The hosted site is an installable app (Chrome / Edge: the install icon in the address bar, or menu → *Install
SLATE·SPACE*; Android: *Add to home screen*; iPhone: Share → *Add to Home Screen*). It opens in its own window and
starts instantly; data still needs the internet.

## 15. Calendar meetings (database and function)

1. **SQL Editor → New query**: run `supabase/migrations/20261105000000_calendar.sql`, then
   `supabase/migrations/20261106000000_google_calendar.sql`.
2. Deploy the calendar function. `--no-verify-jwt` is needed because Google's redirect back carries no user token;
   the function checks the user itself:

   ```bash
   npx supabase functions deploy calendar-feed --no-verify-jwt
   ```

## 16. "Connect Google Calendar" (one click for the user)

Reuses the Google OAuth client from step 4.

1. <https://console.cloud.google.com> → your project **SLATE SPACE** → **APIs & Services → Library** → search
   **Google Calendar API** → **Enable**.
2. **APIs & Services → Credentials** → your **Web application** OAuth client → **Authorized redirect URIs** → add
   `https://<ref>.supabase.co/functions/v1/calendar-feed` → **Save**.
3. **OAuth consent screen → Data access** (or *Scopes*) → **Add or remove scopes** → tick
   `.../auth/calendar.events` (see and edit events) → **Update** → **Save**.
4. **OAuth consent screen → Audience**: **Publish app** (status *In production*). In *Testing* status Google ends the
   calendar permission after 7 days. Until Google has reviewed the app, the consent screen says "Google hasn't verified
   this app" – choose **Advanced → Go to SLATE·SPACE**. (Verification is only needed for more than 100 users.)
5. Give the function the client ID and secret (same values as in Supabase → Authentication → Providers → Google).
   Paste the bare values – no `< >` around them:

   ```bash
   npx supabase secrets set GOOGLE_CLIENT_ID=<client id> GOOGLE_CLIENT_SECRET=<client secret>
   ```
6. In the app: **Account → Calendar → Connect Google Calendar** (or the button in **Calendar**). Google asks once;
   meetings then show in month, week and day view, and **New meeting** (or dragging over hours in week / day view)
   creates one in Google Calendar – with a Google Meet link and invitations to guests. The permission is kept encrypted
   on the server; **Hold to disconnect** removes it at Google too.

Outlook / Apple calendars: **Account → Calendar → Use a calendar link instead** and paste the published ICS link.

## 17. Timeline planning (planned start and dependencies)

**SQL Editor → New query**: run `supabase/migrations/20261108000000_planning.sql`. Until then the Timeline works
without planned start dates and dependencies. With the SAP backend they need new fields in the SAP tables first.

## 18. Google sign-in screen (Branding)

Google Cloud → Google Auth Platform → **Branding**: app name `SLATE·SPACE`, support email, then under App domain:

| Field | Value |
|---|---|
| Application home page | `https://slatespace-32m.pages.dev` |
| Application privacy policy link | `https://slatespace-32m.pages.dev/privacy.html` |
| Application terms of service link | `https://slatespace-32m.pages.dev/terms.html` |
| Authorized domains | `slatespace-32m.pages.dev` and `supabase.co` |

Leave the logo empty: uploading one makes Google require a full verification. Then **Audience → Publish app**.

## 19. Approve sign-ins on your phone

Like GitHub Mobile: a new sign-in shows a 2-digit number, your phone gets a notification, and you tap the same
number. It uses free Web Push to the installed app – no extra app or paid service. The authenticator app and the
emailed code stay as backups.

1. **SQL Editor → New query**: run `supabase/migrations/20261110000000_phone_approval.sql`.
2. Make a key pair once (free, runs locally):
   ```bash
   npx web-push generate-vapid-keys
   ```
3. Save the two keys and your email as secrets (paste the values from step 2):
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
   ```
4. Deploy the function:
   ```bash
   npx supabase functions deploy push-approve
   ```
5. On your phone, install the app: Android Chrome → menu → **Install app**; iPhone Safari → Share →
   **Add to Home Screen** (iOS 16.4 or newer; notifications only work in the installed app on iPhone).
6. Open the installed app, sign in once with a code, then **Account → Approve sign-ins on your phone → Use this device
   to approve sign-ins** and allow notifications. **Send a test notification** checks it.

From then on, signing in anywhere else asks your phone first. Tapping a wrong number denies the sign-in. A phone that
is removed or loses its notification permission drops out of the list by itself.

## 20. Share a single ticket

**SQL Editor → New query**: run `supabase/migrations/20261111000000_ticket_shares.sql`. Then a ticket page has a
**Share** button: enter the other person's SLATE·SPACE email. They see and edit only that ticket (with its time,
comments, tests, files and transports); only you can delete it or move it to another project. They can remove it from
their list with the same button. To share many tickets at once, share their project instead (section 13).

## 21. Access levels, change history, lists

**SQL Editor → New query**: run `supabase/migrations/20261112000000_access_and_changes.sql` (after section 20). Then:

- The share dialogs (project and ticket) have a level per person: **Can view** (read only), **Can comment** (also
  comments and their own time) or **Can edit**. Existing shares stay **Can edit**. The database enforces the level.
- A ticket's **Changes** tab lists every change to its fields – who, when, old → new – with a filter by person and
  **Undo**. Tickets someone else changed or commented on since you last opened them get a dot in lists and an entry
  at the top of the Inbox.
- **Lists** (user menu, or Ctrl+K → Lists): add, rename, colour, reorder or hide your ticket types, areas / modules, tech
  and time activities, and rename statuses or set their WIP limits. No SQL needed for this part.

## 22. Send email through Mailjet (to any address, free)

Resend without your own domain only delivers to its account owner. Mailjet's free plan (6,000 emails a month,
200 a day, no credit card) delivers to anyone once your own address is verified as the sender.

1. Sign up at <https://www.mailjet.com> (free plan).
2. **Account → Senders & domains → Add a sender address**: your Gmail address. Open the confirmation email Mailjet sends.
3. **Account → API key management**: copy the **API key** and the **Secret key**.
4. Save them and the sender (paste the values yourself):
   ```bash
   npx supabase secrets set MAILJET_API_KEY=... MAILJET_SECRET_KEY=... "MAIL_FROM=SLATE·SPACE <you@gmail.com>"
   ```
5. Redeploy the two functions that send email:
   ```bash
   npx supabase functions deploy send-login-code
   ```
   ```bash
   npx supabase functions deploy daily-digest --no-verify-jwt
   ```
6. Optional – Supabase's own emails (confirm account, reset password) through Mailjet too: **Authentication → Emails →
   SMTP Settings**: host `in-v3.mailjet.com`, port `587`, username = the API key, password = the Secret key, sender =
   the same Gmail address.

With both Mailjet keys set the functions use Mailjet; without them they keep using Resend. Mail sent "from" a Gmail
address through another service can land in spam at first – mark the first code "Not spam". Your own domain (verified in
Mailjet) avoids that.

## 23. Suggestions in the share dialogs

**SQL Editor → New query**: run `supabase/migrations/20261113000000_share_contacts.sql`. While you type a name or email
in a share dialog, people you already share a project or ticket with (in either direction) are suggested – a fuzzy
match on any part of their name or email. Other accounts are never suggested; someone new is added by their full email.

## 24. Organizations, share invitations and notifications

1. **SQL Editor → New query**: run `supabase/migrations/20261114000000_orgs_and_invites.sql` (after section 23).
2. Deploy the function that emails people you share with or invite:
   ```bash
   npx supabase functions deploy notify-email
   ```
   It uses the same email settings as the sign-in codes (section 22) and `APP_URL` for the link in the email.

Then:

- **Account → Organization**: create one, invite people by email (with or without an account yet – they accept in their
  Inbox), make members admins, or switch on **Only share inside the organization**.
- Sharing with someone **in** your organization applies at once. Sharing with someone **outside** starts as an
  invitation: they see nothing until they press **Accept** in their Inbox (or **Decline**). The share dialog shows
  "invited · waiting to accept" meanwhile, and you are told when they answer.
- Everyone gets an Inbox notification and an email when something is shared with them. Existing shares are not changed.

## 25. Error log, email and sign-in limits, organization integrity

1. **SQL Editor → New query**, in this order:
   `supabase/migrations/20261115000000_client_errors.sql`, `20261116000000_auth_limits.sql`, `20261117000000_org_integrity.sql`.
2. Redeploy the functions that changed:
   ```bash
   npx supabase functions deploy send-login-code
   ```
   ```bash
   npx supabase functions deploy verify-login-code
   ```
   ```bash
   npx supabase functions deploy notify-email
   ```
   ```bash
   npx supabase functions deploy push-approve
   ```
   ```bash
   npx supabase functions deploy daily-digest --no-verify-jwt
   ```
3. Optional secrets: `MAIL_DAILY_LIMIT` (default 200, Mailjet free) and `MAIL_RESERVE` (default 60 – kept for sign-in codes).

What it does:

- **Crashes**: a page that fails shows "Something went wrong here" with Try again / Reload instead of a blank app; after a
  new deployment an old open page offers "Reload". Errors are stored cleaned (no emails, tokens, keys or query values)
  in `client_errors` – at most 30 per user an hour, kept 30 days – visible only in the Supabase **Table editor**.
- **Limits**: sign-in codes at most 8 an hour / 20 a day per account; 10 wrong codes in 15 minutes pause code sign-in
  for 15 minutes (authenticator app, phone approval and password reset still work); phone prompts at most 10 an hour;
  share emails 30 a day per sender and 3 to the same person; share and daily emails stop before the part of the daily
  email budget kept for sign-in codes. Addresses are stored only as salted hashes and never written to the logs.
- **Organizations**: leaving or being removed unshares only what was shared *because of* the organization (direct and
  outside shares stay); deleting the only admin's account makes the longest-standing member admin; two admins cannot
  remove each other's admin role at the same moment.
