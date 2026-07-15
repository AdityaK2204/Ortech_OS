-- =====================================================================
-- ORTECH OS — 0002: admin user management
-- Adds an `active` flag and lets admins read/update every profile
-- (role assignment, supervisor identity, enable/disable) via RLS.
-- Run in the Supabase SQL Editor after 0001_init.sql.
-- =====================================================================

alter table public.profiles
  add column if not exists active boolean not null default true;

-- Admins may update any profile (role, supervisor_name, active).
-- (Self-update policy from 0001 remains for a user editing their own row.)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- profiles_read from 0001 already lets admins select all rows.
