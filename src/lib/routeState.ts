import type {
  DailyPulse,
  LatLng,
  Project,
  RouteState,
  Segment,
  Task,
} from '../types';
import { mergeSegments } from './progress';
import { sliceByFraction, toLatLngPath } from './geo';

// Canonical operational palette — the whole point of the geographic view.
export const STATE_COLORS: Record<RouteState, string> = {
  not_started: '#94a3b8', // gray
  completed: '#16a34a', // green
  worked_today: '#2563eb', // blue
  awaiting: '#f59e0b', // amber
  blocked: '#dc2626', // red
};

export const STATE_LABELS: Record<RouteState, string> = {
  not_started: 'Not started',
  completed: 'Completed',
  worked_today: 'Worked today',
  awaiting: 'Awaiting next activity',
  blocked: 'Blocked',
};

export const HDD_COLOR = '#0f172a';

export interface RouteOverlay {
  path: LatLng[];
  color: string;
  state: RouteState;
  dashed?: boolean;
  fromM: number;
  toM: number;
  label: string;
}

export interface RouteRender {
  overlays: RouteOverlay[];
  workFrontM: number | null;
  todayMeters: number;
  blocked: boolean;
}

// --- interval math on metre spans ------------------------------------------

function clampSpans(spans: Segment[], total: number): Segment[] {
  return mergeSegments(
    spans
      .map((s) => ({ start: Math.max(0, s.start), end: Math.min(total, s.end) }))
      .filter((s) => s.end > s.start)
  );
}

/** base minus cut (both assumed merged, sorted). */
function subtract(base: Segment[], cut: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const b of base) {
    let cursor = b.start;
    for (const c of cut) {
      if (c.end <= cursor || c.start >= b.end) continue;
      if (c.start > cursor) out.push({ start: cursor, end: Math.min(c.start, b.end) });
      cursor = Math.max(cursor, c.end);
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out.filter((s) => s.end > s.start);
}

/** intersection of two merged interval sets. */
function intersect(a: Segment[], b: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return mergeSegments(out);
}

/** Metre ranges a supervisor reported for this task on a given date. */
function pulseSpansForTask(
  pulses: DailyPulse[],
  taskId: string,
  onDate?: string
): Segment[] {
  const spans: Segment[] = [];
  for (const p of pulses) {
    if (onDate && p.date !== onDate) continue;
    for (const e of p.entries) {
      if (e.taskId === taskId && e.fromM != null && e.toM != null) {
        spans.push({ start: e.fromM, end: e.toM });
      }
    }
  }
  return mergeSegments(spans);
}

/** Whether the most recent pulse touching this task reported a blocker. */
function taskBlocked(pulses: DailyPulse[], taskId: string): boolean {
  // pulses arrive newest-first from the store.
  for (const p of pulses) {
    if (p.entries.some((e) => e.taskId === taskId)) {
      return p.issueFlag !== 'none';
    }
  }
  return false;
}

function overlaysFor(
  spans: Segment[],
  state: RouteState,
  path: LatLng[],
  total: number,
  color = STATE_COLORS[state],
  dashed = false
): RouteOverlay[] {
  return spans.map((s) => ({
    path: sliceByFraction(path, s.start / total, s.end / total),
    color,
    state,
    dashed,
    fromM: Math.round(s.start),
    toM: Math.round(s.end),
    label: `${STATE_LABELS[state]}: ${Math.round(s.start)}–${Math.round(s.end)} m`,
  }));
}

/**
 * Build the colored overlays for one task, layered back-to-front:
 * base(gray) → awaiting/blocked gaps → completed(green) → today(blue) → HDD(dashed).
 */
export function buildRouteOverlays(
  project: Project,
  task: Task,
  pulses: DailyPulse[],
  todayISO: string
): RouteRender {
  const path = toLatLngPath(project.route);
  const total = project.totalLengthMeters;
  const full: Segment[] = [{ start: 0, end: total }];

  // Base: whole route as "not started" (drawn first, everything else on top).
  const overlays: RouteOverlay[] = overlaysFor(full, 'not_started', path, total);

  if (task.type === 'point') {
    return { overlays, workFrontM: null, todayMeters: 0, blocked: false };
  }

  const completed = clampSpans(task.segments ?? [], total);
  const workFrontM = completed.reduce((m, s) => Math.max(m, s.end), 0);
  const blocked = taskBlocked(pulses, task.id);

  // Interior uncovered stretches (before the work front) → awaiting or blocked.
  const beforeFront: Segment[] = workFrontM > 0 ? [{ start: 0, end: workFrontM }] : [];
  const gaps = subtract(beforeFront, completed);
  overlays.push(
    ...overlaysFor(gaps, blocked ? 'blocked' : 'awaiting', path, total)
  );

  // Today's work (blue) vs older completed (green).
  const today = intersect(completed, pulseSpansForTask(pulses, task.id, todayISO));
  const green = subtract(completed, today);
  overlays.push(...overlaysFor(green, 'completed', path, total));
  overlays.push(...overlaysFor(today, 'worked_today', path, total));

  // HDD (trenchless) as a dashed dark overlay on top.
  const hdd = clampSpans(task.hddSegments ?? [], total);
  overlays.push(
    ...hdd.map((s) => ({
      path: sliceByFraction(path, s.start / total, s.end / total),
      color: HDD_COLOR,
      state: 'completed' as RouteState,
      dashed: true,
      fromM: Math.round(s.start),
      toM: Math.round(s.end),
      label: `HDD (trenchless): ${Math.round(s.start)}–${Math.round(s.end)} m`,
    }))
  );

  const todayMeters = today.reduce((m, s) => m + (s.end - s.start), 0);
  return { overlays, workFrontM, todayMeters, blocked };
}
