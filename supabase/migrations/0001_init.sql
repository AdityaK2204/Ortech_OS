-- =====================================================================
-- ORTECH OS — initial schema, RLS, auth wiring
-- Run this in the Supabase SQL Editor (or `supabase db push`) for a new
-- project. Model mirrors the frontend domain types:
--   projects  = current site CONFIG (tasks carry baseline segments/points)
--   pulses    = append-only supervisor progress events (replayed on top)
-- =====================================================================

-- --- enums ------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'supervisor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type site_status as enum ('on_track', 'at_risk', 'behind', 'on_hold');
exception when duplicate_object then null; end $$;

-- --- profiles (1:1 with auth.users) -----------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  role            user_role not null default 'supervisor',
  supervisor_name text,          -- links a supervisor to projects.supervisor_name
  created_at      timestamptz not null default now()
);

-- --- projects (site config) -------------------------------------------
create table if not exists public.projects (
  id              text primary key,
  name            text not null,
  client          text,
  location        text,
  cluster         text,
  difficulty      text not null default 'medium',
  status          site_status not null default 'on_track',
  total_length_m  integer not null default 0,
  supervisor_name text,          -- team.supervisor.name, drives supervisor RLS
  start_date      date,
  end_date        date,
  route           jsonb not null default '{}'::jsonb,
  tasks           jsonb not null default '[]'::jsonb,
  team            jsonb not null default '{}'::jsonb,
  machines        jsonb not null default '[]'::jsonb,
  finance         jsonb not null default '{}'::jsonb,
  schedule        jsonb not null default '[]'::jsonb,
  last_update     timestamptz not null default now(),
  is_seed         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists projects_supervisor_idx on public.projects (supervisor_name);

-- --- pulses (append-only progress events) -----------------------------
create table if not exists public.pulses (
  id              uuid primary key default gen_random_uuid(),
  project_id      text not null references public.projects(id) on delete cascade,
  pulse_date      date not null,
  submitted_at    timestamptz not null default now(),
  supervisor_name text,
  entries         jsonb not null default '[]'::jsonb,
  diesel_l        numeric,
  issue_flag      text not null default 'none',
  note            text,
  photo_names     jsonb not null default '[]'::jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists pulses_project_idx on public.pulses (project_id);

-- --- helper functions (security definer, so RLS can call them) ---------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_supervisor_name()
returns text language sql stable security definer set search_path = public as $$
  select supervisor_name from public.profiles where id = auth.uid();
$$;

-- --- auto-create a profile whenever a user signs up -------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, supervisor_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'supervisor'),
    new.raw_user_meta_data ->> 'supervisor_name'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- keep updated_at fresh on project edits ---------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.pulses   enable row level security;

-- profiles: read your own (admins read all); update your own
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid());

-- projects: admins full CRUD; supervisors read only their own sites
drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists projects_supervisor_read on public.projects;
create policy projects_supervisor_read on public.projects
  for select using (supervisor_name = public.my_supervisor_name());

-- pulses: admins full; supervisors read + INSERT for their sites (append-only)
drop policy if exists pulses_admin_all on public.pulses;
create policy pulses_admin_all on public.pulses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pulses_supervisor_read on public.pulses;
create policy pulses_supervisor_read on public.pulses
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

drop policy if exists pulses_supervisor_insert on public.pulses;
create policy pulses_supervisor_insert on public.pulses
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

-- =====================================================================
-- Realtime — stream project edits + new pulses to connected clients
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.pulses;
exception when duplicate_object then null; end $$;
