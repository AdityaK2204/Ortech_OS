# ORTECH OS — Supabase Backend Setup

The app runs in **two modes**:

- **Local mode** (default, no setup) — all data lives in `localStorage`. Everything works offline; nothing to configure.
- **Supabase mode** — once you add your project's URL + anon key to `.env`, the app switches to a real **PostgreSQL + Auth + RLS + Realtime** backend automatically.

This is the "incremental, keep app working" contract: the app never breaks while the backend is being provisioned.

---

## What you need to do (one-time)

### 1. Create a Supabase project
- Go to <https://supabase.com> → **New project**. Pick a name, a strong DB password, and a region near you.
- Wait for it to finish provisioning (~2 min).

### 2. Grab your keys
Project → **Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret — only used by the seed script, never shipped to the browser)

Copy `.env.example` → `.env` and paste them in.

### 3. Create the schema
Open **SQL Editor** in the Supabase dashboard and run every file in
[`supabase/migrations/`](supabase/migrations/) **in order**, one at a time:

| File | What it does |
|---|---|
| `0001_init.sql` | `profiles`, `projects`, `pulses`, RLS, sign-up → profile trigger |
| `0002_admin_users.sql` | `active` flag + admin edits of profiles |
| `0003_measurements.sql` | Digital Measurement Book |
| `0004_accountant_role.sql` | adds the `accountant` role (run **alone**) |
| `0005_accounts.sql` | expense claims, approvals, disbursements, Tally log |
| `0006_security_hardening.sql` | locks roles / site assignment, enforces `active`, forces new claims to `submitted`, creates the private `site-photos` Storage bucket |

_(CLI alternative: `npx supabase link` then `npx supabase db push`.)_

### 3b. Turn off public sign-up (required)
**Authentication → Sign In / Providers → Email → disable “Allow new users to sign up”.**
The app has no sign-up screen; accounts are created by a director (Users page →
Invite, via the `admin-users` Edge Function) or in **Authentication → Users → Add user**.
Even if sign-up were left on, 0006 makes every new account an *inactive supervisor
with no site* until a director sets its role/site and clicks **Enable**.

### 4. Seed demo data
```bash
npm run db:seed
```
Creates the login accounts and loads the 6 demo sites. Output prints the emails +
the shared password (default `ortech123`, override with `SEED_PASSWORD`).

- **Admin:** `admin@ortech.os`
- **Supervisors:** one per site supervisor, e.g. `manoj.reddy@ortech.os`

### 5. Restart the dev server
```bash
npm run dev
```
Vite reads `.env` at startup, so a restart is required. The login screen now
authenticates against Supabase, and every read/write goes through Postgres with
RLS enforced.

---

## How it maps to the app

| App concept            | Backend                                                            |
|------------------------|-------------------------------------------------------------------|
| Login / role           | Supabase Auth + `profiles.role` (admin / supervisor / accountant), set only by a director |
| Disabled accounts      | `profiles.active = false` → signed out, every RLS helper returns false |
| Photo evidence         | private Storage bucket `site-photos`, path `<project>/<kind>/<date>/<id>.jpg` |
| "Supervisor sees only their sites" | RLS: `projects.supervisor_name = my_supervisor_name()` |
| Project config + edits | `projects` row (JSONB for tasks/route/team/finance/schedule)     |
| Daily progress updates | `pulses` (append-only; supervisors can INSERT, never UPDATE/DELETE) |
| Live progress          | pulses replayed over the project config (same as local mode)      |
| Multi-user sync        | Supabase Realtime on `projects` + `pulses`                        |

## Security notes
- The **anon key is safe in the browser** — RLS is what protects the data.
- The **service_role key bypasses RLS** — keep it out of the frontend and out of git (`.env` is gitignored).
- Users can edit only their own display name. Role, site assignment (`supervisor_name`) and `active` can be changed only by an active director (DB trigger `profiles_guard_update`); a director cannot remove their own admin access.
- New expense claims are always stored as `submitted`, authored by the caller, with no flags — whatever the client sends. Supervisors' measurements are always `submitted` (verification is a director's action).
- Photos are downscaled on the phone (max 1600 px) and uploaded to `site-photos`. Only that site's supervisor or a director can upload; directors, accountants and that supervisor can view (via 1-hour signed URLs). There are no update/delete policies — evidence is append-only. Records created before 0006 only hold file names.
- **After applying 0006, check the Users page** for anyone whose role or site looks wrong — before 0006 any user could have changed their own.
