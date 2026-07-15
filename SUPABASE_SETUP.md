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
Open **SQL Editor** in the Supabase dashboard, paste the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and **Run**.
This creates the `profiles`, `projects`, and `pulses` tables, all RLS policies,
the signup→profile trigger, and enables Realtime.

_(CLI alternative: `npx supabase link` then `npx supabase db push`.)_

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
| Login / role           | Supabase Auth + `profiles.role` (admin / supervisor)              |
| "Supervisor sees only their sites" | RLS: `projects.supervisor_name = my_supervisor_name()` |
| Project config + edits | `projects` row (JSONB for tasks/route/team/finance/schedule)     |
| Daily progress updates | `pulses` (append-only; supervisors can INSERT, never UPDATE/DELETE) |
| Live progress          | pulses replayed over the project config (same as local mode)      |
| Multi-user sync        | Supabase Realtime on `projects` + `pulses`                        |

## Security notes
- The **anon key is safe in the browser** — RLS is what protects the data.
- The **service_role key bypasses RLS** — keep it out of the frontend and out of git (`.env` is gitignored).
- Photo upload to Supabase Storage is a follow-up (the app currently records photo file names only).
