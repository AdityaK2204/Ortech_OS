// ---------------------------------------------------------------------------
// ORTECH OS — domain types for the management dashboard prototype.
// Linear-infrastructure work is measured against the physical LENGTH of a route
// (chainage, in meters). A task is either "linear" (spans of completed meters)
// or "point" (discrete installations at specific chainages).
// ---------------------------------------------------------------------------

export type SiteStatus = 'on_track' | 'at_risk' | 'behind' | 'on_hold';

export type TaskType = 'linear' | 'point';

/** A geographic coordinate. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * A site's route as GeoJSON — the real import contract. Today's data is
 * `hand_drawn`; the same shape later carries KML/KMZ/GPS/GIS survey exports
 * without a schema change. Note GeoJSON coordinates are [lng, lat] pairs.
 */
export interface RouteGeometry {
  id: string;
  source: 'hand_drawn' | 'kml' | 'kmz' | 'gps' | 'gis';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat]
  };
}

/** Operational state of a stretch of route (drives the map color). */
export type RouteState =
  | 'not_started'
  | 'completed'
  | 'worked_today'
  | 'awaiting'
  | 'blocked';

/** A completed span along the route, in meters (e.g. trenched 0 → 200). */
export interface Segment {
  start: number;
  end: number;
}

/** A discrete installation at a chainage (e.g. a chamber or splice at 350 m). */
export interface PointMark {
  chainage: number;
  done: boolean;
  label?: string;
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  unit: string; // 'm' for linear, 'nos' for point tasks
  color: string; // tailwind-friendly hex accent for this task's bar
  /** linear tasks: completed spans (there may be gaps between them) */
  segments?: Segment[];
  /** linear tasks: spans executed via HDD (trenchless) — overlaid on the track */
  hddSegments?: Segment[];
  /** point tasks: installations placed along the route */
  points?: PointMark[];
  /** point tasks: total number planned across the route */
  targetCount?: number;
}

export interface Worker {
  name: string;
  trade: string;
  count: number;
}

export interface TeamInfo {
  supervisor: { name: string; phone: string; adherencePct: number };
  siteEngineer: { name: string; phone: string };
  workers: Worker[];
}

export interface MachineAssignment {
  id: string;
  type: string;
  assignedSince: string; // ISO date
  dieselTodayL: number;
  dieselBaselineL: number;
  utilizationPct: number;
  status: 'active' | 'idle' | 'maintenance';
}

export interface FinanceBucket {
  projectedValue: number; // planned work value for the period (₹)
  actualValue: number; // achieved work value (₹)
  projectedQty: number; // planned quantity for the period
  actualQty: number; // achieved quantity
  unit: string;
}

export interface Finance {
  currency: string;
  day: FinanceBucket;
  week: FinanceBucket;
  month: FinanceBucket;
  contractValue: number;
}

/** One point on the projected-vs-actual cumulative-progress trendline. */
export interface SchedulePoint {
  day: string; // short label, e.g. "W1", "Jun 3"
  projectedPct: number;
  actualPct: number;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  cluster: string;
  difficulty: 'easy' | 'medium' | 'hard';
  totalLengthMeters: number;
  route: RouteGeometry; // geographic path (chainage 0 → total length)
  startDate: string;
  endDate: string;
  status: SiteStatus;
  lastUpdate: string; // ISO datetime of last daily pulse
  tasks: Task[];
  team: TeamInfo;
  machines: MachineAssignment[];
  finance: Finance;
  schedule: SchedulePoint[];
}

// --- Daily Pulse (supervisor progress reports) -----------------------------

export type IssueFlag =
  | 'none'
  | 'manpower'
  | 'machine'
  | 'material'
  | 'weather'
  | 'client'
  | 'other';

/** One line of work reported in a daily pulse. */
export interface DailyPulseEntry {
  taskId: string;
  taskName: string;
  /** linear tasks: metre range completed today */
  fromM?: number;
  toM?: number;
  /** linear tasks: whether this span was executed via HDD (trenchless) */
  usedHdd?: boolean;
  hddFromM?: number;
  hddToM?: number;
  /** point tasks: how many installed today */
  count?: number;
}

/** An immutable, append-only daily progress report from a supervisor. */
export interface DailyPulse {
  id: string;
  projectId: string;
  date: string; // YYYY-MM-DD (work date)
  submittedAt: string; // ISO datetime
  supervisorName: string;
  entries: DailyPulseEntry[];
  dieselL?: number;
  issueFlag: IssueFlag;
  note?: string;
  photoNames: string[];
}

/** Shape submitted by the update form (id/timestamp added by the store). */
export type DailyPulseInput = Omit<DailyPulse, 'id' | 'submittedAt'>;

// --- Digital Measurement Book (DMB) -----------------------------------------
// One measurement = one continuous stretch of work, recorded ONCE by the
// supervisor on site. Progress, maps, DPR and the Joint Measurement Sheet are
// all generated from these — the single source of truth.

export type Strata = 'non_rocky' | 'dry_rocky' | 'hard_rock' | 'hdd';

export type MeasurementType =
  | 'normal_trenching'
  | 'hdd_crossing'
  | 'culvert'
  | 'road_crossing'
  | 'bridge_crossing'
  | 'chamber_work'
  | 'restoration'
  | 'other';

/** Extra payable items that can coexist on one stretch (JMS columns). */
export type PayableItem =
  | 'plb'
  | 'blowing'
  | 'cc'
  | 'dwc'
  | 'gi'
  | 'chamber'
  | 'route_marker'
  | 'fdms_df'
  | 'gravel'
  | 'wbm'
  | 'asphalt'
  | 'others';

/** One measurement card — a continuous stretch of work on one date. */
export interface Measurement {
  id: string;
  projectId: string;
  supervisorName: string;
  date: string; // YYYY-MM-DD (work date)
  landmark?: string;
  chainageFrom: number;
  chainageTo: number;
  depthCm?: number;
  /** chainageTo − chainageFrom, computed — never typed by the supervisor */
  actualLengthM: number;
  payableLengthM: number;
  strata: Strata;
  measurementType: MeasurementType;
  payableItems: PayableItem[];
  remarks?: string;
  photoNames: string[];
  gps?: { lat: number; lng: number; accuracyM?: number };
  verificationStatus: 'draft' | 'submitted' | 'verified';
  /** the daily pulse this measurement was submitted under (set on Submit Day) */
  pulseId?: string;
  createdAt: string; // ISO datetime
}

/** Shape captured by the DMB form (id/timestamps added by the store). */
export type MeasurementInput = Omit<Measurement, 'id' | 'createdAt' | 'pulseId'>;

// --- Project creation (admin) ----------------------------------------------

export type TeamRole = 'Supervisor' | 'Site Engineer' | 'Labour';

export interface NewProjectMember {
  role: TeamRole;
  name: string;
  count: number; // 1 for a named person, >1 for a crew
  trade?: string; // free-text trade for Labour rows (e.g. "Excavation")
}

/** Everything the admin fills in to create a new site. */
export interface NewProjectInput {
  name: string;
  client: string;
  location: string;
  cluster: string;
  difficulty: 'easy' | 'medium' | 'hard';
  totalLengthMeters: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (expected deadline)
  /** GeoJSON [lng,lat] vertices drawn on the map (may be empty) */
  routeCoords: [number, number][];
  /** planned counts for the point tasks */
  pointTargets: { chamber: number; splice: number; marker: number };
  supervisor: { name: string; phone: string };
  siteEngineer: { name: string; phone: string };
  members: NewProjectMember[];
  machines: MachineAssignment[];
  finance: {
    contractValue: number;
    dayBudget: number;
    weekBudget: number;
    monthBudget: number;
    dayTargetM: number;
    weekTargetM: number;
    monthTargetM: number;
  };
}

/**
 * Editable fields of an existing project (admin edit flow). Applied as a patch
 * on top of the seed/created project BEFORE the pulse log is replayed, so live
 * supervisor-driven progress is never disturbed. Progress metres / installed
 * counts are intentionally NOT here — those come only from daily pulses.
 */
export interface ProjectPatch {
  name?: string;
  client?: string;
  location?: string;
  cluster?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  totalLengthMeters?: number;
  startDate?: string;
  endDate?: string;
  status?: SiteStatus;
  route?: RouteGeometry;
  team?: TeamInfo;
  machines?: MachineAssignment[];
  finance?: Finance;
  /** taskId → new target count for point tasks */
  pointTargets?: Record<string, number>;
}
