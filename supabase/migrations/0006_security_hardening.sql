-- =====================================================================
-- ORTECH OS — 0006: security hardening
-- Run in the Supabase SQL Editor after 0005_accounts.sql.
--
-- Closes these holes:
--   1. Users could change their own role (e.g. supervisor → admin): the
--      profiles self-update policy allowed every column, and the sign-up
--      trigger trusted the role sent by the client.
--   2. Users could pick or edit their own supervisor_name and thereby
--      read another supervisor's sites, money and measurements.
--   3. Supervisors could insert expense claims already 'approved' (or
--      measurements already 'verified'), skipping review.
--   4. The `active` flag was never enforced: disabled users kept access.
--   5. Photos were never stored — adds a private Storage bucket with
--      per-site access rules.
--
-- "Privileged" below means: a director (is_admin) OR a request with no
-- user at all (auth.uid() is null), i.e. the service-role key used by the
-- admin-users Edge Function / seed script, or the SQL Editor itself.
-- =====================================================================

-- --- 4. helper functions now require an ACTIVE profile -------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_accountant()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'accountant' and active
  );
$$;

-- Only an active SUPERVISOR has a supervisor identity. (An admin or
-- accountant row that happens to carry a supervisor_name gets nothing
-- extra from it.)
create or replace function public.my_supervisor_name()
returns text language sql stable security definer set search_path = public as $$
  select supervisor_name from public.profiles
  where id = auth.uid() and role = 'supervisor' and active;
$$;

-- --- 1/2. sign-up never trusts client-supplied role / site identity -------
-- Every new auth user starts as an INACTIVE supervisor with no site. A
-- director (Users page) or the admin-users Edge Function sets the real
-- role, supervisor identity and activates the account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, supervisor_name, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'supervisor',
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- --- 1/2. users may edit only their own display name ----------------------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    -- A director may not demote or disable themselves (prevents locking
    -- the company out of its own admin screens by accident).
    if auth.uid() = old.id and (new.role <> 'admin' or not new.active) then
      raise exception 'You cannot remove your own admin access';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.supervisor_name is distinct from old.supervisor_name
     or new.active is distinct from old.active
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Only a director can change role, site assignment or account status';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Profiles are created only by the sign-up trigger (security definer), so
-- nobody needs an INSERT policy; make sure none exists.
drop policy if exists profiles_insert on public.profiles;

-- --- 3. server decides status / authorship on every insert ----------------
-- Expense claims: a new claim is ALWAYS 'submitted', authored by the
-- caller, under the caller's own supervisor identity, with no flags. The
-- name sorts before transactions_dup_flag so the duplicate check still
-- runs afterwards and can set flagged_duplicate.
create or replace function public.guard_txn_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / SQL editor
  new.status                 := 'submitted';
  new.submitted_by           := auth.uid();
  new.supervisor_name        := coalesce(public.my_supervisor_name(), new.supervisor_name);
  new.flagged_duplicate      := false;
  new.flagged_diesel_anomaly := false;
  new.reversal_of            := null;
  new.submitted_at           := now();
  return new;
end $$;

drop trigger if exists transactions_00_guard on public.transactions;
create trigger transactions_00_guard before insert on public.transactions
  for each row execute function public.guard_txn_insert();

-- Measurements: supervisors can only ever submit; verification is a
-- director's action.
create or replace function public.guard_measurement_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.verification_status := 'submitted';
  new.created_by          := auth.uid();
  new.supervisor_name     := coalesce(public.my_supervisor_name(), new.supervisor_name);
  new.created_at          := now();
  -- a measurement may only be linked to a pulse of the same project
  if new.pulse_id is not null and not exists (
    select 1 from public.pulses pu
    where pu.id = new.pulse_id and pu.project_id = new.project_id
  ) then
    new.pulse_id := null;
  end if;
  return new;
end $$;

drop trigger if exists measurements_guard_insert on public.measurements;
create trigger measurements_guard_insert before insert on public.measurements
  for each row execute function public.guard_measurement_insert();

-- Pulses: authorship and timestamps come from the server.
create or replace function public.guard_pulse_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.created_by      := auth.uid();
  new.supervisor_name := coalesce(public.my_supervisor_name(), new.supervisor_name);
  new.submitted_at    := now();
  new.created_at      := now();
  return new;
end $$;

drop trigger if exists pulses_guard_insert on public.pulses;
create trigger pulses_guard_insert before insert on public.pulses
  for each row execute function public.guard_pulse_insert();

-- Tally export log: record who actually requested it.
create or replace function public.guard_tally_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.requested_by := auth.uid();
    new.generated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists tally_exports_guard_insert on public.tally_exports;
create trigger tally_exports_guard_insert before insert on public.tally_exports
  for each row execute function public.guard_tally_insert();

-- --- 5. photo evidence: private Storage bucket -----------------------------
-- Object path convention:  <project_id>/<kind>/<yyyy-mm-dd>/<uuid>.<ext>
--   kind = measurements | pulses | bills
-- Upload: directors, or the active supervisor assigned to that project.
-- Read:   directors, accountants, or that project's supervisor.
-- No update / delete policies: photo evidence is append-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', false, 10485760, array['image/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_project(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and p.supervisor_name = public.my_supervisor_name()
  );
$$;

drop policy if exists site_photos_insert on storage.objects;
create policy site_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'site-photos'
    and (
      public.is_admin()
      or public.can_access_project((storage.foldername(name))[1])
    )
  );

drop policy if exists site_photos_read on storage.objects;
create policy site_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'site-photos'
    and (
      public.is_admin()
      or public.is_accountant()
      or public.can_access_project((storage.foldername(name))[1])
    )
  );
