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
```

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
