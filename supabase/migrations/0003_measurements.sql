-- =====================================================================
-- ORTECH OS — 0003: Digital Measurement Book (DMB)
-- Each measurement is one continuous stretch of work, recorded once by
-- the supervisor. Everything else (progress, maps, dashboard, billing
-- sheet) is generated from these rows. A daily pulse references many
-- measurements via measurements.pulse_id (many → one).
-- =====================================================================

create table if not exists public.measurements (
  id                  uuid primary key,
  project_id          text not null references public.projects(id) on delete cascade,
  supervisor_name     text,
  work_date           date not null,
  landmark            text,
  chainage_from       numeric not null,
  chainage_to         numeric not null,
  depth_cm            numeric,
  actual_length_m     numeric not null,
  payable_length_m    numeric not null,
  strata              text not null default 'non_rocky',
  measurement_type    text not null default 'normal_trenching',
  payable_items       jsonb not null default '[]'::jsonb,
  remarks             text,
  photo_names         jsonb not null default '[]'::jsonb,
  gps                 jsonb,
  verification_status text not null default 'submitted',
  pulse_id            uuid references public.pulses(id) on delete set null,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  constraint measurements_range check (chainage_to >= chainage_from)
);

create index if not exists measurements_project_idx on public.measurements (project_id, work_date);
create index if not exists measurements_pulse_idx on public.measurements (pulse_id);

-- --- RLS: mirrors pulses (admins full; supervisors read + append own sites)
alter table public.measurements enable row level security;

drop policy if exists measurements_admin_all on public.measurements;
create policy measurements_admin_all on public.measurements
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists measurements_supervisor_read on public.measurements;
create policy measurements_supervisor_read on public.measurements
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

drop policy if exists measurements_supervisor_insert on public.measurements;
create policy measurements_supervisor_insert on public.measurements
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.supervisor_name = public.my_supervisor_name()
    )
  );

-- --- Realtime
do $$ begin
  alter publication supabase_realtime add table public.measurements;
exception when duplicate_object then null; end $$;
