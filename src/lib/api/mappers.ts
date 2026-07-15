import type { DailyPulse, Measurement, Project } from '../../types';

// ---------------------------------------------------------------------------
// Translate between DB rows (snake_case columns + JSONB) and the frontend
// domain types (camelCase). Kept in one place so the schema and the app can
// evolve independently.
// ---------------------------------------------------------------------------

/** Shape of a `public.projects` row as returned by supabase-js. */
export interface ProjectRow {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  cluster: string | null;
  difficulty: string;
  status: string;
  total_length_m: number;
  supervisor_name: string | null;
  start_date: string | null;
  end_date: string | null;
  route: Project['route'];
  tasks: Project['tasks'];
  team: Project['team'];
  machines: Project['machines'];
  finance: Project['finance'];
  schedule: Project['schedule'];
  last_update: string;
  is_seed: boolean;
}

export function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    client: r.client ?? '',
    location: r.location ?? '',
    cluster: r.cluster ?? '',
    difficulty: (r.difficulty as Project['difficulty']) ?? 'medium',
    status: (r.status as Project['status']) ?? 'on_track',
    totalLengthMeters: r.total_length_m,
    route: r.route,
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? '',
    lastUpdate: r.last_update,
    tasks: r.tasks ?? [],
    team: r.team,
    machines: r.machines ?? [],
    finance: r.finance,
    schedule: r.schedule ?? [],
  };
}

/** Domain Project → a row payload for insert/update (id kept). */
export function projectToRow(p: Project, isSeed = false): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    client: p.client,
    location: p.location,
    cluster: p.cluster,
    difficulty: p.difficulty,
    status: p.status,
    total_length_m: p.totalLengthMeters,
    supervisor_name: p.team.supervisor.name,
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    route: p.route,
    tasks: p.tasks,
    team: p.team,
    machines: p.machines,
    finance: p.finance,
    schedule: p.schedule,
    last_update: p.lastUpdate,
    is_seed: isSeed,
  };
}

/** Shape of a `public.pulses` row. */
export interface PulseRow {
  id: string;
  project_id: string;
  pulse_date: string;
  submitted_at: string;
  supervisor_name: string | null;
  entries: DailyPulse['entries'];
  diesel_l: number | null;
  issue_flag: string;
  note: string | null;
  photo_names: string[];
}

export function rowToPulse(r: PulseRow): DailyPulse {
  return {
    id: r.id,
    projectId: r.project_id,
    date: r.pulse_date,
    submittedAt: r.submitted_at,
    supervisorName: r.supervisor_name ?? '',
    entries: r.entries ?? [],
    dieselL: r.diesel_l ?? undefined,
    issueFlag: (r.issue_flag as DailyPulse['issueFlag']) ?? 'none',
    note: r.note ?? undefined,
    photoNames: r.photo_names ?? [],
  };
}

/** Domain pulse → row payload for insert. */
export function pulseToRow(p: DailyPulse): Record<string, unknown> {
  return {
    id: p.id,
    project_id: p.projectId,
    pulse_date: p.date,
    submitted_at: p.submittedAt,
    supervisor_name: p.supervisorName,
    entries: p.entries,
    diesel_l: p.dieselL ?? null,
    issue_flag: p.issueFlag,
    note: p.note ?? null,
    photo_names: p.photoNames,
  };
}

/** Shape of a `public.measurements` row. */
export interface MeasurementRow {
  id: string;
  project_id: string;
  supervisor_name: string | null;
  work_date: string;
  landmark: string | null;
  chainage_from: number;
  chainage_to: number;
  depth_cm: number | null;
  actual_length_m: number;
  payable_length_m: number;
  strata: string;
  measurement_type: string;
  payable_items: Measurement['payableItems'];
  remarks: string | null;
  photo_names: string[];
  gps: Measurement['gps'] | null;
  verification_status: string;
  pulse_id: string | null;
  created_at: string;
}

export function rowToMeasurement(r: MeasurementRow): Measurement {
  return {
    id: r.id,
    projectId: r.project_id,
    supervisorName: r.supervisor_name ?? '',
    date: r.work_date,
    landmark: r.landmark ?? undefined,
    chainageFrom: r.chainage_from,
    chainageTo: r.chainage_to,
    depthCm: r.depth_cm ?? undefined,
    actualLengthM: r.actual_length_m,
    payableLengthM: r.payable_length_m,
    strata: (r.strata as Measurement['strata']) ?? 'non_rocky',
    measurementType:
      (r.measurement_type as Measurement['measurementType']) ?? 'normal_trenching',
    payableItems: r.payable_items ?? [],
    remarks: r.remarks ?? undefined,
    photoNames: r.photo_names ?? [],
    gps: r.gps ?? undefined,
    verificationStatus:
      (r.verification_status as Measurement['verificationStatus']) ?? 'submitted',
    pulseId: r.pulse_id ?? undefined,
    createdAt: r.created_at,
  };
}

/** Domain measurement → row payload for insert. */
export function measurementToRow(m: Measurement): Record<string, unknown> {
  return {
    id: m.id,
    project_id: m.projectId,
    supervisor_name: m.supervisorName,
    work_date: m.date,
    landmark: m.landmark ?? null,
    chainage_from: m.chainageFrom,
    chainage_to: m.chainageTo,
    depth_cm: m.depthCm ?? null,
    actual_length_m: m.actualLengthM,
    payable_length_m: m.payableLengthM,
    strata: m.strata,
    measurement_type: m.measurementType,
    payable_items: m.payableItems,
    remarks: m.remarks ?? null,
    photo_names: m.photoNames,
    gps: m.gps ?? null,
    verification_status: m.verificationStatus,
    pulse_id: m.pulseId ?? null,
    created_at: m.createdAt,
  };
}
