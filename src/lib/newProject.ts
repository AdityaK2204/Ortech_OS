import type {
  NewProjectInput,
  PointMark,
  Project,
  SchedulePoint,
  Task,
  Worker,
} from '../types';

// Task accents — kept in sync with the seed data palette (mockData.ts).
const COLORS = {
  trenching: '#f59e0b',
  pipe: '#3b82f6',
  refill: '#8b5cf6',
  cable: '#ec4899',
  chamber: '#0d9488',
  splice: '#f43f5e',
  marker: '#64748b',
};

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24);
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 4)
      : String(Date.now()).slice(-4);
  return `${base || 'site'}-${suffix}`;
}

/** Evenly spread `total` pending point installations along the route. */
function spreadPoints(total: number, length: number): PointMark[] {
  if (total <= 0) return [];
  const gap = length / (total + 1);
  return Array.from({ length: total }, (_, i) => ({
    chainage: Math.round(gap * (i + 1)),
    done: false,
  }));
}

/** The standard 7-task set, all starting empty (0% complete). */
function standardTasks(
  length: number,
  targets: { chamber: number; splice: number; marker: number }
): Task[] {
  return [
    { id: 't1', name: 'Trenching', type: 'linear', unit: 'm', color: COLORS.trenching, segments: [] },
    { id: 't2', name: 'Pipe Laying', type: 'linear', unit: 'm', color: COLORS.pipe, segments: [] },
    { id: 't3', name: 'Refilling / Closing', type: 'linear', unit: 'm', color: COLORS.refill, segments: [] },
    { id: 't4', name: 'Cable Pulling', type: 'linear', unit: 'm', color: COLORS.cable, segments: [] },
    { id: 't5', name: 'Chamber Installation', type: 'point', unit: 'nos', color: COLORS.chamber, targetCount: targets.chamber, points: spreadPoints(targets.chamber, length) },
    { id: 't6', name: 'Splicing', type: 'point', unit: 'nos', color: COLORS.splice, targetCount: targets.splice, points: spreadPoints(targets.splice, length) },
    { id: 't7', name: 'Route Marker Installation', type: 'point', unit: 'nos', color: COLORS.marker, targetCount: targets.marker, points: spreadPoints(targets.marker, length) },
  ];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A projected-vs-actual trendline for a brand-new project: projected rises
 * linearly from start → deadline, but we only emit points up to *today* (actual
 * still 0). A future-dated project yields a single 0/0 point; a back-dated one
 * shows real lag. Aligns with leadLag(), which reads the latest point.
 */
function initialSchedule(startDate: string, endDate: string): SchedulePoint[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const totalWeeks = Math.max(1, Math.round((end - start) / WEEK_MS));
  const anchor = Math.min(Math.max(now, start), end);
  const elapsedWeeks = Math.max(0, Math.round((anchor - start) / WEEK_MS));

  const points: SchedulePoint[] = [];
  for (let w = 0; w <= elapsedWeeks; w++) {
    points.push({
      day: `W${w}`,
      projectedPct: Math.min(100, Math.round((w / totalWeeks) * 100)),
      actualPct: 0,
    });
  }
  return points.length ? points : [{ day: 'W0', projectedPct: 0, actualPct: 0 }];
}

function defaultRoute(coords: [number, number][]): [number, number][] {
  if (coords.length >= 2) return coords;
  // fallback: a short line near the geographic centre of India
  return [
    [78.9, 20.6],
    [78.92, 20.61],
  ];
}

/** Build a full Project from the admin's create-project form input. */
export function createProject(input: NewProjectInput): Project {
  const len = input.totalLengthMeters;
  const nowISO = new Date().toISOString();

  const workers: Worker[] = input.members
    .filter((m) => m.name.trim())
    .map((m) => ({
      name: m.name.trim(),
      trade: m.role === 'Labour' ? m.trade?.trim() || 'Labour' : m.role,
      count: Math.max(1, m.count || 1),
    }));

  const bucket = (value: number, qty: number) => ({
    projectedValue: value,
    actualValue: 0,
    projectedQty: qty,
    actualQty: 0,
    unit: 'm',
  });

  return {
    id: slugify(input.name),
    name: input.name.trim(),
    client: input.client.trim(),
    location: input.location.trim(),
    cluster: input.cluster.trim() || 'Unassigned',
    difficulty: input.difficulty,
    totalLengthMeters: len,
    route: {
      id: `route-${slugify(input.name)}`,
      source: 'hand_drawn',
      geometry: { type: 'LineString', coordinates: defaultRoute(input.routeCoords) },
    },
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'on_track', // fresh plan; status evolves as pulses arrive
    lastUpdate: nowISO,
    tasks: standardTasks(len, input.pointTargets),
    team: {
      supervisor: {
        name: input.supervisor.name.trim(),
        phone: input.supervisor.phone.trim(),
        adherencePct: 100,
      },
      siteEngineer: {
        name: input.siteEngineer.name.trim(),
        phone: input.siteEngineer.phone.trim(),
      },
      workers,
    },
    machines: [...input.machines],
    finance: {
      currency: '₹',
      contractValue: input.finance.contractValue,
      day: bucket(input.finance.dayBudget, input.finance.dayTargetM),
      week: bucket(input.finance.weekBudget, input.finance.weekTargetM),
      month: bucket(input.finance.monthBudget, input.finance.monthTargetM),
    },
    schedule: initialSchedule(input.startDate, input.endDate),
  };
}
